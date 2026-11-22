-- MediSync business logic. Critical writes go through SECURITY DEFINER
-- functions that check the caller's role/clinic explicitly, so each
-- operation is a single transaction and cannot be bypassed from the client.

-- ── Caller helpers (security definer → no RLS recursion) ──────────────
create or replace function public.auth_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.auth_clinic_id()
returns uuid language sql stable security definer set search_path = public as $$
  select clinic_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff_of(p_clinic uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('doctor', 'compounder', 'admin') and clinic_id = p_clinic
  )
$$;

-- True when the patient has ever held a token at the caller's clinic.
create or replace function public.is_clinic_patient(p_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tokens t
    where t.patient_id = p_patient and t.clinic_id = public.auth_clinic_id()
  )
$$;

create or replace function public.can_view_prescription(p_rx uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.prescriptions p
    where p.id = p_rx and (p.patient_id = auth.uid() or public.is_staff_of(p.clinic_id))
  )
$$;

-- The assigned doctor, or a compounder/admin of the same clinic.
create or replace function public.can_manage_doctor_queue(p_doctor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.doctors d
    join public.profiles p on p.id = auth.uid()
    where d.id = p_doctor
      and (d.profile_id = auth.uid() or (p.role in ('compounder', 'admin') and p.clinic_id = d.clinic_id))
  )
$$;

create or replace function public.clinic_today(p_clinic uuid)
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.clinics where id = p_clinic), 'UTC'))::date
$$;

-- ── New auth user → patient profile. Self-signup can never pick a role.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Clients may edit their own profile but never role, clinic or email.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.role is distinct from old.role
       or new.clinic_id is distinct from old.clinic_id
       or new.email is distinct from old.email
       or new.id is distinct from old.id then
      raise exception 'You cannot change role, clinic or email' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ── Queue snapshot maintenance ────────────────────────────────────────
