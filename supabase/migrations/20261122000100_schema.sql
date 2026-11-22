-- MediSync core schema
-- Roles: patient, doctor, compounder (absorbs receptionist duties), admin.

create type public.app_role as enum ('patient', 'doctor', 'compounder', 'admin');
create type public.token_status as enum ('waiting', 'called', 'in_consultation', 'completed', 'cancelled');
create type public.prescription_status as enum ('sent', 'in_progress', 'partially_dispensed', 'dispensed');
create type public.item_status as enum ('pending', 'available', 'unavailable', 'dispensed');

-- ── Clinics ───────────────────────────────────────────────────────────
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  address text not null default '',
  city text not null default '',
  phone text,
  opening_hours text,
  latitude double precision,
  longitude double precision,
  timezone text not null default 'Asia/Kolkata',
  avg_consult_minutes integer not null default 10 check (avg_consult_minutes between 1 and 120),
  created_at timestamptz not null default now()
);

-- ── Profiles (1:1 with auth.users) ────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  role public.app_role not null default 'patient',
  clinic_id uuid references public.clinics (id) on delete set null,
  phone text,
  date_of_birth date,
  gender text,
  blood_group text,
  allergies text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_clinic_idx on public.profiles (clinic_id);
create index profiles_role_idx on public.profiles (role);

-- ── Doctors (public directory info; links a doctor profile to a clinic)
create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  display_name text not null,
  specialty text not null default 'General Physician',
  qualification text,
  room text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index doctors_clinic_idx on public.doctors (clinic_id);

-- ── Queue state: one row per doctor per day. Holds the atomic token
-- counter and the public (PII-free) "now serving" snapshot.
create table public.queue_state (
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  token_date date not null,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  last_token_number integer not null default 0,
  now_serving integer,
  waiting_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (doctor_id, token_date)
);

-- ── Tokens (queue entries) ────────────────────────────────────────────
create table public.tokens (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  token_date date not null,
  token_number integer not null check (token_number > 0),
  status public.token_status not null default 'waiting',
  source text not null default 'online' check (source in ('online', 'walk_in')),
  reason text,
  booked_by uuid references public.profiles (id) on delete set null,
  called_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, token_date, token_number)
);
-- A patient can hold only one active token per doctor per day.
create unique index tokens_one_active_per_patient
  on public.tokens (patient_id, doctor_id, token_date)
  where status in ('waiting', 'called', 'in_consultation');
create index tokens_patient_idx on public.tokens (patient_id, created_at desc);
create index tokens_clinic_date_idx on public.tokens (clinic_id, token_date);
create index tokens_doctor_date_status_idx on public.tokens (doctor_id, token_date, status);

-- ── Consultations ─────────────────────────────────────────────────────
create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null unique references public.tokens (id) on delete cascade,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  diagnosis text,
  notes text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index consultations_patient_idx on public.consultations (patient_id, started_at desc);

-- ── Medicines (clinic inventory) ──────────────────────────────────────
create table public.medicines (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  generic_name text,
  form text,
  strength text,
  stock_qty integer not null default 0 check (stock_qty >= 0),
  unit text not null default 'units',
  reorder_level integer not null default 10 check (reorder_level >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index medicines_clinic_name_uq on public.medicines (clinic_id, lower(name));

-- ── Prescriptions ─────────────────────────────────────────────────────
create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null unique references public.consultations (id) on delete cascade,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  status public.prescription_status not null default 'sent',
  advice text,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prescriptions_clinic_status_idx on public.prescriptions (clinic_id, status, created_at desc);
create index prescriptions_patient_idx on public.prescriptions (patient_id, created_at desc);

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id) on delete cascade,
  medicine_id uuid references public.medicines (id) on delete set null,
  medicine_name text not null,
  dosage text not null default '',
  frequency text not null default '',
  duration text not null default '',
  instructions text,
  quantity integer not null default 1 check (quantity > 0),
  status public.item_status not null default 'pending',
  position integer not null default 0,
  updated_at timestamptz not null default now()
);
create index prescription_items_rx_idx on public.prescription_items (prescription_id);

-- ── Dispensing audit trail (medicine-level) ───────────────────────────
create table public.dispensing_records (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions (id) on delete cascade,
  prescription_item_id uuid not null references public.prescription_items (id) on delete cascade,
  medicine_id uuid references public.medicines (id) on delete set null,
  action text not null check (action in ('dispensed', 'marked_available', 'marked_unavailable')),
  quantity integer not null default 0,
  performed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index dispensing_records_rx_idx on public.dispensing_records (prescription_id);
