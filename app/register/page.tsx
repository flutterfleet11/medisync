import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth-layout";
import { RegisterForm } from "@/components/auth-forms";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/setup");
  const session = await getSession();
  if (session) redirect(ROLE_HOME[session.profile.role]);

  return (
    <AuthLayout
      title="Create your patient account"
      subtitle={
        <>
          Already registered?{" "}
          <Link href="/login" className="font-medium text-blue-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
      <p className="mt-4 text-xs text-slate-500">
        Clinic staff accounts (doctor, compounder, admin) are assigned by a clinic admin after registration.
      </p>
    </AuthLayout>
  );
}
