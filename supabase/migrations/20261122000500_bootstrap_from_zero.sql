-- Start-from-zero support: an admin with no clinic can create one; unassigned
-- staff accounts can be assigned; doctor display names follow profile edits.

-- Admin creates their clinic (only when not already linked to one).
create or replace function public.admin_create_clinic(
  p_name text,
  p_address text default '',
  p_city text default '',
  p_phone text default null,
  p_opening_hours text default null,
  p_avg_consult_minutes integer default 10,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_description text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if public.auth_role() is distinct from 'admin' then
    raise exception 'Only admins can create a clinic' using errcode = '42501';
  end if;
  if public.auth_clinic_id() is not null then
    raise exception 'Your account already manages a clinic';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Clinic name is required';
  end if;

  insert into public.clinics (name, address, city, phone, opening_hours, avg_consult_minutes, latitude, longitude, description)
  values (
    trim(p_name),
    trim(coalesce(p_address, '')),
    trim(coalesce(p_city, '')),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_opening_hours, '')), ''),
    least(greatest(coalesce(p_avg_consult_minutes, 10), 1), 120),
    p_latitude,
    p_longitude,
    nullif(trim(coalesce(p_description, '')), '')
  )
  returning id into v_id;

  update public.profiles set clinic_id = v_id where id = auth.uid();
  return v_id;
end $$;

grant execute on function public.admin_create_clinic(text, text, text, text, text, integer, double precision, double precision, text) to authenticated;
revoke execute on function public.admin_create_clinic(text, text, text, text, text, integer, double precision, double precision, text) from anon;

-- Same as before, but staff accounts not yet linked to any clinic can be assigned.
create or replace function public.admin_assign_staff(p_email text, p_role public.app_role, p_specialty text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid;
  v_target public.profiles;
  v_name text;
begin
  if public.auth_role() is distinct from 'admin' then
    raise exception 'Only admins can manage staff' using errcode = '42501';
  end if;
  v_clinic := public.auth_clinic_id();
  if v_clinic is null then
    raise exception 'Create your clinic first';
  end if;

  select * into v_target from public.profiles where lower(email) = lower(trim(p_email));
  if not found then
    raise exception 'No MediSync account uses that email. Ask them to register first.';
  end if;
  if v_target.id = auth.uid() then
    raise exception 'You cannot change your own role';
  end if;
  if v_target.role <> 'patient' and v_target.clinic_id is not null and v_target.clinic_id <> v_clinic then
    raise exception 'That user is staff at another clinic' using errcode = '42501';
  end if;

  update public.profiles
  set role = p_role,
      clinic_id = case when p_role = 'patient' then null else v_clinic end
  where id = v_target.id;

  v_name := coalesce(nullif(trim(v_target.full_name), ''), split_part(coalesce(v_target.email, 'Doctor'), '@', 1));
  if p_role = 'doctor' then
    insert into public.doctors (profile_id, clinic_id, display_name, specialty)
    values (v_target.id, v_clinic,
            case when v_name ilike 'dr%' then v_name else 'Dr. ' || v_name end,
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

-- Doctor's public display name follows their profile name.
create or replace function public.sync_doctor_display_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.full_name is distinct from old.full_name and length(trim(new.full_name)) > 0 then
    update public.doctors
    set display_name = case when new.full_name ilike 'dr%' then trim(new.full_name) else 'Dr. ' || trim(new.full_name) end
    where profile_id = new.id;
  end if;
  return new;
end $$;

create trigger profiles_sync_doctor_name
  after update of full_name on public.profiles
  for each row execute function public.sync_doctor_display_name();

revoke execute on function public.sync_doctor_display_name() from public, anon, authenticated;
