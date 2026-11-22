import type { Metadata } from "next";
import { Card, LinkButton, Notice } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Setup" };

export default function SetupPage() {
  const ready = isSupabaseConfigured();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold text-navy-900">MediSync setup</h1>
      <p className="mt-1 text-sm text-slate-500">The app needs a Supabase project before it can run.</p>
      <Card className="mt-6 space-y-4 p-6 text-sm text-slate-700">
        {ready ? (
          <Notice tone="success" title="Supabase is configured.">
            You can sign in now.
          </Notice>
        ) : (
          <Notice tone="warn" title="Supabase environment variables are missing." />
        )}
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Copy <code className="rounded bg-slate-100 px-1">.env.example</code> to{" "}
            <code className="rounded bg-slate-100 px-1">.env.local</code> and fill in the Supabase URL, anon key and
            service role key.
          </li>
          <li>
            Apply the SQL in <code className="rounded bg-slate-100 px-1">supabase/migrations</code> (Supabase CLI{" "}
            <code className="rounded bg-slate-100 px-1">db push</code> or the SQL editor, in filename order).
          </li>
          <li>
            Seed demo data: <code className="rounded bg-slate-100 px-1">npm run seed</code>
          </li>
          <li>Restart the dev server.</li>
        </ol>
        {ready ? <LinkButton href="/login">Go to sign in</LinkButton> : null}
      </Card>
    </main>
  );
}
