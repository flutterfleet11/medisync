-- Additive only: doctors manage their own professional details (degrees,
-- specialty). No existing data is modified.
create or replace function public.update_my_doctor_details(p_qualification text, p_specialty text)
returns public.doctors language plpgsql security definer set search_path = public as $$
declare
  v_doc public.doctors;
begin
  select * into v_doc from public.doctors where profile_id = auth.uid();
  if not found then
    raise exception 'Your account is not set up as a doctor yet' using errcode = '42501';
  end if;
  if length(coalesce(p_qualification, '')) > 200 then
    raise exception 'Degrees are too long (max 200 characters)';
  end if;
  if length(trim(coalesce(p_specialty, ''))) < 2 or length(p_specialty) > 80 then
    raise exception 'Specialty must be 2–80 characters';
  end if;

  update public.doctors
  set qualification = nullif(trim(p_qualification), ''),
      specialty = trim(p_specialty)
  where id = v_doc.id
  returning * into v_doc;
  return v_doc;
end $$;

grant execute on function public.update_my_doctor_details(text, text) to authenticated;
revoke execute on function public.update_my_doctor_details(text, text) from anon;
