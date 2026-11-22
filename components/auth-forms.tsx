"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, signUp, type AuthFormState } from "@/app/actions/auth";
import { Button, Field, Input, Notice, Spinner } from "@/components/ui";

export const DEMO_PASSWORD = "MediSync@2026";
const DEMO_ACCOUNTS = [
  { role: "Patient", email: "patient@medisync.demo" },
  { role: "Doctor", email: "doctor@medisync.demo" },
  { role: "Compounder", email: "compounder@medisync.demo" },
  { role: "Admin", email: "admin@medisync.demo" },
];

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? <Spinner /> : null}
      {children}
    </Button>
  );
}

function DemoSubmit({ role }: { role: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" className="w-full" disabled={pending}>
      {pending ? <Spinner /> : null}
      {role}
    </Button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(signIn, {});
  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        {state.error ? <Notice tone="error">{state.error}</Notice> : null}
        <Submit>Sign in</Submit>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-navy-900">Demo accounts</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Synthetic data. Password for all: <code className="rounded bg-slate-100 px-1">{DEMO_PASSWORD}</code>
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DEMO_ACCOUNTS.map((a) => (
            <form key={a.email} action={action}>
              <input type="hidden" name="email" value={a.email} />
              <input type="hidden" name="password" value={DEMO_PASSWORD} />
              <DemoSubmit role={a.role} />
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(signUp, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Full name">
        <Input name="full_name" autoComplete="name" required minLength={2} />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Phone" hint="Optional — shown to the clinic for your appointments">
        <Input name="phone" type="tel" autoComplete="tel" />
      </Field>
      <Field label="Password" hint="At least 8 characters">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.info ? <Notice tone="success">{state.info}</Notice> : null}
      <Submit>Create account</Submit>
    </form>
  );
}
