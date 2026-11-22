"use client";

import { safeAction } from "@/lib/safe-action";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignStaff, updateClinicSettings, updateDoctor } from "@/app/actions/workflow";
import { useToast } from "@/components/toast";
import { Badge, Button, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
import type { ActionResult, AppRole, Clinic, Doctor } from "@/lib/types";

function useRun() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      const res = await safeAction(() => fn());
      if (res.ok) {
        toast(res.message ?? "Saved");
        after?.();
        router.refresh();
      } else toast(res.error ?? "Failed", "error");
    });
  return { pending, run };
}

export function ClinicSettingsForm({ clinic }: { clinic: Clinic }) {
  const [f, setF] = useState({
    name: clinic.name,
    description: clinic.description ?? "",
    address: clinic.address,
    city: clinic.city,
    phone: clinic.phone ?? "",
    opening_hours: clinic.opening_hours ?? "",
    avg_consult_minutes: clinic.avg_consult_minutes,
    latitude: clinic.latitude?.toString() ?? "",
    longitude: clinic.longitude?.toString() ?? "",
  });
  const { pending, run } = useRun();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateClinicSettings({ ...f, avg_consult_minutes: Number(f.avg_consult_minutes) }));
      }}
    >
      <Field label="Clinic name" className="sm:col-span-2">
        <Input value={f.name} onChange={set("name")} required minLength={2} />
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
        <Input value={f.phone} onChange={set("phone")} />
      </Field>
      <Field label="Opening hours">
        <Input value={f.opening_hours} onChange={set("opening_hours")} placeholder="Mon–Sat · 9 AM – 8 PM" />
      </Field>
      <Field label="Average consultation (minutes)" hint="Used for patients' estimated wait time">
        <Input type="number" min={1} max={120} value={f.avg_consult_minutes} onChange={set("avg_consult_minutes")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude" hint="Origin for pharmacy search">
          <Input value={f.latitude} onChange={set("latitude")} inputMode="decimal" />
        </Field>
        <Field label="Longitude">
          <Input value={f.longitude} onChange={set("longitude")} inputMode="decimal" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : null}
          Save settings
        </Button>
      </div>
    </form>
  );
}

export function AssignStaffForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("compounder");
  const [specialty, setSpecialty] = useState("");
  const { pending, run } = useRun();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => assignStaff(email, role, specialty), () => {
          setEmail("");
          setSpecialty("");
        });
      }}
    >
      <Field label="User email" hint="They must have registered a MediSync account first.">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Role">
        <Select value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
          <option value="doctor">Doctor</option>
          <option value="compounder">Compounder (pharmacy + front desk)</option>
          <option value="admin">Admin</option>
          <option value="patient">Patient (remove from staff)</option>
        </Select>
      </Field>
      {role === "doctor" ? (
        <Field label="Specialty">
          <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="General Physician" />
        </Field>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <Spinner /> : null}
        Assign role
      </Button>
    </form>
  );
}

export function DoctorRow({ doctor }: { doctor: Doctor }) {
  const [specialty, setSpecialty] = useState(doctor.specialty);
  const [room, setRoom] = useState(doctor.room ?? "");
  const { pending, run } = useRun();
  return (
    <li className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_12rem_6rem_auto] md:items-end">
      <div>
        <p className="font-medium text-navy-900">{doctor.display_name}</p>
        {doctor.is_active ? <Badge tone="green">Accepting tokens</Badge> : <Badge tone="slate">Inactive</Badge>}
      </div>
      <Field label="Specialty">
        <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
      </Field>
      <Field label="Room">
        <Input value={room} onChange={(e) => setRoom(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button size="md" variant="secondary" disabled={pending} onClick={() => run(() => updateDoctor(doctor.id, { specialty, room, is_active: doctor.is_active }))}>
          Save
        </Button>
        <Button
          size="md"
          variant={doctor.is_active ? "danger" : "teal"}
          disabled={pending}
          onClick={() => run(() => updateDoctor(doctor.id, { specialty, room, is_active: !doctor.is_active }))}
        >
          {doctor.is_active ? "Deactivate" : "Activate"}
        </Button>
      </div>
    </li>
  );
}
