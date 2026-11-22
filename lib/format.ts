export function todayIn(timezone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function formatDate(value: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return "—";
  const d = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", opts ?? { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function ageFrom(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function waitLabel(minutes: number): string {
  if (minutes <= 0) return "Any moment now";
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `~${h} h${m ? ` ${m} min` : ""}`;
}

/** Plain-language meaning of common prescription frequency shorthand. */
export const FREQUENCY_OPTIONS: { code: string; label: string }[] = [
  { code: "OD", label: "Once a day" },
  { code: "BD", label: "Twice a day" },
  { code: "TDS", label: "Three times a day" },
  { code: "QID", label: "Four times a day" },
  { code: "HS", label: "At bedtime" },
  { code: "SOS", label: "Only when needed" },
  { code: "Weekly", label: "Once a week" },
  { code: "STAT", label: "Immediately, once" },
];

export function explainFrequency(freq: string): string | null {
  const hit = FREQUENCY_OPTIONS.find((f) => f.code.toLowerCase() === freq.trim().toLowerCase());
  return hit ? hit.label : null;
}
