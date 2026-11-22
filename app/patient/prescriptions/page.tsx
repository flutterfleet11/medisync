import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { RxStatusBadge } from "@/components/status";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { listPrescriptions } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { topics } from "@/lib/realtime/topics";

export const metadata: Metadata = { title: "Prescriptions" };

export default async function PatientPrescriptions() {
  const session = await requireRole("patient");
  const rxs = await listPrescriptions({ patientId: session.userId });

  return (
    <>
      <LiveRefresh topics={[topics.patient(session.userId)]} />
      <PageHeader title="Prescriptions" description="Digital prescriptions from your consultations, with live dispensing status." />
      <Card>
        {rxs.length === 0 ? (
          <EmptyState
            title="No prescriptions yet"
            description="After your consultation the doctor's prescription appears here automatically."
            action={<LinkButton href="/patient/clinics" variant="secondary">Book a visit</LinkButton>}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rxs.map((rx) => {
              const unavailable = rx.items.filter((i) => i.status === "unavailable").length;
              return (
                <li key={rx.id}>
                  <Link href={`/patient/prescriptions/${rx.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="font-medium text-navy-900">{rx.items.map((i) => i.medicine_name).join(", ")}</p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {rx.doctor?.display_name} · {rx.clinic?.name} · {formatDate(rx.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {unavailable ? <span className="text-xs font-medium text-red-700">{unavailable} unavailable</span> : null}
                      <RxStatusBadge status={rx.status} />
                    </div>
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
