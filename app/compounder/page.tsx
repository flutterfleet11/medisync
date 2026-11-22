import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { RxStatusBadge } from "@/components/status";
import { Card, CardHeader, EmptyState, LinkButton, MedicineChips, PageHeader, StatCard } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getQueueStates, listDoctors, listPrescriptions, type RxSummary } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { topics } from "@/lib/realtime/topics";

export const metadata: Metadata = { title: "Prescriptions" };

function RxList({ list, empty }: { list: RxSummary[]; empty: string }) {
  if (list.length === 0) return <EmptyState title={empty} />;
  return (
    <ul className="divide-y divide-slate-100">
      {list.map((rx) => {
        const unavailable = rx.items.filter((i) => i.status === "unavailable").length;
        const dispensed = rx.items.filter((i) => i.status === "dispensed").length;
        return (
          <li key={rx.id}>
            <Link href={`/compounder/prescriptions/${rx.id}`} className="group flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
              <div className="min-w-0 space-y-1.5">
                <p className="font-semibold text-navy-900 group-hover:text-blue-700">{rx.patient?.full_name || "Patient"}</p>
                <p className="text-xs text-slate-500">
                  {rx.items.length} medicine{rx.items.length === 1 ? "" : "s"} · {rx.doctor?.display_name} · {formatDateTime(rx.created_at)}
                </p>
                <MedicineChips names={rx.items.map((i) => i.medicine_name)} max={4} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  {dispensed}/{rx.items.length} dispensed{unavailable ? ` · ${unavailable} unavailable` : ""}
                </span>
                <RxStatusBadge status={rx.status} />
                <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500" />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default async function CompounderHome() {
  const session = await requireStaff("compounder");
  const [open, recent, doctors, queue] = await Promise.all([
    listPrescriptions({ clinicId: session.clinic.id, statuses: ["sent", "in_progress"], limit: 50 }),
    listPrescriptions({ clinicId: session.clinic.id, statuses: ["partially_dispensed", "dispensed"], limit: 10 }),
    listDoctors(session.clinic.id),
    getQueueStates(session.clinic),
  ]);
  const fresh = open.filter((r) => r.status === "sent").length;
  const waiting = Object.values(queue).reduce((n, q) => n + q.waiting_count, 0);

  return (
    <>
      <LiveRefresh topics={[topics.clinicRx(session.clinic.id), topics.clinicQueue(session.clinic.id)]} />
      <PageHeader
        title="Prescription inbox"
        description="Prescriptions arrive here in realtime the moment a doctor saves them."
        action={<LinkButton href="/compounder/queue" variant="secondary">Queue &amp; walk-ins</LinkButton>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="New prescriptions" value={fresh} tone="blue" />
        <StatCard label="Open (to dispense)" value={open.length} tone="amber" />
        <StatCard label="Patients waiting" value={waiting} tone="teal" hint="Across all doctors today" href="/compounder/queue" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="To dispense" />
            <RxList list={open} empty="No prescriptions waiting — new ones appear here live." />
          </Card>
          <Card>
            <CardHeader title="Recently completed" />
            <RxList list={recent} empty="Nothing dispensed yet today." />
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Live queue" action={<LinkButton href="/compounder/queue" variant="ghost" size="sm">Manage</LinkButton>} />
          {doctors.length === 0 ? (
            <EmptyState title="No active doctors" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {doctors.map((d) => (
                <li key={d.id}>
                  <Link href="/compounder/queue" className="group flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy-900 group-hover:text-blue-700">{d.display_name}</p>
                      <p className="text-xs text-slate-500">{queue[d.id]?.waiting_count ?? 0} waiting</p>
                    </div>
                    <p className="text-sm text-slate-600">
                      Now <span className="font-semibold text-navy-900">#{queue[d.id]?.now_serving ?? "—"}</span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
