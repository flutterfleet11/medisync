"use client";

import { safeAction } from "@/lib/safe-action";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { bookWalkInToken, registerWalkInPatient, searchPatients, type PatientSearchHit } from "@/app/actions/workflow";
import { useToast } from "@/components/toast";
import { Button, Field, Input, Notice, Select, Spinner } from "@/components/ui";
import { ageFrom } from "@/lib/format";

type PatientHit = PatientSearchHit;

export function WalkInDesk({ doctors }: { doctors: { id: string; display_name: string; specialty: string }[] }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PatientHit[] | null>(null);
  const [patient, setPatient] = useState<{ id: string; full_name: string } | null>(null);
  const [doctorId, setDoctorId] = useState(doctors[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [reg, setReg] = useState({ full_name: "", phone: "", gender: "", date_of_birth: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const search = () =>
    start(async () => {
      setError(null);
      const res = await safeAction(() => searchPatients(query));
      if (res.ok) setHits(res.data ?? []);
      else setError(res.error);
    });

  const register = () =>
    start(async () => {
      setError(null);
      const res = await safeAction(() => registerWalkInPatient(reg));
      if (res.ok && res.data) {
        toast(res.message ?? "Registered");
        setPatient(res.data);
        setShowRegister(false);
        setReg({ full_name: "", phone: "", gender: "", date_of_birth: "" });
      } else if (!res.ok) setError(res.error);
    });

  const book = () =>
    start(async () => {
      if (!patient) return;
      setError(null);
      const res = await safeAction(() => bookWalkInToken(doctorId, patient.id, reason));
      if (res.ok) {
        toast(res.message ?? "Booked");
        setPatient(null);
        setHits(null);
        setQuery("");
        setReason("");
        router.refresh();
      } else setError(res.error);
    });

  return (
    <div className="space-y-4 p-5">
      {!patient ? (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone or exact email" aria-label="Search patients" />
            <Button type="submit" variant="secondary" disabled={pending || query.trim().length < 2}>
              {pending && !showRegister ? <Spinner /> : null}
              Search
            </Button>
          </form>
          <p className="text-xs text-slate-500">
            Name search covers patients who have visited this clinic. For anyone else, enter their exact email or full phone number.
          </p>
          {hits ? (
            hits.length === 0 ? (
              <p className="text-sm text-slate-500">No matching patients. Register them below.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {hits.map((h) => {
                  const age = ageFrom(h.date_of_birth);
                  return (
                    <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy-900">{h.full_name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {[age != null ? `${age} y` : null, h.gender, h.phone_masked ? `ph ${h.phone_masked}` : null, h.is_walk_in ? "walk-in record" : null, h.visited_clinic ? "visited before" : "new to clinic"]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => setPatient({ id: h.id, full_name: h.full_name })}>
                        Select
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}
          {!showRegister ? (
            <Button variant="ghost" size="sm" onClick={() => setShowRegister(true)}>
              <UserPlus className="h-4 w-4" /> Register new walk-in patient
            </Button>
          ) : (
            <form
              className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                register();
              }}
            >
              <Field label="Full name *">
                <Input value={reg.full_name} onChange={(e) => setReg({ ...reg, full_name: e.target.value })} required minLength={2} maxLength={120} />
              </Field>
              <Field label="Phone">
                <Input value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} type="tel" inputMode="tel" maxLength={20} pattern="\+?[0-9 \-\(\)]{7,20}" title="7–15 digits; may include +, spaces, - and brackets" />
              </Field>
              <Field label="Gender">
                <Select value={reg.gender} onChange={(e) => setReg({ ...reg, gender: e.target.value })}>
                  <option value="">—</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Other</option>
                </Select>
              </Field>
              <Field label="Date of birth">
                <Input type="date" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={reg.date_of_birth} onChange={(e) => setReg({ ...reg, date_of_birth: e.target.value })} />
              </Field>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={pending}>
                  {pending ? <Spinner /> : null}
                  Register patient
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowRegister(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2">
            <p className="text-sm text-navy-900">
              Patient: <span className="font-semibold">{patient.full_name}</span>
            </p>
            <Button size="sm" variant="ghost" onClick={() => setPatient(null)}>
              Change
            </Button>
          </div>
          <Field label="Doctor">
            <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.display_name} — {d.specialty}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason (optional)">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          </Field>
          <Button onClick={book} disabled={pending || !doctorId} className="w-full">
            {pending ? <Spinner /> : null}
            Book walk-in token
          </Button>
        </div>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}
