"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClinic } from "@/app/actions/workflow";
import { useToast } from "@/components/toast";
import { Button, Field, Input, Notice, Spinner, Textarea } from "@/components/ui";
import { safeAction } from "@/lib/safe-action";

export function CreateClinicForm() {
  const [f, setF] = useState({
    name: "",
    description: "",
    address: "",
    city: "",
    phone: "",
    opening_hours: "",
    avg_consult_minutes: 10,
    latitude: "",
    longitude: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await safeAction(() => createClinic({ ...f, avg_consult_minutes: Number(f.avg_consult_minutes) }));
          if (res.ok) {
            toast(res.message ?? "Clinic created");
            router.push("/admin");
            router.refresh();
          } else setError(res.error);
        });
      }}
    >
      <Field label="Clinic name *" className="sm:col-span-2">
        <Input value={f.name} onChange={set("name")} required minLength={2} maxLength={120} />
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <Textarea value={f.description} onChange={set("description")} maxLength={500} />
      </Field>
      <Field label="Address">
        <Input value={f.address} onChange={set("address")} />
      </Field>
      <Field label="City">
        <Input value={f.city} onChange={set("city")} />
      </Field>
      <Field label="Phone">
        <Input value={f.phone} onChange={set("phone")} type="tel" inputMode="tel" maxLength={20} pattern="\+?[0-9 \-\(\)]{7,20}" title="7–15 digits; may include +, spaces, - and brackets" />
      </Field>
      <Field label="Opening hours">
        <Input value={f.opening_hours} onChange={set("opening_hours")} placeholder="Mon–Sat · 9 AM – 8 PM" />
      </Field>
      <Field label="Average consultation (minutes)" hint="Used for patients' wait estimates">
        <Input type="number" min={1} max={120} value={f.avg_consult_minutes} onChange={set("avg_consult_minutes")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude" hint="For nearby pharmacy search">
          <Input value={f.latitude} onChange={set("latitude")} type="number" step="any" min={-90} max={90} placeholder="12.9716" />
        </Field>
        <Field label="Longitude">
          <Input value={f.longitude} onChange={set("longitude")} type="number" step="any" min={-180} max={180} placeholder="77.5946" />
        </Field>
      </div>
      {error ? (
        <Notice tone="error" className="sm:col-span-2">
          {error}
        </Notice>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Spinner /> : null}
          Create clinic
        </Button>
      </div>
    </form>
  );
}