create or replace function public.refresh_queue_state(p_doctor uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_serving integer;
  v_waiting integer;
  v_last integer;
  v_clinic uuid;
begin
  select clinic_id into v_clinic from public.doctors where id = p_doctor;

  select token_number into v_serving
  from public.tokens
  where doctor_id = p_doctor and token_date = p_date and status in ('called', 'in_consultation')
  order by (status = 'in_consultation') desc, coalesce(called_at, created_at) desc
  limit 1;

  if v_serving is null then
    select max(token_number) into v_serving
    from public.tokens
    where doctor_id = p_doctor and token_date = p_date and status = 'completed';
  end if;

  select count(*) filter (where status = 'waiting'), coalesce(max(token_number), 0) into v_waiting, v_last
  from public.tokens
  where doctor_id = p_doctor and token_date = p_date;

  insert into public.queue_state as q (doctor_id, token_date, clinic_id, last_token_number, now_serving, waiting_count, updated_at)
  values (p_doctor, p_date, v_clinic, v_last, v_serving, v_waiting, now())
  on conflict (doctor_id, token_date) do update
    set now_serving = excluded.now_serving,
        waiting_count = excluded.waiting_count,
        last_token_number = greatest(q.last_token_number, excluded.last_token_number),
        updated_at = now();
end $$;

create or replace function public.tokens_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_queue_state(new.doctor_id, new.token_date);
  return null;
end $$;

create trigger tokens_refresh_queue_state
  after insert or update on public.tokens
  for each row execute function public.tokens_after_change();

-- ── Token booking (atomic numbering) ──────────────────────────────────
-- Patients book for themselves (online). Compounders/admins book walk-ins
-- for patients at their own clinic. The queue_state upsert takes a row lock,
-- so concurrent bookings for the same doctor/day get sequential numbers;
-- the unique constraints are a second line of defence.
create or replace function public.book_token(p_doctor_id uuid, p_patient_id uuid default null, p_reason text default null)
returns public.tokens language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_staff_clinic uuid;
  v_doctor public.doctors;
  v_date date;
  v_patient uuid;
  v_source text;
  v_number integer;
  v_existing integer;
  v_token public.tokens;
begin
  if v_uid is null then
    raise exception 'Please sign in to book a token' using errcode = '28000';
  end if;

  select role, clinic_id into v_role, v_staff_clinic from public.profiles where id = v_uid;

  select * into v_doctor from public.doctors where id = p_doctor_id and is_active;
  if not found then
    raise exception 'This doctor is not accepting tokens right now';
  end if;

  if v_role = 'patient' then
    v_patient := v_uid;
    v_source := 'online';
  elsif v_role in ('compounder', 'admin') then
    if v_staff_clinic is distinct from v_doctor.clinic_id then
      raise exception 'You can only book tokens at your own clinic' using errcode = '42501';
    end if;
    if p_patient_id is null then
      raise exception 'Select a patient for the walk-in token';
    end if;
    perform 1 from public.profiles where id = p_patient_id and role = 'patient';
    if not found then
      raise exception 'Patient not found';
    end if;
    v_patient := p_patient_id;
    v_source := 'walk_in';
  else
    raise exception 'Your role cannot book tokens' using errcode = '42501';
  end if;

  v_date := public.clinic_today(v_doctor.clinic_id);

  select token_number into v_existing
  from public.tokens
  where patient_id = v_patient and doctor_id = p_doctor_id and token_date = v_date
    and status in ('waiting', 'called', 'in_consultation');
  if found then
    raise exception 'An active token (#%) already exists for this patient with this doctor today', v_existing
      using errcode = '23505';
  end if;

  insert into public.queue_state as q (doctor_id, token_date, clinic_id, last_token_number)
  values (p_doctor_id, v_date, v_doctor.clinic_id, 1)
  on conflict (doctor_id, token_date) do update
    set last_token_number = q.last_token_number + 1, updated_at = now()
  returning q.last_token_number into v_number;

  insert into public.tokens (clinic_id, doctor_id, patient_id, token_date, token_number, source, reason, booked_by)
  values (v_doctor.clinic_id, p_doctor_id, v_patient, v_date, v_number, v_source,
          nullif(trim(left(coalesce(p_reason, ''), 500)), ''), v_uid)
  returning * into v_token;

  return v_token;
end $$;

-- ── Queue control ─────────────────────────────────────────────────────
-- Returns the newly called token, or null when nobody is waiting.
create or replace function public.call_next_token(p_doctor_id uuid)
returns public.tokens language plpgsql security definer set search_path = public as $$
declare
  v_doctor public.doctors;
  v_token public.tokens;
begin
  select * into v_doctor from public.doctors where id = p_doctor_id;
  if not found then
    raise exception 'Doctor not found';
  end if;
  if not public.can_manage_doctor_queue(p_doctor_id) then
    raise exception 'You cannot manage this queue' using errcode = '42501';
  end if;

  select * into v_token
  from public.tokens
  where doctor_id = p_doctor_id and token_date = public.clinic_today(v_doctor.clinic_id) and status = 'waiting'
  order by token_number
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update public.tokens
  set status = 'called', called_at = now(), updated_at = now()
  where id = v_token.id
  returning * into v_token;

  return v_token;
end $$;

create or replace function public.update_token_status(p_token_id uuid, p_status public.token_status)
returns public.tokens language plpgsql security definer set search_path = public as $$
declare
  v_token public.tokens;
  v_uid uuid := auth.uid();
  v_ok boolean;
begin
  select * into v_token from public.tokens where id = p_token_id for update;
  if not found then
    raise exception 'Token not found';
  end if;

  if public.can_manage_doctor_queue(v_token.doctor_id) then
    v_ok := (v_token.status = 'waiting' and p_status in ('called', 'in_consultation', 'cancelled'))
         or (v_token.status = 'called' and p_status in ('waiting', 'in_consultation', 'cancelled'))
         or (v_token.status = 'in_consultation' and p_status in ('completed'));
    if not v_ok then
      raise exception 'Cannot move a token from % to %', v_token.status, p_status;
    end if;
  elsif v_token.patient_id = v_uid then
    if p_status <> 'cancelled' or v_token.status not in ('waiting', 'called') then
      raise exception 'You can only cancel a token that is still waiting';
    end if;
  else
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  update public.tokens
  set status = p_status,
      called_at = case when p_status = 'called' then now() else called_at end,
      started_at = case when p_status = 'in_consultation' then coalesce(started_at, now()) else started_at end,
      completed_at = case when p_status in ('completed', 'cancelled') then now() else completed_at end,
      updated_at = now()
  where id = p_token_id
  returning * into v_token;

  return v_token;
end $$;

-- Queue position for a single token, without exposing other patients.
create or replace function public.get_queue_position(p_token_id uuid)
returns table (
  token_id uuid,
  token_number integer,
  status public.token_status,
  now_serving integer,
  tokens_ahead integer,
  est_wait_minutes integer,
  doctor_id uuid,
  token_date date
) language plpgsql stable security definer set search_path = public as $$
declare
  v_token public.tokens;
  v_ahead integer;
  v_busy boolean;
  v_avg integer;
  v_serving integer;
begin
  select * into v_token from public.tokens where id = p_token_id;
  if not found or (v_token.patient_id is distinct from auth.uid() and not public.is_staff_of(v_token.clinic_id)) then
    raise exception 'Token not found';
  end if;

  select count(*) into v_ahead
  from public.tokens t
  where t.doctor_id = v_token.doctor_id and t.token_date = v_token.token_date
    and t.status in ('waiting', 'called') and t.token_number < v_token.token_number;

  select exists (
    select 1 from public.tokens t
    where t.doctor_id = v_token.doctor_id and t.token_date = v_token.token_date and t.status = 'in_consultation'
  ) into v_busy;

  select avg_consult_minutes into v_avg from public.clinics where id = v_token.clinic_id;
  select q.now_serving into v_serving from public.queue_state q
  where q.doctor_id = v_token.doctor_id and q.token_date = v_token.token_date;

  return query select
    v_token.id,
    v_token.token_number,
    v_token.status,
    v_serving,
    case when v_token.status in ('waiting', 'called') then v_ahead else 0 end,
    case when v_token.status = 'waiting' then (v_ahead + case when v_busy then 1 else 0 end) * coalesce(v_avg, 10) else 0 end,
    v_token.doctor_id,
    v_token.token_date;
end $$;

-- ── Consultation ──────────────────────────────────────────────────────
create or replace function public.start_consultation(p_token_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_token public.tokens;
  v_doctor_profile uuid;
  v_id uuid;
begin
  select * into v_token from public.tokens where id = p_token_id for update;
  if not found then
    raise exception 'Token not found';
  end if;
  select profile_id into v_doctor_profile from public.doctors where id = v_token.doctor_id;
  if v_doctor_profile is distinct from auth.uid() then
    raise exception 'Only the assigned doctor can start this consultation' using errcode = '42501';
  end if;
  if v_token.status not in ('waiting', 'called', 'in_consultation') then
    raise exception 'This token is already %', v_token.status;
  end if;

  if v_token.status <> 'in_consultation' then
    update public.tokens
    set status = 'in_consultation',
        called_at = coalesce(called_at, now()),
        started_at = coalesce(started_at, now()),
        updated_at = now()
    where id = p_token_id;
  end if;

  insert into public.consultations (token_id, clinic_id, doctor_id, patient_id)
  values (v_token.id, v_token.clinic_id, v_token.doctor_id, v_token.patient_id)
  on conflict (token_id) do nothing;

  select id into v_id from public.consultations where token_id = p_token_id;
  return v_id;
end $$;

-- Saves diagnosis + prescription and closes the token in one transaction.
-- p_items: [{medicine_name, dosage, frequency, duration, instructions, quantity}]
-- Returns the prescription id (null when no medicines were prescribed).
create or replace function public.complete_consultation(
  p_token_id uuid,
  p_diagnosis text,
  p_notes text default null,
  p_advice text default null,
  p_follow_up date default null,
  p_items jsonb default '[]'::jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_token public.tokens;
  v_doctor_profile uuid;
  v_consultation uuid;
  v_rx uuid;
  v_count integer;
begin
  select * into v_token from public.tokens where id = p_token_id for update;
  if not found then
    raise exception 'Token not found';
  end if;
  select profile_id into v_doctor_profile from public.doctors where id = v_token.doctor_id;
  if v_doctor_profile is distinct from auth.uid() then
    raise exception 'Only the assigned doctor can complete this consultation' using errcode = '42501';
  end if;
  if v_token.status <> 'in_consultation' then
    raise exception 'Start the consultation before saving it (token is %)', v_token.status;
  end if;
  if coalesce(trim(p_diagnosis), '') = '' then
    raise exception 'Diagnosis is required';
  end if;

  insert into public.consultations (token_id, clinic_id, doctor_id, patient_id)
  values (v_token.id, v_token.clinic_id, v_token.doctor_id, v_token.patient_id)
  on conflict (token_id) do nothing;

  update public.consultations
  set diagnosis = trim(p_diagnosis),
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      completed_at = now()
  where token_id = p_token_id
  returning id into v_consultation;

  if jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
    insert into public.prescriptions (consultation_id, clinic_id, doctor_id, patient_id, advice, follow_up_date)
    values (v_consultation, v_token.clinic_id, v_token.doctor_id, v_token.patient_id,
            nullif(trim(coalesce(p_advice, '')), ''), p_follow_up)
    returning id into v_rx;

    insert into public.prescription_items
      (prescription_id, medicine_id, medicine_name, dosage, frequency, duration, instructions, quantity, position)
    select
      v_rx,
      (select m.id from public.medicines m
        where m.clinic_id = v_token.clinic_id and lower(m.name) = lower(trim(i ->> 'medicine_name'))
        limit 1),
      trim(i ->> 'medicine_name'),
      coalesce(trim(i ->> 'dosage'), ''),
      coalesce(trim(i ->> 'frequency'), ''),
      coalesce(trim(i ->> 'duration'), ''),
      nullif(trim(coalesce(i ->> 'instructions', '')), ''),
      greatest(coalesce((i ->> 'quantity')::integer, 1), 1),
      ord::integer
    from jsonb_array_elements(p_items) with ordinality as t(i, ord)
    where coalesce(trim(i ->> 'medicine_name'), '') <> '';

    get diagnostics v_count = row_count;
    if v_count = 0 then
      delete from public.prescriptions where id = v_rx;
      v_rx := null;
    end if;
  end if;

  update public.tokens
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = p_token_id;

  return v_rx;
end $$;

-- ── Dispensing ────────────────────────────────────────────────────────
create or replace function public.recompute_prescription_status(p_rx uuid)
returns public.prescription_status language plpgsql security definer set search_path = public as $$
declare
  v_total integer;
  v_disp integer;
  v_unavail integer;
  v_pending integer;
  v_status public.prescription_status;
begin
  select count(*),
         count(*) filter (where status = 'dispensed'),
         count(*) filter (where status = 'unavailable'),
         count(*) filter (where status = 'pending')
  into v_total, v_disp, v_unavail, v_pending
  from public.prescription_items where prescription_id = p_rx;

  v_status := case
    when v_total > 0 and v_disp = v_total then 'dispensed'
    when v_total > 0 and v_disp + v_unavail = v_total then 'partially_dispensed'
    when v_pending < v_total then 'in_progress'
    else 'sent'
  end;

  update public.prescriptions set status = v_status, updated_at = now() where id = p_rx;
  return v_status;
end $$;

create or replace function public.can_dispense(p_rx uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.prescriptions p
    join public.profiles me on me.id = auth.uid()
    where p.id = p_rx and me.role in ('compounder', 'admin') and me.clinic_id = p.clinic_id
  )
$$;

create or replace function public.set_item_availability(p_item_id uuid, p_available boolean)
returns public.prescription_items language plpgsql security definer set search_path = public as $$
declare
  v_item public.prescription_items;
begin
  select * into v_item from public.prescription_items where id = p_item_id for update;
  if not found then
    raise exception 'Prescription item not found';
  end if;
  if not public.can_dispense(v_item.prescription_id) then
    raise exception 'Only the clinic compounder can update medicine availability' using errcode = '42501';
  end if;
  if v_item.status = 'dispensed' then
    raise exception 'This medicine has already been dispensed';
  end if;

  update public.prescription_items
  set status = case when p_available then 'available'::public.item_status else 'unavailable'::public.item_status end,
      updated_at = now()
  where id = p_item_id
  returning * into v_item;

  insert into public.dispensing_records (prescription_id, prescription_item_id, medicine_id, action, quantity, performed_by)
  values (v_item.prescription_id, v_item.id, v_item.medicine_id,
          case when p_available then 'marked_available' else 'marked_unavailable' end, 0, auth.uid());

  perform public.recompute_prescription_status(v_item.prescription_id);
  return v_item;
end $$;

-- Dispenses the selected items, decrementing stock atomically. Items with no
-- inventory match or insufficient stock are marked unavailable instead.
create or replace function public.dispense_items(p_prescription_id uuid, p_item_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_item public.prescription_items;
  v_dispensed integer := 0;
  v_unavailable integer := 0;
  v_status public.prescription_status;
begin
  if not public.can_dispense(p_prescription_id) then
    raise exception 'Only the clinic compounder can dispense medicines' using errcode = '42501';
  end if;

  for v_item in
    select * from public.prescription_items
    where prescription_id = p_prescription_id and id = any (p_item_ids) and status in ('pending', 'available')
    order by position
    for update
  loop
    if v_item.medicine_id is not null then
      update public.medicines
      set stock_qty = stock_qty - v_item.quantity, updated_at = now()
      where id = v_item.medicine_id and stock_qty >= v_item.quantity;
    end if;

    if v_item.medicine_id is not null and found then
      update public.prescription_items set status = 'dispensed', updated_at = now() where id = v_item.id;
      insert into public.dispensing_records (prescription_id, prescription_item_id, medicine_id, action, quantity, performed_by)
      values (p_prescription_id, v_item.id, v_item.medicine_id, 'dispensed', v_item.quantity, auth.uid());
      v_dispensed := v_dispensed + 1;
    else
      update public.prescription_items set status = 'unavailable', updated_at = now() where id = v_item.id;
      insert into public.dispensing_records (prescription_id, prescription_item_id, medicine_id, action, quantity, performed_by)
      values (p_prescription_id, v_item.id, v_item.medicine_id, 'marked_unavailable', 0, auth.uid());
      v_unavailable := v_unavailable + 1;
    end if;
  end loop;

  v_status := public.recompute_prescription_status(p_prescription_id);
  return jsonb_build_object('dispensed', v_dispensed, 'unavailable', v_unavailable, 'status', v_status);
end $$;

-- ── Admin: assign a registered user to this clinic with a role ────────
create or replace function public.admin_assign_staff(p_email text, p_role public.app_role, p_specialty text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid;
  v_target public.profiles;
begin
  if public.auth_role() is distinct from 'admin' then
    raise exception 'Only admins can manage staff' using errcode = '42501';
  end if;
  v_clinic := public.auth_clinic_id();
  if v_clinic is null then
    raise exception 'Your admin account is not linked to a clinic';
  end if;

  select * into v_target from public.profiles where lower(email) = lower(trim(p_email));
  if not found then
    raise exception 'No MediSync account uses that email. Ask them to register first.';
  end if;
  if v_target.id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;
  if v_target.role <> 'patient' and v_target.clinic_id is distinct from v_clinic then
    raise exception 'That user is staff at another clinic' using errcode = '42501';
  end if;

  update public.profiles
  set role = p_role,
      clinic_id = case when p_role = 'patient' then null else v_clinic end
  where id = v_target.id;

  if p_role = 'doctor' then
    insert into public.doctors (profile_id, clinic_id, display_name, specialty)
    values (v_target.id, v_clinic,
            case when v_target.full_name ilike 'dr%' then v_target.full_name else 'Dr. ' || v_target.full_name end,
            coalesce(nullif(trim(p_specialty), ''), 'General Physician'))
    on conflict (profile_id) do update
      set clinic_id = excluded.clinic_id,
          is_active = true,
          specialty = coalesce(nullif(trim(p_specialty), ''), public.doctors.specialty);
  else
    update public.doctors set is_active = false where profile_id = v_target.id;
  end if;

  return v_target.id;
end $$;

-- ── Inventory: atomic stock adjustment (never below zero) ─────────────
create or replace function public.adjust_stock(p_medicine_id uuid, p_delta integer)
returns public.medicines language plpgsql security definer set search_path = public as $$
declare
  v_med public.medicines;
begin
  select * into v_med from public.medicines where id = p_medicine_id for update;
  if not found then
    raise exception 'Medicine not found';
  end if;
  if public.auth_role() not in ('compounder', 'admin') or public.auth_clinic_id() is distinct from v_med.clinic_id then
    raise exception 'Only clinic compounders and admins can change stock' using errcode = '42501';
  end if;
  update public.medicines
  set stock_qty = greatest(0, stock_qty + p_delta), updated_at = now()
  where id = p_medicine_id
  returning * into v_med;
  return v_med;
end $$;
