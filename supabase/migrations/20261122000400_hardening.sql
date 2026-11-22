-- Critic-pass hardening (2026-11-22)

-- ── H1: staff no longer read every patient on the platform ────────────
-- Staff see their own clinic's staff + patients who have visited their clinic.
-- Walk-in lookup of other patients goes through search_patients() (masked).
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or (
      public.auth_role() in ('doctor', 'compounder', 'admin')
      and (clinic_id = public.auth_clinic_id() or (role = 'patient' and public.is_clinic_patient(id)))
    )
  );

-- Front-desk patient search: fuzzy name/phone match only among this clinic's
-- patients; anyone else requires an exact email or full phone number.
create or replace function public.search_patients(p_query text)
returns table (
  id uuid,
  full_name text,
  phone_masked text,
  gender text,
  date_of_birth date,
  is_walk_in boolean,
  visited_clinic boolean
) language plpgsql stable security definer set search_path = public as $$
declare
  q text := trim(coalesce(p_query, ''));
  q_digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
begin
  if public.auth_role() is null or public.auth_role() not in ('compounder', 'admin') then
    raise exception 'Only front-desk staff can search patients' using errcode = '42501';
  end if;
  if length(q) < 2 then
    return;
  end if;
  return query
  select p.id,
         p.full_name,
         case when p.phone is null then null
              else repeat('•', greatest(length(regexp_replace(p.phone, '\D', '', 'g')) - 4, 0)) || right(regexp_replace(p.phone, '\D', '', 'g'), 4)
         end,
         p.gender,
         p.date_of_birth,
         coalesce(p.email, '') like '%@walkin.medisync.local',
         public.is_clinic_patient(p.id)
  from public.profiles p
  where p.role = 'patient'
    and (
      (public.is_clinic_patient(p.id) and (p.full_name ilike '%' || q || '%' or (length(q_digits) >= 4 and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') like '%' || q_digits || '%')))
      or lower(coalesce(p.email, '')) = lower(q)
      or (length(q_digits) >= 8 and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') like '%' || q_digits)
    )
  order by p.full_name
  limit 8;
end $$;

-- ── M4: coherent queue states ─────────────────────────────────────────
-- Only one patient may be "called" per doctor at a time.
create or replace function public.call_next_token(p_doctor_id uuid)
returns public.tokens language plpgsql security definer set search_path = public as $$
declare
  v_doctor public.doctors;
  v_token public.tokens;
  v_existing integer;
begin
  select * into v_doctor from public.doctors where id = p_doctor_id;
  if not found then
    raise exception 'Doctor not found';
  end if;
  if not public.can_manage_doctor_queue(p_doctor_id) then
    raise exception 'You cannot manage this queue' using errcode = '42501';
  end if;

  select token_number into v_existing
  from public.tokens
  where doctor_id = p_doctor_id and token_date = public.clinic_today(v_doctor.clinic_id) and status = 'called'
  limit 1;
  if found then
    raise exception 'Token #% is already called — start their consultation, or move them back to waiting first', v_existing;
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

-- One consultation at a time per doctor; starting someone else returns any
-- other "called" patient to the waiting list (keeps their place).
create or replace function public.start_consultation(p_token_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_token public.tokens;
  v_doctor_profile uuid;
  v_busy integer;
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
    select token_number into v_busy
    from public.tokens
    where doctor_id = v_token.doctor_id and token_date = v_token.token_date
      and status = 'in_consultation' and id <> v_token.id
    limit 1;
    if found then
      raise exception 'Finish the consultation for token #% first', v_busy;
    end if;

    update public.tokens
    set status = 'waiting', updated_at = now()
    where doctor_id = v_token.doctor_id and token_date = v_token.token_date
      and status = 'called' and id <> v_token.id;

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

-- Only the assigned doctor may complete an in-consultation token, so front
-- desk can't close a visit while the doctor is still writing the prescription.
create or replace function public.update_token_status(p_token_id uuid, p_status public.token_status)
returns public.tokens language plpgsql security definer set search_path = public as $$
declare
  v_token public.tokens;
  v_uid uuid := auth.uid();
  v_ok boolean;
  v_is_doctor boolean;
begin
  select * into v_token from public.tokens where id = p_token_id for update;
  if not found then
    raise exception 'Token not found';
  end if;
  select (profile_id = v_uid) into v_is_doctor from public.doctors where id = v_token.doctor_id;

  if public.can_manage_doctor_queue(v_token.doctor_id) then
    v_ok := (v_token.status = 'waiting' and p_status in ('called', 'cancelled'))
         or (v_token.status = 'called' and p_status in ('waiting', 'cancelled'))
         or (v_token.status = 'in_consultation' and p_status = 'completed' and coalesce(v_is_doctor, false));
    if not v_ok then
      if v_token.status = 'in_consultation' then
        raise exception 'Only the doctor can complete a consultation in progress';
      end if;
      raise exception 'Cannot move a token from % to %', v_token.status, p_status;
    end if;
    if p_status = 'called' and exists (
      select 1 from public.tokens
      where doctor_id = v_token.doctor_id and token_date = v_token.token_date and status = 'called' and id <> v_token.id
    ) then
      raise exception 'Another patient is already called for this doctor — move them back to waiting first';
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
      completed_at = case when p_status in ('completed', 'cancelled') then now() else completed_at end,
      updated_at = now()
  where id = p_token_id
  returning * into v_token;

  return v_token;
end $$;

grant execute on function public.search_patients(text) to authenticated;
revoke execute on function public.search_patients(text) from anon;
