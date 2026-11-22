import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getClinicQueue, getQueueStates, listDoctors, listMedicines, listPrescriptions } from "@/lib/data";
import { todayIn } from "@/lib/format";
import { integrationStatus } from "@/lib/integrations/status";
import { topics } from "@/lib/realtime/topics";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminOverview() {
  const session = await requireStaff("admin");
  const clinic = session.clinic;
  const [tokens, doctors, states, meds, rxs] = await Promise.all([
    getClinicQueue(clinic),
    listDoctors(clinic.id, false),
    getQueueStates(clinic),
    listMedicines(clinic.id),
    listPrescriptions({ clinicId: clinic.id, limit: 200 }),
  ]);
  const today = todayIn(clinic.timezone);
  const dayOf = new Intl.DateTimeFormat("en-CA", { timeZone: clinic.timezone });
  const rxToday = rxs.filter((r) => dayOf.format(new Date(r.created_at)) === today);
  const openRx = rxs.filter((r) => r.status === "sent" || r.status === "in_progress").length;
  const lowStock = meds.filter((m) => m.stock_qty <= m.reorder_level);
  const status = integrationStatus();

  const count = (s: string) => tokens.filter((t) => t.status === s).length;

  return (
    <>
      <LiveRefresh topics={[topics.clinicQueue(clinic.id), topics.clinicRx(clinic.id)]} />
      <PageHeader title={clinic.name} description={`Operational overview for ${today}`} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard href="/admin/patients" label="Tokens today" value={tokens.length} hint={`${count("completed")} completed · ${count("cancelled")} cancelled`} tone="blue" />
        <StatCard href="/admin/patients" label="Waiting now" value={count("waiting") + count("called")} hint={`${count("in_consultation")} in consultation`} tone="amber" />
        <StatCard href="/admin/patients" label="Prescriptions today" value={rxToday.length} hint={`${openRx} open to dispense`} tone="teal" />
        <StatCard href="/admin/inventory" label="Low / out of stock" value={lowStock.length} hint={`of ${meds.length} medicines`} tone={lowStock.length ? "red" : "slate"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Doctors" action={<LinkButton href="/admin/staff" variant="ghost" size="sm">Manage staff</LinkButton>} />
          {doctors.length === 0 ? (
            <EmptyState title="No doctors yet" description="Assign a registered user the doctor role from Staff & users." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {doctors.map((d) => {
                const mine = tokens.filter((t) => t.doctor_id === d.id);
                return (
                  <li key={d.id}>
                    <Link href="/admin/staff" className="group flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <div>
                      <p className="font-medium text-navy-900 group-hover:text-blue-700">{d.display_name}</p>
                      <p className="text-xs text-slate-500">{[d.qualification, d.specialty].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {!d.is_active ? <Badge tone="slate">Inactive</Badge> : null}
                      <Badge tone="blue">Now #{states[d.id]?.now_serving ?? "—"}</Badge>
                      <Badge tone="amber">{states[d.id]?.waiting_count ?? 0} waiting</Badge>
                      <Badge tone="green">{mine.filter((t) => t.status === "completed").length} done</Badge>
                    </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Low stock" action={<LinkButton href="/admin/inventory" variant="ghost" size="sm">Inventory</LinkButton>} />
            {lowStock.length === 0 ? (
              <EmptyState title="All medicines above reorder level" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {lowStock.slice(0, 8).map((m) => (
                  <li key={m.id}>
                    <Link href="/admin/inventory" className="group flex items-center justify-between px-5 py-2.5 text-sm hover:bg-slate-50">
                      <span className="text-navy-900 group-hover:text-blue-700">{m.name}</span>
                      <Badge tone={m.stock_qty === 0 ? "red" : "amber"}>
                        {m.stock_qty} {m.unit}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Integrations" description="Credential status on this server" />
            <ul className="divide-y divide-slate-100 text-sm">
              <li className="flex items-center justify-between px-5 py-2.5">
                <span>Nexconn realtime</span>
                {status.nexconn ? <Badge tone="teal">Configured</Badge> : <Badge tone="amber">Supabase Realtime fallback</Badge>}
              </li>
              <li className="flex items-center justify-between px-5 py-2.5">
                <span>SerpApi places</span>
                {status.serpapi ? <Badge tone="teal">Live</Badge> : <Badge tone="amber">Mock data</Badge>}
              </li>
              <li className="flex items-center justify-between px-5 py-2.5">
                <span>You.com answers</span>
                {status.youcom ? <Badge tone="teal">Live</Badge> : <Badge tone="amber">Offline sample</Badge>}
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
