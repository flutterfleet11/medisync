import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { RxStatusBadge, TokenStatusBadge } from "@/components/status";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getQueuePosition, listPatientTokens, listPrescriptions } from "@/lib/data";
import { formatDate, waitLabel } from "@/lib/format";
import { topics } from "@/lib/realtime/topics";

export default async function PatientDashboard() {
  const session = await requireRole("patient");
  const [tokens, prescriptions] = await Promise.all([
    listPatientTokens(session.userId, 15),
    listPrescriptions({ patientId: session.userId, limit: 5 }),
  ]);
  const active = tokens.filter((t) => ["waiting", "called", "in_consultation"].includes(t.status));
  const positions = await Promise.all(active.map((t) => getQueuePosition(t.id)));
  const past = tokens.filter((t) => !active.includes(t)).slice(0, 6);
  const firstName = session.profile.full_name.split(" ")[0];

  return (
    <>
      <LiveRefresh topics={[topics.patient(session.userId), ...active.map((t) => topics.queue(t.doctor_id))]} />
      <PageHeader
        title={`Hello, ${firstName}`}
        description="Your tokens, live queue position and prescriptions in one place."
        action={<LinkButton href="/patient/clinics">Book a token</LinkButton>}
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Active tokens</h2>
        {active.length === 0 ? (
          <Card>
            <EmptyState
              title="No active tokens"
              description="Find a clinic and book a token to see your live queue position here."
              action={<LinkButton href="/patient/clinics" variant="secondary">Find a clinic</LinkButton>}
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {active.map((t, i) => {
              const pos = positions[i];
              return (
                <Link key={t.id} href={`/patient/tokens/${t.id}`} className="group">
                  <Card className="flex items-center gap-5 p-5 transition-colors group-hover:border-blue-300">
                    <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-xl bg-navy-900 text-white">
                      <span className="text-[10px] uppercase tracking-wider text-slate-300">Token</span>
                      <span className="text-3xl font-semibold">{t.token_number}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <TokenStatusBadge status={t.status} />
                        <span className="text-xs text-slate-500">{t.clinic?.name}</span>
                      </div>
                      <p className="mt-1 truncate font-medium text-navy-900">{t.doctor?.display_name}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Now serving <span className="font-semibold">#{pos?.now_serving ?? "—"}</span>
                        {t.status === "waiting" && pos ? (
                          <>
                            {" "}· {pos.tokens_ahead} ahead · {waitLabel(pos.est_wait_minutes)}
                          </>
                        ) : null}
                        {t.status === "called" ? <span className="font-semibold text-blue-700"> · It&apos;s your turn</span> : null}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent prescriptions"
            action={<LinkButton href="/patient/prescriptions" variant="ghost" size="sm">View all</LinkButton>}
          />
          {prescriptions.length === 0 ? (
            <EmptyState title="No prescriptions yet" description="Prescriptions from your consultations appear here instantly." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {prescriptions.map((rx) => (
                <li key={rx.id}>
                  <Link href={`/patient/prescriptions/${rx.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy-900">
                        {rx.items.map((i) => i.medicine_name).join(", ") || "Prescription"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {rx.doctor?.display_name} · {formatDate(rx.created_at)}
                      </p>
                    </div>
                    <RxStatusBadge status={rx.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent visits" action={<LinkButton href="/patient/profile" variant="ghost" size="sm">Full history</LinkButton>} />
          {past.length === 0 ? (
            <EmptyState title="No past visits" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {past.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-navy-900">
                      #{t.token_number} · {t.doctor?.display_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t.clinic?.name} · {formatDate(t.token_date)}
                    </p>
                  </div>
                  <TokenStatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
