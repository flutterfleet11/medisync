// Realtime "topics" are invalidation signals only — they never carry patient
// data. Clients refetch through RLS-protected queries when a topic fires.
export const topics = {
  /** A doctor's queue for today changed (tokens or now-serving). */
  queue: (doctorId: string) => `queue:${doctorId}`,
  /** Any queue at a clinic changed (compounder overview). */
  clinicQueue: (clinicId: string) => `clinic-queue:${clinicId}`,
  /** Prescription list for a clinic changed (compounder inbox). */
  clinicRx: (clinicId: string) => `clinic-rx:${clinicId}`,
  /** A single prescription or its items changed. */
  rx: (prescriptionId: string) => `rx:${prescriptionId}`,
  /** Anything belonging to a patient changed (tokens, prescriptions). */
  patient: (patientId: string) => `patient:${patientId}`,
};

export type TopicKind = "queue" | "clinic-queue" | "clinic-rx" | "rx" | "patient";

export function parseTopic(topic: string): { kind: TopicKind; id: string } | null {
  const idx = topic.indexOf(":");
  if (idx < 0) return null;
  const kind = topic.slice(0, idx) as TopicKind;
  const id = topic.slice(idx + 1);
  if (!["queue", "clinic-queue", "clinic-rx", "rx", "patient"].includes(kind)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { kind, id };
}

/** Custom Nexconn message type for MediSync sync signals. */
export const NEXCONN_MESSAGE_TYPE = "MS:Sync";

/** Nexconn user IDs allow letters and digits only (max 64 bytes). */
export function nexconnUserId(uuid: string): string {
  return uuid.replace(/-/g, "");
}
