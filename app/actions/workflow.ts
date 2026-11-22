"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/format";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { notifyPrescriptionChange, notifyQueueChange } from "@/lib/realtime/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, AppRole, Medicine, Token, TokenStatus } from "@/lib/types";

// Workflow mutations. Authorization is enforced twice: a role check here for
// fast, friendly errors, and authoritative checks inside the SECURITY DEFINER
// Postgres functions (which also run each step as one transaction).

type Fail = { ok: false; error: string };

async function guard(roles: AppRole[]): Promise<{ session: NonNullable<Awaited<ReturnType<typeof getSession>>> } | Fail> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." };
  if (!roles.includes(session.profile.role)) return { ok: false, error: "You don't have permission to do that." };
  return { session };
}

function dbError(error: { message?: string } | null): string {
  const msg = error?.message ?? "Something went wrong.";
  if (/duplicate key/i.test(msg)) return "That record already exists.";
  return msg.replace(/^ERROR:\s*/, "");
}

function rowOf<T>(data: unknown): T | null {
  const row = (Array.isArray(data) ? data[0] : data) as T | null;
  return row && (row as { id?: unknown }).id ? row : null;
}

// ── Patient ───────────────────────────────────────────────────────────
export async function bookToken(doctorId: string, reason: string): Promise<ActionResult<{ tokenId: string }>> {
  const g = await guard(["patient"]);
  if ("ok" in g) return g;
  if (!isUuid(doctorId)) return { ok: false, error: "Invalid doctor." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_token", {
    p_doctor_id: doctorId,
    p_reason: reason.trim().slice(0, 500) || null,
  });
  const token = rowOf<Token>(data);
  if (error || !token) return { ok: false, error: dbError(error) };
  notifyQueueChange(doctorId);
  revalidatePath("/patient");
  return { ok: true, message: `Token #${token.token_number} booked`, data: { tokenId: token.id } };
}

export async function updateMyProfile(input: {
  full_name: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  blood_group: string;
  allergies: string;
}): Promise<ActionResult> {
  const g = await guard(["patient", "doctor", "compounder", "admin"]);
  if ("ok" in g) return g;
  if (input.full_name.trim().length < 2) return { ok: false, error: "Name is too short." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: input.full_name.trim().slice(0, 120),
      phone: input.phone.trim().slice(0, 30) || null,
      date_of_birth: /^\d{4}-\d{2}-\d{2}$/.test(input.date_of_birth) ? input.date_of_birth : null,
      gender: input.gender.trim().slice(0, 20) || null,
      blood_group: input.blood_group.trim().slice(0, 5) || null,
      allergies: input.allergies.trim().slice(0, 500) || null,
    })
    .eq("id", g.session.userId);
  if (error) return { ok: false, error: dbError(error) };
  return { ok: true, message: "Profile saved" };
}

