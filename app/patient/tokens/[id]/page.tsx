import Link from "next/link";
import { notFound } from "next/navigation";
import { setTokenStatus } from "@/app/actions/workflow";
import { ActionButton } from "@/components/action-button";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { TokenStatusBadge } from "@/components/status";
import { Card, LinkButton, Notice } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getPrescriptionIdForToken, getQueuePosition, getTokenForPatient } from "@/lib/data";
import { formatDate, formatTime, isUuid, waitLabel } from "@/lib/format";
import { topics } from "@/lib/realtime/topics";

export default async function TokenPage({ params }: PageProps<"/patient/tokens/[id]">) {
  const session = await requireRole("patient");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const token = await getTokenForPatient(id);
  if (!token || token.patient_id !== session.userId) notFound();
  const [pos, rxId] = await Promise.all([
    getQueuePosition(id),
    token.status === "completed" ? getPrescriptionIdForToken(id) : Promise.resolve(null),
  ]);
  const cancelAction = setTokenStatus.bind(null, token.id, "cancelled");

  return (
    <>
      <LiveRefresh topics={[topics.queue(token.doctor_id), topics.patient(session.userId)]} />
      <Link href="/patient" className="text-sm text-slate-500 hover:text-navy-900">
        ← Dashboard
      </Link>

      <div className="mt-3 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="overflow-hidden">
          <div className="bg-navy-900 px-6 py-8 text-center text-white">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Your token</p>
            <p className="mt-1 text-7xl font-semibold tabular-nums">{token.token_number}</p>
            <div className="mt-3 flex justify-center">
              <TokenStatusBadge status={token.status} />
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 text-center">
            <div className="px-3 py-4">
              <p className="text-xs text-slate-500">Now serving</p>
              <p className="mt-1 text-2xl font-semibold text-navy-900 tabular-nums">{pos?.now_serving ?? "—"}</p>
            </div>
            <div className="px-3 py-4">
              <p className="text-xs text-slate-500">Ahead of you</p>
              <p className="mt-1 text-2xl font-semibold text-navy-900 tabular-nums">{pos?.tokens_ahead ?? 0}</p>
            </div>
            <div className="px-3 py-4">
              <p className="text-xs text-slate-500">Est. wait</p>
              <p className="mt-1 text-lg font-semibold text-navy-900">
                {token.status === "waiting" ? waitLabel(pos?.est_wait_minutes ?? 0) : "—"}
              </p>
            </div>
          </div>
          <div className="space-y-4 p-6">
            {token.status === "waiting" ? (
              <Notice tone="info" title="You're in the queue">
                This page updates live — you don&apos;t need to refresh. We&apos;ll show it here when you&apos;re called.
              </Notice>
            ) : null}
            {token.status === "called" ? (
              <Notice tone="success" title="It's your turn!">
                Please proceed to {token.doctor?.room ? `Room ${token.doctor.room}` : "the doctor's room"}.
              </Notice>
            ) : null}
            {token.status === "in_consultation" ? <Notice tone="info" title="You're in consultation" /> : null}
            {token.status === "completed" ? (
              <Notice tone="success" title="Consultation complete">
                {rxId ? (
                  <Link href={`/patient/prescriptions/${rxId}`} className="font-medium underline">
                    View your prescription →
                  </Link>
                ) : (
                  "No medicines were prescribed for this visit."
                )}
              </Notice>
            ) : null}
            {token.status === "cancelled" ? <Notice tone="warn" title="This token was cancelled" /> : null}

            {token.status === "waiting" || token.status === "called" ? (
              <ActionButton action={cancelAction} variant="danger" confirm="Cancel this token?">
                Cancel token
              </ActionButton>
            ) : (
              <LinkButton href="/patient/clinics" variant="secondary" size="sm">
                Book another visit
              </LinkButton>
            )}
          </div>
        </Card>

        <Card className="h-fit p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Appointment</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Doctor</dt>
              <dd className="font-medium text-navy-900">
                {token.doctor?.display_name} <span className="font-normal text-slate-500">· {token.doctor?.specialty}</span>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Clinic</dt>
              <dd className="font-medium text-navy-900">{token.clinic?.name}</dd>
              <dd className="text-slate-500">{[token.clinic?.address, token.clinic?.city].filter(Boolean).join(", ")}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Date</dt>
              <dd className="font-medium text-navy-900">
                {formatDate(token.token_date)} · booked {formatTime(token.created_at)} ({token.source === "walk_in" ? "walk-in" : "online"})
              </dd>
            </div>
            {token.reason ? (
              <div>
                <dt className="text-slate-500">Reason</dt>
                <dd className="text-navy-900">{token.reason}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      </div>
    </>
  );
}
