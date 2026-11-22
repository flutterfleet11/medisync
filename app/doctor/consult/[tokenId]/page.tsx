import Link from "next/link";
import { notFound } from "next/navigation";
import { startConsultation } from "@/app/actions/workflow";
import { ActionButton } from "@/components/action-button";
import { ConsultationWorkspace } from "@/components/doctor/consultation-form";
import { PatientHistoryList } from "@/components/patient-history";
import { TokenStatusBadge } from "@/components/status";
import { Card, CardHeader, LinkButton, Notice } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getPatientHistory, getPrescriptionIdForToken, getTokenWithPatient, listMedicines } from "@/lib/data";
import { ageFrom, formatDate, isUuid } from "@/lib/format";

export default async function ConsultPage({ params }: PageProps<"/doctor/consult/[tokenId]">) {
  const session = await requireStaff("doctor");
  const { tokenId } = await params;
  if (!isUuid(tokenId)) notFound();
  const token = await getTokenWithPatient(tokenId);
  if (!token || token.doctor_id !== session.doctor!.id) notFound();

  const [history_, inventory, rxId] = await Promise.all([
    getPatientHistory(token.patient_id, 10),
    token.status === "in_consultation" ? listMedicines(session.clinic.id) : Promise.resolve([]),
    token.status === "completed" ? getPrescriptionIdForToken(token.id) : Promise.resolve(null),
  ]);
  const p = token.patient;
  const age = ageFrom(p?.date_of_birth);
  const history = (
    <Card className="h-fit">
      <CardHeader title="Patient history" description="At this clinic" />
      <PatientHistoryList history={history_} emptyText="First visit — no previous consultations." />
    </Card>
  );

  return (
    <>
      <Link href="/doctor" className="text-sm text-slate-500 hover:text-navy-900">
        ← Today&apos;s queue
      </Link>
      <div className="mt-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
            #{token.token_number} · {p?.full_name ?? "Patient"}
          </h1>
          <TokenStatusBadge status={token.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {[age != null ? `${age} years` : null, p?.gender, p?.blood_group ? `Blood ${p.blood_group}` : null, p?.phone]
            .filter(Boolean)
            .join(" · ") || "No demographics recorded"}
          {token.reason ? ` · Reason: ${token.reason}` : ""}
        </p>
      </div>

      {token.status === "in_consultation" ? (
        <ConsultationWorkspace
          tokenId={token.id}
          allergies={p?.allergies ?? null}
          inventory={inventory.map((m) => ({ name: m.name, stock_qty: m.stock_qty, unit: m.unit }))}
          sidebar={history}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0">
            {token.status === "waiting" || token.status === "called" ? (
              <Card className="p-6">
                <p className="text-sm text-slate-600">Start the consultation to record the diagnosis and prescription.</p>
                <div className="mt-4">
                  <ActionButton action={startConsultation.bind(null, token.id)} size="md">
                    Start consultation
                  </ActionButton>
                </div>
              </Card>
            ) : null}
            {token.status === "completed" ? (
              <Notice tone="success" title={`Consultation completed ${formatDate(token.completed_at)}`}>
                {rxId ? "The prescription was sent to the compounder." : "No prescription was issued."}
                <div className="mt-3">
                  <LinkButton href="/doctor" size="sm" variant="secondary">
                    Back to queue
                  </LinkButton>
                </div>
              </Notice>
            ) : null}
            {token.status === "cancelled" ? <Notice tone="warn" title="This token was cancelled." /> : null}
          </div>
          {history}
        </div>
      )}
    </>
  );
}