// ── Queue (doctor / compounder / admin; patients may cancel their own) ─
export async function callNextToken(doctorId: string): Promise<ActionResult> {
  const g = await guard(["doctor", "compounder", "admin"]);
  if ("ok" in g) return g;
  if (!isUuid(doctorId)) return { ok: false, error: "Invalid doctor." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("call_next_token", { p_doctor_id: doctorId });
  if (error) return { ok: false, error: dbError(error) };
  const token = rowOf<Token>(data);
  if (!token) return { ok: true, message: "No patients are waiting." };
  notifyQueueChange(doctorId);
  return { ok: true, message: `Token #${token.token_number} called` };
}

export async function setTokenStatus(tokenId: string, status: TokenStatus): Promise<ActionResult> {
  const g = await guard(["patient", "doctor", "compounder", "admin"]);
  if ("ok" in g) return g;
  if (!isUuid(tokenId)) return { ok: false, error: "Invalid token." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_token_status", { p_token_id: tokenId, p_status: status });
  const token = rowOf<Token>(data);
  if (error || !token) return { ok: false, error: dbError(error) };
  notifyQueueChange(token.doctor_id);
  const verb: Record<TokenStatus, string> = {
    waiting: "moved back to waiting",
    called: "called",
    in_consultation: "in consultation",
    completed: "completed",
    cancelled: "cancelled",
  };
  return { ok: true, message: `Token #${token.token_number} ${verb[status]}` };
}

export async function startConsultation(tokenId: string): Promise<ActionResult> {
  const g = await guard(["doctor"]);
  if ("ok" in g) return g;
  if (!isUuid(tokenId)) return { ok: false, error: "Invalid token." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_consultation", { p_token_id: tokenId });
  if (error) return { ok: false, error: dbError(error) };
  if (g.session.doctor) notifyQueueChange(g.session.doctor.id);
  return { ok: true };
}

export interface RxItemInput {
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  quantity: number;
}

export async function completeConsultation(input: {
  tokenId: string;
  diagnosis: string;
  notes: string;
  advice: string;
  followUp: string;
  items: RxItemInput[];
}): Promise<ActionResult<{ prescriptionId: string | null }>> {
  const g = await guard(["doctor"]);
  if ("ok" in g) return g;
  if (!isUuid(input.tokenId)) return { ok: false, error: "Invalid token." };
  if (!input.diagnosis.trim()) return { ok: false, error: "Diagnosis is required." };
  const items = input.items
    .filter((i) => i.medicine_name.trim())
    .slice(0, 25)
    .map((i) => ({
      medicine_name: i.medicine_name.trim().slice(0, 120),
      dosage: i.dosage.trim().slice(0, 60),
      frequency: i.frequency.trim().slice(0, 40),
      duration: i.duration.trim().slice(0, 40),
      instructions: i.instructions.trim().slice(0, 300),
      quantity: Math.min(Math.max(Math.round(Number(i.quantity) || 1), 1), 1000),
    }));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_consultation", {
    p_token_id: input.tokenId,
    p_diagnosis: input.diagnosis.trim().slice(0, 500),
    p_notes: input.notes.trim().slice(0, 2000) || null,
    p_advice: input.advice.trim().slice(0, 1000) || null,
    p_follow_up: /^\d{4}-\d{2}-\d{2}$/.test(input.followUp) ? input.followUp : null,
    p_items: items,
  });
  if (error) return { ok: false, error: dbError(error) };
  const prescriptionId = (data as string | null) ?? null;
  if (g.session.doctor) notifyQueueChange(g.session.doctor.id);
  if (prescriptionId) notifyPrescriptionChange(prescriptionId);
  return {
    ok: true,
    message: prescriptionId ? "Consultation saved · prescription sent to compounder" : "Consultation saved",
    data: { prescriptionId },
  };
}

// ── Front desk (compounder / admin) ───────────────────────────────────
export interface PatientSearchHit {
  id: string;
  full_name: string;
  phone_masked: string | null;
  gender: string | null;
  date_of_birth: string | null;
  is_walk_in: boolean;
  visited_clinic: boolean;
}

/**
 * Front-desk lookup via the search_patients RPC: fuzzy name/phone search only
 * among this clinic's patients; anyone else needs an exact email or full phone.
 * Phone numbers come back masked.
 */
export async function searchPatients(query: string): Promise<ActionResult<PatientSearchHit[]>> {
  const g = await guard(["compounder", "admin"]);
  if ("ok" in g) return g;
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { ok: true, data: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_patients", { p_query: q });
  if (error) return { ok: false, error: dbError(error) };
  return { ok: true, data: (data ?? []) as PatientSearchHit[] };
}

export async function bookWalkInToken(doctorId: string, patientId: string, reason: string): Promise<ActionResult> {
  const g = await guard(["compounder", "admin"]);
  if ("ok" in g) return g;
  if (!isUuid(doctorId) || !isUuid(patientId)) return { ok: false, error: "Select a doctor and a patient." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_token", {
    p_doctor_id: doctorId,
    p_patient_id: patientId,
    p_reason: reason.trim().slice(0, 500) || null,
  });
  const token = rowOf<Token>(data);
  if (error || !token) return { ok: false, error: dbError(error) };
  notifyQueueChange(doctorId);
  return { ok: true, message: `Walk-in token #${token.token_number} booked` };
}

/**
 * Registers a walk-in patient who has no account yet. Uses the service role
 * (only after verifying the caller is clinic staff) to create a login-less
 * auth user; the DB trigger turns it into a patient profile.
 */
export async function registerWalkInPatient(input: {
  full_name: string;
  phone: string;
  gender: string;
  date_of_birth: string;
}): Promise<ActionResult<{ id: string; full_name: string }>> {
  const g = await guard(["compounder", "admin"]);
  if ("ok" in g) return g;
  const rl = rateLimit(`walkin:${g.session.userId}`, 10, 10 * 60 * 1000);
  if (!rl.ok) return { ok: false, error: `Too many registrations. Try again in ${rl.retryInSec}s.` };
  const fullName = input.full_name.trim().slice(0, 120);
  if (fullName.length < 2) return { ok: false, error: "Enter the patient's full name." };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Walk-in registration needs SUPABASE_SERVICE_ROLE_KEY on the server." };
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: `walkin.${randomUUID().slice(0, 12)}@walkin.medisync.local`,
    password: randomBytes(24).toString("base64url"),
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: input.phone.trim().slice(0, 30), walk_in: true },
  });
  if (error || !data.user) return { ok: false, error: error?.message ?? "Could not register patient." };
  await admin
    .from("profiles")
    .update({
      gender: input.gender.trim().slice(0, 20) || null,
      date_of_birth: /^\d{4}-\d{2}-\d{2}$/.test(input.date_of_birth) ? input.date_of_birth : null,
    })
    .eq("id", data.user.id);
  return { ok: true, message: `${fullName} registered`, data: { id: data.user.id, full_name: fullName } };
}

