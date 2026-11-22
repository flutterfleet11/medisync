import { after } from "next/server";
import { isNexconnConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNexconnSignal } from "@/lib/realtime/nexconn-server";
import { nexconnUserId, topics } from "@/lib/realtime/topics";

/*
 * Server-side realtime publisher.
 * - Nexconn configured  → push an MS:Sync signal to exactly the users who
 *   should refresh (computed with the service role, after the response).
 * - Otherwise           → no-op: the Supabase Realtime fallback is driven by
 *   postgres_changes on the tables themselves (see RealtimeProvider).
 */

async function clinicStaffIds(clinicId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("clinic_id", clinicId)
    .in("role", ["compounder", "admin", "doctor"]);
  return (data ?? []).map((r) => r.id as string);
}

async function publish(recipients: string[], topicList: string[]) {
  const unique = [...new Set(recipients)].map(nexconnUserId);
  try {
    await sendNexconnSignal(unique, { topics: topicList, at: Date.now() });
  } catch (e) {
    console.error("[realtime] Nexconn publish failed:", e instanceof Error ? e.message : e);
  }
}

export function notifyQueueChange(doctorId: string) {
  if (!isNexconnConfigured()) return;
  after(async () => {
    const admin = createAdminClient();
    const { data: doctor } = await admin.from("doctors").select("clinic_id").eq("id", doctorId).single();
    if (!doctor) return;
    const today = new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10);
    const { data: tokenRows } = await admin
      .from("tokens")
      .select("patient_id")
      .eq("doctor_id", doctorId)
      .gte("token_date", today);
    const recipients = [
      ...(await clinicStaffIds(doctor.clinic_id)),
      ...(tokenRows ?? []).map((t) => t.patient_id as string),
    ];
    await publish(recipients, [topics.queue(doctorId), topics.clinicQueue(doctor.clinic_id)]);
  });
}

export function notifyPrescriptionChange(prescriptionId: string) {
  if (!isNexconnConfigured()) return;
  after(async () => {
    const admin = createAdminClient();
    const { data: rx } = await admin
      .from("prescriptions")
      .select("clinic_id, patient_id")
      .eq("id", prescriptionId)
      .single();
    if (!rx) return;
    const recipients = [...(await clinicStaffIds(rx.clinic_id)), rx.patient_id as string];
    await publish(recipients, [topics.rx(prescriptionId), topics.clinicRx(rx.clinic_id), topics.patient(rx.patient_id)]);
  });
}
