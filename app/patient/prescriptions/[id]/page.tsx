import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { MedicineExplainer } from "@/components/ai-answer";
import { PlacesSearch } from "@/components/places-search";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { ItemStatusBadge, RxStatusBadge } from "@/components/status";
import { Card, CardHeader, Notice } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getPrescription } from "@/lib/data";
import { explainFrequency, formatDate, isUuid } from "@/lib/format";
import { topics } from "@/lib/realtime/topics";

export default async function PatientPrescriptionPage({ params }: PageProps<"/patient/prescriptions/[id]">) {
  const session = await requireRole("patient");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const rx = await getPrescription(id, true);
  if (!rx || rx.patient_id !== session.userId) notFound();
  const unavailable = rx.items.filter((i) => i.status === "unavailable");

  return (
    <>
      <LiveRefresh topics={[topics.rx(rx.id)]} />
      <Link href="/patient/prescriptions" className="text-sm text-slate-500 hover:text-navy-900">
        ← Prescriptions
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Prescription</h1>
            <RxStatusBadge status={rx.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {rx.doctor?.display_name} · {rx.clinic?.name} · {formatDate(rx.created_at)}
          </p>
        </div>
        <a
          href={`/api/prescriptions/${rx.id}/pdf`}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Download className="h-4 w-4" /> Download PDF
        </a>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Medicines" description="Tap “Explain” for a plain-language summary with sources (You.com)." />
            <ul className="divide-y divide-slate-100">
              {rx.items.map((item) => {
                const freq = explainFrequency(item.frequency);
                return (
                  <li key={item.id} className="space-y-2 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-navy-900">{item.medicine_name}</p>
                        <p className="mt-0.5 text-sm text-slate-600">
                          {[item.dosage, item.frequency + (freq ? ` (${freq.toLowerCase()})` : ""), item.duration].filter((x) => x && x.trim()).join(" · ")}
                          {" "}· Qty {item.quantity}
                        </p>
                        {item.instructions ? <p className="mt-1 text-sm text-slate-500">{item.instructions}</p> : null}
                      </div>
                      <ItemStatusBadge status={item.status} />
                    </div>
                    <MedicineExplainer itemId={item.id} medicineName={item.medicine_name} />
                  </li>
                );
              })}
            </ul>
          </Card>

          {unavailable.length > 0 ? (
            <Card>
              <CardHeader
                title="Find unavailable medicines nearby"
                description={`Not available at the clinic: ${unavailable.map((i) => i.medicine_name).join(", ")}`}
              />
              <div className="space-y-4 p-5">
                <Notice tone="warn">
                  Buy exactly what was prescribed. Never substitute a different medicine without asking your doctor or pharmacist.
                </Notice>
                <PlacesSearch kind="pharmacy" defaultQuery="pharmacy" compact />
              </div>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Consultation</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Diagnosis</dt>
              <dd className="font-medium text-navy-900">{rx.consultation?.diagnosis ?? "—"}</dd>
            </div>
            {rx.advice ? (
              <div>
                <dt className="text-slate-500">Doctor&apos;s advice</dt>
                <dd className="text-navy-900">{rx.advice}</dd>
              </div>
            ) : null}
            {rx.follow_up_date ? (
              <div>
                <dt className="text-slate-500">Follow-up</dt>
                <dd className="font-medium text-navy-900">{formatDate(rx.follow_up_date)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-slate-500">Doctor</dt>
              <dd className="text-navy-900">
                {rx.doctor?.display_name} · {rx.doctor?.specialty}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