// ── Dispensing (compounder / admin) ───────────────────────────────────
export async function setItemAvailability(itemId: string, available: boolean): Promise<ActionResult> {
  const g = await guard(["compounder", "admin"]);
  if ("ok" in g) return g;
  if (!isUuid(itemId)) return { ok: false, error: "Invalid item." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_item_availability", { p_item_id: itemId, p_available: available });
  const item = rowOf<{ id: string; prescription_id: string; medicine_name: string }>(data);
  if (error || !item) return { ok: false, error: dbError(error) };
  notifyPrescriptionChange(item.prescription_id);
  return { ok: true, message: `${item.medicine_name} marked ${available ? "available" : "unavailable"}` };
}

export async function dispenseItems(prescriptionId: string, itemIds: string[]): Promise<ActionResult> {
  const g = await guard(["compounder", "admin"]);
  if ("ok" in g) return g;
  if (!isUuid(prescriptionId)) return { ok: false, error: "Invalid prescription." };
  const ids = itemIds.filter(isUuid);
  if (ids.length === 0) return { ok: false, error: "Select at least one medicine to dispense." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dispense_items", { p_prescription_id: prescriptionId, p_item_ids: ids });
  if (error) return { ok: false, error: dbError(error) };
  const r = data as { dispensed: number; unavailable: number };
  notifyPrescriptionChange(prescriptionId);
  const parts = [`${r.dispensed} dispensed`];
  if (r.unavailable) parts.push(`${r.unavailable} out of stock → marked unavailable`);
  return { ok: true, message: parts.join(" · ") };
}

// ── Inventory (compounder / admin) ────────────────────────────────────
export async function adjustStock(medicineId: string, delta: number): Promise<ActionResult> {
  const g = await guard(["compounder", "admin"]);
  if ("ok" in g) return g;
  if (!isUuid(medicineId) || !Number.isFinite(delta)) return { ok: false, error: "Invalid input." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_stock", {
    p_medicine_id: medicineId,
    p_delta: Math.max(-10000, Math.min(10000, Math.round(delta))),
  });
  const med = rowOf<Medicine>(data);
  if (error || !med) return { ok: false, error: dbError(error) };
  return { ok: true, message: `${med.name}: ${med.stock_qty} ${med.unit} in stock` };
}

export async function addMedicine(input: {
  name: string;
  generic_name: string;
  form: string;
  strength: string;
  stock_qty: number;
  unit: string;
  reorder_level: number;
}): Promise<ActionResult> {
  const g = await guard(["compounder", "admin"]);
  if ("ok" in g) return g;
  if (!g.session.clinic) return { ok: false, error: "Your account is not linked to a clinic." };
  const name = input.name.trim().slice(0, 120);
  if (name.length < 2) return { ok: false, error: "Enter the medicine name." };
  const supabase = await createClient();
  const { error } = await supabase.from("medicines").insert({
    clinic_id: g.session.clinic.id,
    name,
    generic_name: input.generic_name.trim().slice(0, 120) || null,
    form: input.form.trim().slice(0, 40) || null,
    strength: input.strength.trim().slice(0, 40) || null,
    stock_qty: Math.max(0, Math.round(Number(input.stock_qty) || 0)),
    unit: input.unit.trim().slice(0, 20) || "units",
    reorder_level: Math.max(0, Math.round(Number(input.reorder_level) || 0)),
  });
  if (error) return { ok: false, error: /duplicate/i.test(error.message) ? "That medicine is already in inventory." : dbError(error) };
  revalidatePath("/compounder/inventory");
  revalidatePath("/admin/inventory");
  return { ok: true, message: `${name} added to inventory` };
}

// ── Admin ─────────────────────────────────────────────────────────────
export async function updateClinicSettings(input: {
  name: string;
  description: string;
  address: string;
  city: string;
  phone: string;
  opening_hours: string;
  avg_consult_minutes: number;
  latitude: string;
  longitude: string;
}): Promise<ActionResult> {
  const g = await guard(["admin"]);
  if ("ok" in g) return g;
  if (!g.session.clinic) return { ok: false, error: "Your account is not linked to a clinic." };
  if (input.name.trim().length < 2) return { ok: false, error: "Clinic name is required." };
  const lat = input.latitude.trim() ? Number(input.latitude) : null;
  const lng = input.longitude.trim() ? Number(input.longitude) : null;
  if ((lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) || (lng !== null && (!Number.isFinite(lng) || Math.abs(lng) > 180))) {
    return { ok: false, error: "Latitude/longitude are invalid." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("clinics")
    .update({
      name: input.name.trim().slice(0, 120),
      description: input.description.trim().slice(0, 500) || null,
      address: input.address.trim().slice(0, 200),
      city: input.city.trim().slice(0, 80),
      phone: input.phone.trim().slice(0, 30) || null,
      opening_hours: input.opening_hours.trim().slice(0, 120) || null,
      avg_consult_minutes: Math.min(120, Math.max(1, Math.round(Number(input.avg_consult_minutes) || 10))),
      latitude: lat,
      longitude: lng,
    })
    .eq("id", g.session.clinic.id);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Clinic settings saved" };
}

export async function assignStaff(email: string, role: AppRole, specialty: string): Promise<ActionResult> {
  const g = await guard(["admin"]);
  if ("ok" in g) return g;
  if (!["patient", "doctor", "compounder", "admin"].includes(role)) return { ok: false, error: "Invalid role." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_assign_staff", {
    p_email: email.trim(),
    p_role: role,
    p_specialty: specialty.trim() || null,
  });
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/admin/staff");
  return { ok: true, message: role === "patient" ? `${email} removed from staff` : `${email} is now ${role}` };
}

export async function updateDoctor(doctorId: string, input: { specialty: string; room: string; is_active: boolean }): Promise<ActionResult> {
  const g = await guard(["admin"]);
  if ("ok" in g) return g;
  if (!isUuid(doctorId)) return { ok: false, error: "Invalid doctor." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("doctors")
    .update({
      specialty: input.specialty.trim().slice(0, 80) || "General Physician",
      room: input.room.trim().slice(0, 30) || null,
      is_active: input.is_active,
    })
    .eq("id", doctorId)
    .select("id");
  if (error || !data?.length) return { ok: false, error: error ? dbError(error) : "Doctor not found in your clinic." };
  revalidatePath("/admin/staff");
  return { ok: true, message: input.is_active ? "Doctor updated" : "Doctor deactivated (no new tokens)" };
}

/** First-run setup: an admin with no clinic creates one and is linked to it. */
export async function createClinic(input: {
  name: string;
  description: string;
  address: string;
  city: string;
  phone: string;
  opening_hours: string;
  avg_consult_minutes: number;
  latitude: string;
  longitude: string;
}): Promise<ActionResult> {
  const g = await guard(["admin"]);
  if ("ok" in g) return g;
  const lat = input.latitude.trim() ? Number(input.latitude) : null;
  const lng = input.longitude.trim() ? Number(input.longitude) : null;
  if ((lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) || (lng !== null && (!Number.isFinite(lng) || Math.abs(lng) > 180))) {
    return { ok: false, error: "Latitude/longitude are invalid." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_clinic", {
    p_name: input.name.slice(0, 120),
    p_address: input.address.slice(0, 200),
    p_city: input.city.slice(0, 80),
    p_phone: input.phone.slice(0, 30),
    p_opening_hours: input.opening_hours.slice(0, 120),
    p_avg_consult_minutes: Math.round(Number(input.avg_consult_minutes) || 10),
    p_latitude: lat,
    p_longitude: lng,
    p_description: input.description.slice(0, 500),
  });
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Clinic created" };
}
