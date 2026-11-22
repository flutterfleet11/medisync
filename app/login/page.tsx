import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { AuthLayout } from "@/components/auth-layout";
import { LoginForm } from "@/components/auth-forms";
import { Button, LinkButton, Notice } from "@/components/ui";
import { getSession, ROLE_HOME, ROLE_LABEL } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  await connection();
  if (!isSupabaseConfigured()) redirect("/setup");
  const session = await getSession();
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";

  // Already signed in: don't silently swap accounts — one browser holds one login.
  if (session) {
    const role = session.profile.role;
    return (
      <AuthLayout title="You're already signed in">
        <div className="space-y-4">
          <Notice tone="info" title={`Signed in as ${session.profile.full_name || session.email} (${ROLE_LABEL[role]})`}>
            {session.email}
          </Notice>
          <div className="flex flex-wrap gap-2">
            <LinkButton href={ROLE_HOME[role]}>Continue as {ROLE_LABEL[role]}</LinkButton>
            <form action={signOut}>
              <Button variant="secondary">Sign out to switch account</Button>
            </form>
          </div>
          <p className="text-sm text-slate-500">
            One browser keeps one login, shared by all its tabs. To use two roles at the same time (for example Doctor and
            Compounder), open the second one in an <span className="font-medium text-slate-700">Incognito/Private window</span>, another
            browser, or another device.
          </p>
        </div>
      </AuthLayout>
    );
  }

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
      <p className="mt-4 text-xs text-slate-500">
        Tip: each browser keeps one login. For a second role at the same time, use an Incognito window or another browser.
      </p>
    </AuthLayout>
  );
}
