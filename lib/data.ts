import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/format";
import type {
  Clinic,
  Consultation,
  Doctor,
  Medicine,
  Prescription,
  PrescriptionItem,
  Profile,
  QueuePosition,
  QueueState,
  Token,
} from "@/lib/types";

// Server-side read helpers. Every query uses the caller's session, so RLS
// decides what comes back — these helpers never widen access.

type PatientLite = Pick<Profile, "id" | "full_name" | "phone" | "date_of_birth" | "gender" | "allergies" | "blood_group">;
type DoctorLite = Pick<Doctor, "id" | "display_name" | "specialty" | "room" | "qualification">;
type ClinicLite = Pick<Clinic, "id" | "name" | "address" | "city" | "phone" | "latitude" | "longitude">;

export type TokenWithPatient = Token & { patient: PatientLite | null };
export type TokenWithDoctor = Token & { doctor: DoctorLite | null; clinic: ClinicLite | null };
export type RxSummary = Prescription & {
  doctor: DoctorLite | null;
  clinic: ClinicLite | null;
  patient: Pick<Profile, "id" | "full_name"> | null;
  items: PrescriptionItem[];
};
export type RxDetail = RxSummary & {
  consultation: Pick<Consultation, "id" | "diagnosis" | "notes" | "started_at" | "completed_at"> | null;
};

const PATIENT_COLS = "id, full_name, phone, date_of_birth, gender, allergies, blood_group";
const RX_SELECT = `*,
  doctor:doctors(id, display_name, specialty, room, qualification),
  clinic:clinics(id, name, address, city, phone, latitude, longitude),
  patient:profiles!prescriptions_patient_id_fkey(id, full_name),
  items:prescription_items(*)`;

function sortItems<T extends { items: PrescriptionItem[] }>(rx: T): T {
  rx.items = [...(rx.items ?? [])].sort((a, b) => a.position - b.position);
  return rx;
}

export async function listClinics(search?: string): Promise<Clinic[]> {
  const supabase = await createClient();
  let q = supabase.from("clinics").select("*").order("name");
  const s = search?.trim().replace(/[%,()]/g, " ");
  if (s) q = q.or(`name.ilike.%${s}%,city.ilike.%${s}%,address.ilike.%${s}%,description.ilike.%${s}%`);
  const { data } = await q.limit(50);
  return (data ?? []) as Clinic[];
}

export async function getClinic(id: string): Promise<Clinic | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("clinics").select("*").eq("id", id).maybeSingle();
  return (data as Clinic) ?? null;
}

export async function listDoctors(clinicId: string, onlyActive = true): Promise<Doctor[]> {
  const supabase = await createClient();
  let q = supabase.from("doctors").select("*").eq("clinic_id", clinicId).order("display_name");
  if (onlyActive) q = q.eq("is_active", true);
  const { data } = await q;
  return (data ?? []) as Doctor[];
}

export async function getQueueStates(clinic: Pick<Clinic, "id" | "timezone">): Promise<Record<string, QueueState>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("queue_state")
    .select("*")
    .eq("clinic_id", clinic.id)
    .eq("token_date", todayIn(clinic.timezone));
  const map: Record<string, QueueState> = {};
  for (const row of (data ?? []) as QueueState[]) map[row.doctor_id] = row;
  return map;
}

/** Today's tokens for one doctor (staff view, includes patient details via RLS). */
export async function getDoctorQueue(doctorId: string, timezone: string): Promise<TokenWithPatient[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tokens")
    .select(`*, patient:profiles!tokens_patient_id_fkey(${PATIENT_COLS})`)
    .eq("doctor_id", doctorId)
    .eq("token_date", todayIn(timezone))
    .order("token_number");
  return (data ?? []) as TokenWithPatient[];
}

export async function getClinicQueue(clinic: Pick<Clinic, "id" | "timezone">): Promise<TokenWithPatient[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tokens")
    .select(`*, patient:profiles!tokens_patient_id_fkey(${PATIENT_COLS})`)
    .eq("clinic_id", clinic.id)
    .eq("token_date", todayIn(clinic.timezone))
    .order("token_number");
  return (data ?? []) as TokenWithPatient[];
}

export async function getTokenWithPatient(tokenId: string): Promise<TokenWithPatient | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tokens")
    .select(`*, patient:profiles!tokens_patient_id_fkey(${PATIENT_COLS})`)
    .eq("id", tokenId)
    .maybeSingle();
  return (data as TokenWithPatient) ?? null;
}

export async function listPatientTokens(patientId: string, limit = 20): Promise<TokenWithDoctor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tokens")
    .select("*, doctor:doctors(id, display_name, specialty, room, qualification), clinic:clinics(id, name, address, city, phone, latitude, longitude)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as TokenWithDoctor[];
}

