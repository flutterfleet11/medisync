import type { Metadata } from "next";
import { callNextToken, setTokenStatus } from "@/app/actions/workflow";
import { ActionButton } from "@/components/action-button";
import { WalkInDesk } from "@/components/compounder/walk-in";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { TokenStatusBadge } from "@/components/status";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getClinicQueue, getQueueStates, listDoctors } from "@/lib/data";
import { topics } from "@/lib/realtime/topics";

export const metadata: Metadata = { title: "Queue & walk-ins" };

export default async function QueuePage() {
  const session = await requireStaff("compounder");
  const [doctors, tokens, states] = await Promise.all([
    listDoctors(session.clinic.id),
    getClinicQueue(session.clinic),
    getQueueStates(session.clinic),
  ]);

  return (
    <>
      <LiveRefresh topics={[topics.clinicQueue(session.clinic.id)]} />
      <PageHeader title="Queue & walk-ins" description="Front desk: register walk-ins, book tokens and control every doctor's queue." />

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card className="h-fit">
          <CardHeader title="Walk-in booking" description="Find or register the patient, then book." />
          {doctors.length ? <WalkInDesk doctors={doctors} /> : <EmptyState title="No active doctors" />}
        </Card>

        <div className="space-y-6">
          {doctors.length === 0 ? (
            <Card>
              <EmptyState title="No active doctors at this clinic" />
            </Card>
          ) : null}
          {doctors.map((d) => {
            const list = tokens.filter((t) => t.doctor_id === d.id && t.status !== "completed" && t.status !== "cancelled");
            const done = tokens.filter((t) => t.doctor_id === d.id && t.status === "completed").length;
            const st = states[d.id];
            return (
              <Card key={d.id}>
                <CardHeader
                  title={d.display_name}
                  description={`${d.specialty}${d.room ? ` · Room ${d.room}` : ""} · now serving #${st?.now_serving ?? "—"} · ${done} done`}
                  action={
                    <ActionButton action={callNextToken.bind(null, d.id)} disabled={!list.some((t) => t.status === "waiting")}>
                      Call next
                    </ActionButton>
                  }
                />
                {list.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-slate-500">No one in this queue.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {list.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="w-10 font-semibold tabular-nums text-navy-900">#{t.token_number}</span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-navy-900">{t.patient?.full_name ?? "Patient"}</p>
                            <p className="truncate text-xs text-slate-500">{t.reason ?? "—"}</p>
                          </div>
                          {t.source === "walk_in" ? <Badge tone="slate">Walk-in</Badge> : <Badge tone="blue">Online</Badge>}
                          <TokenStatusBadge status={t.status} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {t.status === "waiting" ? (
                            <ActionButton action={setTokenStatus.bind(null, t.id, "called")} variant="secondary">
                              Call
                            </ActionButton>
                          ) : null}
                          {t.status === "called" ? (
                            <ActionButton action={setTokenStatus.bind(null, t.id, "waiting")} variant="secondary">
                              Back to waiting
                            </ActionButton>
                          ) : null}
                          {t.status === "in_consultation" ? <span className="text-xs text-slate-500">With doctor</span> : null}
                          {t.status === "waiting" || t.status === "called" ? (
                            <ActionButton action={setTokenStatus.bind(null, t.id, "cancelled")} variant="ghost" confirm={`Cancel token #${t.token_number}?`}>
                              Cancel
                            </ActionButton>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
