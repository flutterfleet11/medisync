import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { ageFrom, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Patients" };

interface Row {
  patient_id: string;
  token_date: string;
  patient: { full_name: string; date_of_birth: string | null; gender: string | null; phone: string | null } | null;
}

export default async function DoctorPatientsPage() {
  const session = await requireStaff("doctor");
  const supabase = await createClient();
  const { data } = await supabase
    .from("tokens")
    .select("patient_id, token_date, patient:profiles!tokens_patient_id_fkey(full_name, date_of_birth, gender, phone)")
    .eq("doctor_id", session.doctor!.id)
    .order("token_date", { ascending: false })
    .limit(300);

  const seen = new Map<string, Row & { visits: number }>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const prev = seen.get(r.patient_id);
    if (prev) prev.visits += 1;
    else seen.set(r.patient_id, { ...r, visits: 1 });
  }
  const patients = [...seen.values()];

  return (
    <>
      <PageHeader title="Patients" description="Everyone who has booked with you. Open a patient to see their history." />
      <Card>
        <CardHeader title={`${patients.length} patient${patients.length === 1 ? "" : "s"}`} />
        {patients.length === 0 ? (
          <EmptyState title="No patients yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {patients.map((p) => {
              const age = ageFrom(p.patient?.date_of_birth);
              return (
                <li key={p.patient_id}>
                  <Link href={`/doctor/patients/${p.patient_id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50">
                    <div>
                      <p className="font-medium text-navy-900">{p.patient?.full_name ?? "Patient"}</p>
                      <p className="text-xs text-slate-500">
                        {[age != null ? `${age} y` : null, p.patient?.gender, p.patient?.phone].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500">
                      {p.visits} visit{p.visits === 1 ? "" : "s"} · last {formatDate(p.token_date)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
