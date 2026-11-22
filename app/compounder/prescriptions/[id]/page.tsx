import Link from "next/link";
import { notFound } from "next/navigation";
import { DispensePanel } from "@/components/compounder/dispense-panel";
import { PlacesSearch } from "@/components/places-search";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { RxStatusBadge } from "@/components/status";
import { Card, CardHeader, Notice } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getPrescription, listMedicines } from "@/lib/data";
import { formatDate, formatDateTime, isUuid } from "@/lib/format";
import { topics } from "@/lib/realtime/topics";

export default async function DispensePage({ params }: PageProps<"/compounder/prescriptions/[id]">) {
  const session = await requireStaff("compounder");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  // Compounders see medicines only — diagnosis/notes stay with doctors (RLS).
  const rx = await getPrescription(id, false);
  if (!rx || rx.clinic_id !== session.clinic.id) notFound();
  const meds = await listMedicines(session.clinic.id);
  const byId = new Map(meds.map((m) => [m.id, m]));
  const unavailable = rx.items.filter((i) => i.status === "unavailable");

  return (
    <>
      <LiveRefresh topics={[topics.rx(rx.id)]} />
      <Link href="/compounder" className="text-sm text-slate-500 hover:text-navy-900">
        ← Prescription inbox
      </Link>
      <div className="mt-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{rx.patient?.full_name ?? "Patient"}</h1>
          <RxStatusBadge status={rx.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Prescribed by {rx.doctor?.display_name} · received {formatDateTime(rx.created_at)}
          {rx.follow_up_date ? ` · follow-up ${formatDate(rx.follow_up_date)}` : ""}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card className="h-fit">
          <CardHeader title="Medicines" description="Check the shelf, mark availability, then dispense. Stock is deducted atomically." />
          <DispensePanel
            prescriptionId={rx.id}
            rows={rx.items.map((i) => {
              const med = i.medicine_id ? byId.get(i.medicine_id) : undefined;
              return {
                id: i.id,
                medicine_name: i.medicine_name,
                dosage: i.dosage,
                frequency: i.frequency,
                duration: i.duration,
                instructions: i.instructions,
                quantity: i.quantity,
                status: i.status,
                stock: med ? med.stock_qty : null,
                unit: med ? med.unit : null,
              };
            })}
          />
          {rx.advice ? (
            <div className="border-t border-slate-100 px-5 py-4 text-sm">
              <span className="text-slate-500">Doctor&apos;s advice: </span>
              <span className="text-navy-900">{rx.advice}</span>
            </div>
          ) : null}
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Nearby pharmacies"
            description={
              unavailable.length
                ? `For: ${unavailable.map((i) => i.medicine_name).join(", ")}`
                : "Use when a medicine is unavailable at the clinic."
            }
          />
          <div className="space-y-4 p-5">
            {unavailable.length ? (
              <Notice tone="warn">
                {unavailable.length} medicine{unavailable.length === 1 ? " is" : "s are"} unavailable. Share a nearby pharmacy with the patient — the
                patient also sees this list. Never substitute without the doctor&apos;s confirmation.
              </Notice>
            ) : null}
            <PlacesSearch kind="pharmacy" defaultQuery="pharmacy" compact />
          </div>
        </Card>
      </div>
    </>
  );
}