export async function getTokenForPatient(tokenId: string): Promise<TokenWithDoctor | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tokens")
    .select("*, doctor:doctors(id, display_name, specialty, room, qualification), clinic:clinics(id, name, address, city, phone, latitude, longitude)")
    .eq("id", tokenId)
    .maybeSingle();
  return (data as TokenWithDoctor) ?? null;
}

export async function getQueuePosition(tokenId: string): Promise<QueuePosition | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_queue_position", { p_token_id: tokenId });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as QueuePosition) ?? null;
}

export async function listPrescriptions(filter: { patientId?: string; clinicId?: string; statuses?: string[]; limit?: number }): Promise<RxSummary[]> {
  const supabase = await createClient();
  let q = supabase.from("prescriptions").select(RX_SELECT).order("created_at", { ascending: false });
  if (filter.patientId) q = q.eq("patient_id", filter.patientId);
  if (filter.clinicId) q = q.eq("clinic_id", filter.clinicId);
  if (filter.statuses?.length) q = q.in("status", filter.statuses);
  const { data } = await q.limit(filter.limit ?? 50);
  return ((data ?? []) as RxSummary[]).map(sortItems);
}

export async function getPrescription(id: string, withConsultation: boolean): Promise<RxDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("prescriptions").select(RX_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const rx = sortItems(data as RxSummary) as RxDetail;
  rx.consultation = null;
  if (withConsultation) {
    const { data: c } = await supabase
      .from("consultations")
      .select("id, diagnosis, notes, started_at, completed_at")
      .eq("id", rx.consultation_id)
      .maybeSingle();
    rx.consultation = (c as RxDetail["consultation"]) ?? null;
  }
  return rx;
}

export type HistoryEntry = Consultation & {
  doctor: DoctorLite | null;
  prescription: (Prescription & { items: PrescriptionItem[] }) | null;
};

/** Completed consultations for a patient visible to the caller (RLS-scoped). */
export async function getPatientHistory(patientId: string, limit = 10): Promise<HistoryEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("consultations")
    .select("*, doctor:doctors(id, display_name, specialty, room, qualification), prescriptions(*, items:prescription_items(*))")
    .eq("patient_id", patientId)
    .not("completed_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as (Consultation & { doctor: DoctorLite | null; prescriptions: (Prescription & { items: PrescriptionItem[] })[] | (Prescription & { items: PrescriptionItem[] }) | null })[]).map((c) => {
    const rx = Array.isArray(c.prescriptions) ? c.prescriptions[0] ?? null : c.prescriptions;
    if (rx) rx.items = [...(rx.items ?? [])].sort((a, b) => a.position - b.position);
    const { prescriptions: _omit, ...rest } = c;
    void _omit;
    return { ...rest, prescription: rx } as HistoryEntry;
  });
}

export async function listMedicines(clinicId: string): Promise<Medicine[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("medicines").select("*").eq("clinic_id", clinicId).order("name");
  return (data ?? []) as Medicine[];
}

export async function getProfile(id: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  return (data as Profile) ?? null;
}

export async function getPrescriptionIdForToken(tokenId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: c } = await supabase.from("consultations").select("id").eq("token_id", tokenId).maybeSingle();
  if (!c) return null;
  const { data: rx } = await supabase.from("prescriptions").select("id").eq("consultation_id", c.id).maybeSingle();
  return (rx?.id as string | undefined) ?? null;
}

export interface ClinicPatient {
  id: string;
  full_name: string;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  allergies: string | null;
  blood_group: string | null;
  visits: number;
  last_visit: string;
}

/** Patients who have booked at the clinic (optionally only with one doctor), newest first. */
export async function listClinicPatients(clinicId: string, doctorId?: string): Promise<ClinicPatient[]> {
  const supabase = await createClient();
  let q = supabase
    .from("tokens")
    .select(`patient_id, token_date, patient:profiles!tokens_patient_id_fkey(${PATIENT_COLS})`)
    .eq("clinic_id", clinicId)
    .order("token_date", { ascending: false })
    .limit(2000);
  if (doctorId) q = q.eq("doctor_id", doctorId);
  const { data } = await q;
  const map = new Map<string, ClinicPatient>();
  for (const r of (data ?? []) as unknown as { patient_id: string; token_date: string; patient: PatientLite | null }[]) {
    const prev = map.get(r.patient_id);
    if (prev) {
      prev.visits += 1;
      continue;
    }
    map.set(r.patient_id, {
      id: r.patient_id,
      full_name: r.patient?.full_name ?? "",
      phone: r.patient?.phone ?? null,
      gender: r.patient?.gender ?? null,
      date_of_birth: r.patient?.date_of_birth ?? null,
      allergies: r.patient?.allergies ?? null,
      blood_group: r.patient?.blood_group ?? null,
      visits: 1,
      last_visit: r.token_date,
    });
  }
  return [...map.values()];
}
