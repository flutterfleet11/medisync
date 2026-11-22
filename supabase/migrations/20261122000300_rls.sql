-- Row Level Security. Reads are policy-gated; workflow writes (tokens,
-- consultations, prescriptions, dispensing) have NO direct write policies and
-- happen only through the SECURITY DEFINER functions in the previous migration.

alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.doctors enable row level security;
alter table public.queue_state enable row level security;
alter table public.tokens enable row level security;
alter table public.consultations enable row level security;
alter table public.medicines enable row level security;
alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
alter table public.dispensing_records enable row level security;

-- Clinics: public directory; admins edit their own clinic.
create policy clinics_read on public.clinics
  for select to anon, authenticated using (true);
create policy clinics_admin_update on public.clinics
  for update to authenticated
  using (public.auth_role() = 'admin' and id = public.auth_clinic_id())
  with check (public.auth_role() = 'admin' and id = public.auth_clinic_id());

-- Profiles: self; compounder/admin see patients + own-clinic staff;
-- doctors see own-clinic staff and patients who visited their clinic.
create policy profiles_read on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or (public.auth_role() in ('compounder', 'admin') and (role = 'patient' or clinic_id = public.auth_clinic_id()))
    or (public.auth_role() = 'doctor' and (clinic_id = public.auth_clinic_id() or public.is_clinic_patient(id)))
  );
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Doctors: public directory; admins edit doctors at their clinic.
create policy doctors_read on public.doctors
  for select to anon, authenticated using (true);
create policy doctors_admin_update on public.doctors
  for update to authenticated
  using (public.auth_role() = 'admin' and clinic_id = public.auth_clinic_id())
  with check (public.auth_role() = 'admin' and clinic_id = public.auth_clinic_id());

-- Queue snapshot has no patient data: readable by everyone (drives live boards).
create policy queue_state_read on public.queue_state
  for select to anon, authenticated using (true);

-- Tokens: the patient, or staff of that clinic.
create policy tokens_read on public.tokens
  for select to authenticated using (patient_id = auth.uid() or public.is_staff_of(clinic_id));

-- Consultations (diagnosis): the patient, or doctors/admins of that clinic.
create policy consultations_read on public.consultations
  for select to authenticated using (
    patient_id = auth.uid()
    or (public.auth_role() in ('doctor', 'admin') and clinic_id = public.auth_clinic_id())
  );

-- Prescriptions: the patient, or staff of that clinic.
create policy prescriptions_read on public.prescriptions
  for select to authenticated using (patient_id = auth.uid() or public.is_staff_of(clinic_id));
create policy prescription_items_read on public.prescription_items
  for select to authenticated using (public.can_view_prescription(prescription_id));

-- Inventory: staff of the clinic read; compounder/admin write.
create policy medicines_read on public.medicines
  for select to authenticated using (public.is_staff_of(clinic_id));
create policy medicines_insert on public.medicines
  for insert to authenticated
  with check (public.auth_role() in ('compounder', 'admin') and clinic_id = public.auth_clinic_id());
create policy medicines_update on public.medicines
  for update to authenticated
  using (public.auth_role() in ('compounder', 'admin') and clinic_id = public.auth_clinic_id())
  with check (public.auth_role() in ('compounder', 'admin') and clinic_id = public.auth_clinic_id());
create policy medicines_delete on public.medicines
  for delete to authenticated
  using (public.auth_role() in ('compounder', 'admin') and clinic_id = public.auth_clinic_id());

-- Dispensing audit: clinic staff only.
create policy dispensing_records_read on public.dispensing_records
  for select to authenticated using (
    exists (select 1 from public.prescriptions p where p.id = prescription_id and public.is_staff_of(p.clinic_id))
  );

-- ── Grants (explicit, in case the project does not auto-expose tables) ─
grant usage on schema public to anon, authenticated, service_role;
grant select on public.clinics, public.doctors, public.queue_state to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.refresh_queue_state(uuid, date) from public, anon, authenticated;
revoke execute on function public.recompute_prescription_status(uuid) from public, anon, authenticated;

-- ── Realtime (Supabase Realtime fallback transport) ───────────────────
-- postgres_changes respects RLS, so subscribers only receive rows they can read.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table public.queue_state, public.tokens, public.prescriptions, public.prescription_items;
  end if;
end $$;
