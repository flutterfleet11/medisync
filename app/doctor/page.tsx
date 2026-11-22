import type { Metadata } from "next";
import Link from "next/link";
import { callNextToken, setTokenStatus, startConsultation } from "@/app/actions/workflow";
import { ActionButton } from "@/components/action-button";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { TokenStatusBadge } from "@/components/status";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, StatCard } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getDoctorQueue, getQueueStates } from "@/lib/data";
import { ageFrom, formatTime } from "@/lib/format";
import { topics } from "@/lib/realtime/topics";

export const metadata: Metadata = { title: "Today's queue" };

export default async function DoctorQueuePage() {
  const session = await requireStaff("doctor");
  const doctor = session.doctor!;
  const [queue, states] = await Promise.all([getDoctorQueue(doctor.id, session.clinic.timezone), getQueueStates(session.clinic)]);
  const state = states[doctor.id];
  const waiting = queue.filter((t) => t.status === "waiting").length;
  const done = queue.filter((t) => t.status === "completed").length;
  const current = queue.find((t) => t.status === "in_consultation");

  return (
    <>
      <LiveRefresh topics={[topics.queue(doctor.id)]} />
      <PageHeader
        title="Today's queue"
        description={`${doctor.display_name} · ${doctor.specialty}${doctor.room ? ` · Room ${doctor.room}` : ""}`}
        action={
          <ActionButton action={callNextToken.bind(null, doctor.id)} size="md" disabled={waiting === 0}>
            Call next patient
          </ActionButton>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Now serving" value={state?.now_serving ? `#${state.now_serving}` : "—"} tone="blue" />
        <StatCard label="Waiting" value={waiting} tone="amber" />
        <StatCard label="Completed today" value={done} tone="teal" />
      </div>

      {current ? (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-indigo-200 bg-indigo-50/50 p-4">
          <p className="text-sm text-navy-900">
            In consultation: <span className="font-semibold">#{current.token_number} {current.patient?.full_name}</span>
          </p>
          <LinkButton href={`/doctor/consult/${current.id}`} size="sm">
            Continue consultation
          </LinkButton>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Patients" description="Updates live as patients book, are called or complete." />
        {queue.length === 0 ? (
          <EmptyState title="No tokens yet today" description="Patients who book online or walk in will appear here in realtime." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Token</th>
                  <th className="px-5 py-2.5 font-medium">Patient</th>
                  <th className="px-5 py-2.5 font-medium">Reason</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queue.map((t) => {
                  const age = ageFrom(t.patient?.date_of_birth);
                  return (
                    <tr key={t.id} className={t.status === "completed" || t.status === "cancelled" ? "text-slate-400" : ""}>
                      <td className="px-5 py-3 font-semibold tabular-nums">
                        <Link href={`/doctor/consult/${t.id}`} className="hover:text-blue-700">
                          #{t.token_number}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <Link href={`/doctor/consult/${t.id}`} className="font-medium text-navy-900 hover:text-blue-700 hover:underline">
                          {t.patient?.full_name ?? "Patient"}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {[age != null ? `${age} y` : null, t.patient?.gender].filter(Boolean).join(" · ") || "—"} · booked {formatTime(t.created_at)}
                          {t.source === "walk_in" ? (
                            <Badge tone="slate" className="ml-2">
                              Walk-in
                            </Badge>
                          ) : null}
                        </p>
                      </td>
                      <td className="max-w-56 truncate px-5 py-3 text-slate-600">{t.reason ?? "—"}</td>
                      <td className="px-5 py-3">
                        <TokenStatusBadge status={t.status} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          {t.status === "waiting" ? (
                            <ActionButton action={setTokenStatus.bind(null, t.id, "called")} variant="secondary">
                              Call
                            </ActionButton>
                          ) : null}
                          {t.status === "waiting" || t.status === "called" ? (
                            <ActionButton action={startConsultation.bind(null, t.id)} redirectTo={`/doctor/consult/${t.id}`}>
                              Start consultation
                            </ActionButton>
                          ) : null}
                          {t.status === "in_consultation" ? (
                            <LinkButton href={`/doctor/consult/${t.id}`} size="sm">
                              Continue
                            </LinkButton>
                          ) : null}
                          {t.status === "waiting" || t.status === "called" ? (
                            <ActionButton action={setTokenStatus.bind(null, t.id, "cancelled")} variant="ghost" confirm={`Cancel token #${t.token_number}?`}>
                              Cancel
                            </ActionButton>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
