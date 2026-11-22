"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMyDoctorDetails } from "@/app/actions/workflow";
import { useToast } from "@/components/toast";
import { Button, Field, Input, Spinner } from "@/components/ui";
import { safeAction } from "@/lib/safe-action";

const SPECIALTIES = [
  "General Physician",
  "Pediatrics",
  "Gynecology",
  "Dermatology",
  "ENT",
  "Orthopedics",
  "Cardiology",
  "Diabetology",
  "Psychiatry",
  "Dentistry",
  "Ophthalmology",
];

export function DoctorDetailsForm({ qualification, specialty }: { qualification: string | null; specialty: string }) {
  const [degrees, setDegrees] = useState(qualification ?? "");
  const [spec, setSpec] = useState(specialty);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await safeAction(() => updateMyDoctorDetails({ qualification: degrees, specialty: spec }));
          if (res.ok) {
            toast(res.message ?? "Saved");
            router.refresh();
          } else toast(res.error, "error");
        });
      }}
    >
      <Field label="Degrees & qualifications" hint="Separate with commas — shown on your clinic listing and prescriptions" className="sm:col-span-2">
        <Input value={degrees} onChange={(e) => setDegrees(e.target.value)} placeholder="e.g. MBBS, MD (General Medicine)" maxLength={200} />
      </Field>
      <Field label="Specialty *">
        <Input value={spec} onChange={(e) => setSpec(e.target.value)} list="specialties" required minLength={2} maxLength={80} />
        <datalist id="specialties">
          {SPECIALTIES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      <div className="flex items-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : null}
          Save professional details
        </Button>
      </div>
    </form>
  );
}
