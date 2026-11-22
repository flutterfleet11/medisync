// Shared input validation (used by server actions; mirrored by form attributes).
// Each validator returns an error message, or null when the value is valid.

export const LIMITS = {
  name: 120,
  phone: 20,
  text: 500,
  longText: 2000,
  stockMax: 1_000_000,
  qtyMax: 1000,
};

export function vName(value: string, label = "Name"): string | null {
  const v = value.trim();
  if (v.length < 2) return `${label} must be at least 2 characters.`;
  if (v.length > LIMITS.name) return `${label} is too long.`;
  // Permissive on purpose (creative/demo names welcome); only block markup-ish characters.
  if (/[<>{}\\`|^~]/.test(v) || /\p{Cc}/u.test(v)) return `${label} contains characters that aren't allowed.`;
  return null;
}

/** Optional phone: 7–15 digits, may start with + and contain spaces/dashes. */
export function vPhone(value: string, required = false): string | null {
  const v = value.trim();
  if (!v) return required ? "Phone number is required." : null;
  if (!/^\+?[\d\s()-]+$/.test(v)) return "Phone can only contain digits, spaces, +, - and brackets.";
  const digits = v.replace(/\D/g, "").length;
  if (digits < 7 || digits > 15) return "Enter a valid phone number (7–15 digits).";
  return null;
}

export function vEmail(value: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()) ? null : "Enter a valid email address.";
}

export function vPassword(value: string): string | null {
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return "Password must contain letters and numbers.";
  return null;
}

/** Optional YYYY-MM-DD date of birth: not in the future, not before 1900. */
export function vDob(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Enter a valid date of birth.";
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "Enter a valid date of birth.";
  if (d.getTime() > Date.now()) return "Date of birth cannot be in the future.";
  if (d.getUTCFullYear() < 1900) return "Date of birth looks wrong.";
  return null;
}

/** Optional YYYY-MM-DD date that must be today or later (follow-ups). */
export function vFutureDate(value: string, today: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Enter a valid date.";
  if (value < today) return "Follow-up date cannot be in the past.";
  return null;
}

export function vInt(value: unknown, label: string, min: number, max: number): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return `${label} must be a whole number.`;
  if (n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  return null;
}

export function vMaxLen(value: string, label: string, max: number): string | null {
  return value.trim().length > max ? `${label} is too long (max ${max} characters).` : null;
}

export function vCoords(lat: string, lng: string): string | null {
  const hasLat = lat.trim() !== "";
  const hasLng = lng.trim() !== "";
  if (hasLat !== hasLng) return "Enter both latitude and longitude, or neither.";
  if (!hasLat) return null;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || Math.abs(a) > 90) return "Latitude must be between -90 and 90.";
  if (!Number.isFinite(b) || Math.abs(b) > 180) return "Longitude must be between -180 and 180.";
  return null;
}

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const GENDERS = ["Female", "Male", "Other"];

/** First failing check wins. */
export function firstError(...checks: (string | null)[]): string | null {
  return checks.find((c) => c) ?? null;
}
