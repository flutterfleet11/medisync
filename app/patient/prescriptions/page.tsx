import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronRight, Stethoscope } from "lucide-react";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { RxStatusBadge } from "@/components/status";
import { Card, EmptyState, LinkButton, MedicineChips, PageHeader } from "@/components/ui";
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
      {rxs.length === 0 ? (
        <Card>
          <EmptyState
            title="No prescriptions yet"
            description="After your consultation the doctor's prescription appears here automatically."
            action={<LinkButton href="/patient/clinics" variant="secondary">Book a visit</LinkButton>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rxs.map((rx) => {
            const unavailable = rx.items.filter((i) => i.status === "unavailable").length;
            const dispensed = rx.items.filter((i) => i.status === "dispensed").length;
            return (
              <Link key={rx.id} href={`/patient/prescriptions/${rx.id}`} className="group">
                <Card className="flex h-full flex-col gap-3 p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-blue-300 group-hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-navy-900 group-hover:text-blue-700">
                        <Stethoscope className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate">{rx.doctor?.display_name ?? "Doctor"}</span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <CalendarDays className="h-3.5 w-3.5" /> {formatDate(rx.created_at)} · {rx.clinic?.name}
                      </p>
                    </div>
                    <RxStatusBadge status={rx.status} />
                  </div>
                  <MedicineChips names={rx.items.map((i) => i.medicine_name)} />
                  <div className="mt-auto flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {dispensed}/{rx.items.length} dispensed
                      {unavailable ? <span className="font-medium text-red-700"> · {unavailable} to buy outside</span> : null}
                    </span>
                    <span className="flex items-center gap-0.5 font-medium text-blue-700">
                      View <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${rx.items.length ? (dispensed / rx.items.length) * 100 : 0}%` }} />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
