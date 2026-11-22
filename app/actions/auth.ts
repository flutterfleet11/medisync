"use server";

import { redirect } from "next/navigation";
import { ROLE_HOME } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types";

export interface AuthFormState {
  error?: string;
  info?: string;
}

function safeNext(next: FormDataEntryValue | null, role: AppRole): string {
  const home = ROLE_HOME[role];
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return home;
  // Only honour ?next= inside the user's own role area.
  return next === home || next.startsWith(`${home}/`) ? next : home;
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured. See /setup." };
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: error?.message ?? "Sign in failed." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
  const role = (profile?.role ?? "patient") as AppRole;
  redirect(safeNext(formData.get("next"), role));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured. See /setup." };
  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (fullName.length < 2) return { error: "Enter your full name." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  // Role is never taken from the client: the DB trigger always creates a patient profile.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone } },
  });
  if (error) return { error: error.message };
  if (!data.session) {
    return { info: "Account created. Check your email to confirm it, then sign in." };
  }
  redirect("/patient");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
