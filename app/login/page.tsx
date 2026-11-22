import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth-layout";
import { LoginForm } from "@/components/auth-forms";
import { getSession, ROLE_HOME } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection();
  if (!isSupabaseConfigured()) redirect("/setup");
  const session = await getSession();
  if (session) redirect(ROLE_HOME[session.profile.role]);
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";

  return (
    <AuthLayout
      title="Sign in to MediSync"
      subtitle={
        <>
          New patient?{" "}
          <Link href="/register" className="font-medium text-blue-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next} />
    </AuthLayout>
  );
}
