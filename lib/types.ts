export type AppRole = "patient" | "doctor" | "compounder" | "admin";
export type TokenStatus = "waiting" | "called" | "in_consultation" | "completed" | "cancelled";
export type PrescriptionStatus = "sent" | "in_progress" | "partially_dispensed" | "dispensed";
export type ItemStatus = "pending" | "available" | "unavailable" | "dispensed";

export interface Clinic {
  id: string;
  name: string;
  description: string | null;
  address: string;
  city: string;
  phone: string | null;
  opening_hours: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  avg_consult_minutes: number;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  clinic_id: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  blood_group: string | null;
  allergies: string | null;
  created_at: string;
  updated_at: string;
}

export interface Doctor {
  id: string;
  profile_id: string;
  clinic_id: string;
  display_name: string;
  specialty: string;
  qualification: string | null;
  room: string | null;
  is_active: boolean;
  created_at: string;
}

export interface QueueState {
  doctor_id: string;
  token_date: string;
  clinic_id: string;
  last_token_number: number;
  now_serving: number | null;
  waiting_count: number;
  updated_at: string;
}

export interface Token {
  id: string;
  clinic_id: string;
  doctor_id: string;
  patient_id: string;
  token_date: string;
  token_number: number;
  status: TokenStatus;
  source: "online" | "walk_in";
  reason: string | null;
  booked_by: string | null;
  called_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QueuePosition {
  token_id: string;
  token_number: number;
  status: TokenStatus;
  now_serving: number | null;
  tokens_ahead: number;
  est_wait_minutes: number;
  doctor_id: string;
  token_date: string;
}

export interface Consultation {
  id: string;
  token_id: string;
  clinic_id: string;
  doctor_id: string;
  patient_id: string;
  diagnosis: string | null;
  notes: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface Medicine {
  id: string;
  clinic_id: string;
  name: string;
  generic_name: string | null;
  form: string | null;
  strength: string | null;
  stock_qty: number;
  unit: string;
  reorder_level: number;
  created_at: string;
  updated_at: string;
}

export interface Prescription {
  id: string;
  consultation_id: string;
  clinic_id: string;
  doctor_id: string;
  patient_id: string;
  status: PrescriptionStatus;
  advice: string | null;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  medicine_id: string | null;
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
  quantity: number;
  status: ItemStatus;
  position: number;
  updated_at: string;
}

/** Standard result shape for server actions called from client components. */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string };
