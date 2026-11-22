"use client";

import { safeAction } from "@/lib/safe-action";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bookToken, updateMyProfile } from "@/app/actions/workflow";
import { useToast } from "@/components/toast";
import { Button, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
import type { Profile } from "@/lib/types";

export function BookTokenForm({ doctorId, doctorName }: { doctorId: string; doctorName: string }) {
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await safeAction(() => bookToken(doctorId, reason));
          if (res.ok && res.data) {
            toast(res.message ?? "Token booked");
            router.push(`/patient/tokens/${res.data.tokenId}`);
          } else if (!res.ok) {
            toast(res.error, "error");
          }
        });
      }}
    >
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for visit (optional)"
        maxLength={200}
        aria-label={`Reason for visit with ${doctorName}`}
      />
      <Button type="submit" disabled={pending} className="sm:w-40">
        {pending ? <Spinner /> : null}
        Book token
      </Button>
    </form>
  );
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [form, setForm] = useState({
    full_name: profile.full_name,
    phone: profile.phone ?? "",
    date_of_birth: profile.date_of_birth ?? "",
    gender: profile.gender ?? "",
    blood_group: profile.blood_group ?? "",
    allergies: profile.allergies ?? "",
  });
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await safeAction(() => updateMyProfile(form));
          if (res.ok) {
            toast(res.message ?? "Saved");
            router.refresh();
          } else toast(res.error, "error");
        });
      }}
    >
      <Field label="Full name">
        <Input value={form.full_name} onChange={set("full_name")} required minLength={2} maxLength={120} />
      </Field>
      <Field label="Phone">
        <Input value={form.phone} onChange={set("phone")} type="tel" inputMode="tel" maxLength={20} pattern="\+?[0-9 \-\(\)]{7,20}" title="7–15 digits; may include +, spaces, - and brackets" />
      </Field>
      <Field label="Date of birth">
        <Input value={form.date_of_birth} onChange={set("date_of_birth")} type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} />
      </Field>
      <Field label="Gender">
        <Select value={form.gender} onChange={set("gender")}>
          <option value="">Prefer not to say</option>
          <option>Female</option>
          <option>Male</option>
          <option>Other</option>
        </Select>
      </Field>
      <Field label="Blood group">
        <Select value={form.blood_group} onChange={set("blood_group")}>
          <option value="">Unknown</option>
          {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => (
            <option key={b}>{b}</option>
          ))}
        </Select>
      </Field>
      <Field label="Known allergies" className="sm:col-span-2">
        <Textarea value={form.allergies} onChange={set("allergies")} placeholder="e.g. Penicillin" maxLength={500} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : null}
          Save profile
        </Button>
      </div>
    </form>
  );
}
