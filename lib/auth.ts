import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Clinic, Doctor, Profile } from "@/lib/types";

export const ROLE_HOME: Record<AppRole, string> = {
  patient: "/patient",
  doctor: "/doctor",
  compounder: "/compounder",
  admin: "/admin",
};

export const ROLE_LABEL: Record<AppRole, string> = {
  patient: "Patient",
  doctor: "Doctor",
  compounder: "Compounder",
  admin: "Admin",
};

export interface Session {
  userId: string;
  email: string | null;
  profile: Profile;
  doctor: Doctor | null;
  clinic: Clinic | null;
}

/** Validated session (getUser hits Supabase Auth), memoised per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>();
  if (!profile) return null;

  const [doctorRes, clinicRes] = await Promise.all([
    profile.role === "doctor"
      ? supabase.from("doctors").select("*").eq("profile_id", user.id).maybeSingle<Doctor>()
      : Promise.resolve({ data: null }),
    profile.clinic_id
      ? supabase.from("clinics").select("*").eq("id", profile.clinic_id).maybeSingle<Clinic>()
      : Promise.resolve({ data: null }),
  ]);

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    doctor: (doctorRes.data as Doctor | null) ?? null,
    clinic: (clinicRes.data as Clinic | null) ?? null,
  };
});

/** Server-side guard for role areas. Redirects instead of rendering. */
export async function requireRole(role: AppRole): Promise<Session> {
  await connection(); // always render per request (session-scoped)
  if (!isSupabaseConfigured()) redirect("/setup");
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.profile.role !== role) redirect(ROLE_HOME[session.profile.role]);
  return session;
}

/** Staff pages need a clinic link; doctors also need a doctor record. */
export async function requireStaff(role: Exclude<AppRole, "patient">) {
  const session = await requireRole(role);
  if (!session.clinic) redirect("/unassigned");
  if (role === "doctor" && !session.doctor) redirect("/unassigned");
  return session as Session & { clinic: Clinic };
}
