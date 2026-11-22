import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, MapPin, Phone } from "lucide-react";
import { BookTokenForm } from "@/components/patient/booking";
import { LiveRefresh } from "@/components/realtime/live-refresh";
import { Badge, Card, CardHeader, EmptyState, LinkButton } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getClinic, getQueueStates, listDoctors, listPatientTokens } from "@/lib/data";
import { isUuid, todayIn, waitLabel } from "@/lib/format";
import { topics } from "@/lib/realtime/topics";

export default async function ClinicDetailPage({ params }: PageProps<"/patient/clinics/[id]">) {
  const session = await requireRole("patient");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const clinic = await getClinic(id);
  if (!clinic) notFound();

  const [doctors, queue, myTokens] = await Promise.all([
    listDoctors(clinic.id),
    getQueueStates(clinic),
    listPatientTokens(session.userId, 20),
  ]);
  const today = todayIn(clinic.timezone);
  const activeByDoctor = new Map(
    myTokens
      .filter((t) => t.token_date === today && ["waiting", "called", "in_consultation"].includes(t.status))
      .map((t) => [t.doctor_id, t]),
  );
  const mapsUrl =
    clinic.latitude != null && clinic.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${clinic.latitude},${clinic.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${clinic.name} ${clinic.address} ${clinic.city}`)}`;

  return (
    <>
      <LiveRefresh topics={doctors.map((d) => topics.queue(d.id))} />
      <Link href="/patient/clinics" className="text-sm text-slate-500 hover:text-navy-900">
        ← All clinics
      </Link>
      <Card className="mt-3 mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{clinic.name}</h1>
            {clinic.description ? <p className="mt-1 max-w-2xl text-sm text-slate-600">{clinic.description}</p> : null}
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-slate-400" />
                {[clinic.address, clinic.city].filter(Boolean).join(", ")}
              </span>
              {clinic.opening_hours ? (
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-400" />
                  {clinic.opening_hours}
                </span>
              ) : null}
              {clinic.phone ? (
                <a href={`tel:${clinic.phone}`} className="flex items-center gap-2 hover:text-blue-700">
                  <Phone className="h-4 w-4 text-slate-400" />
                  {clinic.phone}
                </a>
              ) : null}
            </div>
          </div>
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-navy-900 hover:bg-slate-50">
            Directions
          </a>
        </div>
      </Card>

      <Card>
        <CardHeader title="Doctors today" description={`Average consultation ~${clinic.avg_consult_minutes} min. Queue updates live.`} />
        {doctors.length === 0 ? (
          <EmptyState title="No doctors available" description="This clinic has no active doctors right now." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {doctors.map((d) => {
              const q = queue[d.id];
              const mine = activeByDoctor.get(d.id);
              const waiting = q?.waiting_count ?? 0;
              return (
                <li key={d.id} className="grid gap-4 px-5 py-5 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy-900">{d.display_name}</p>
                    <p className="text-sm text-slate-500">
                      {d.specialty}
                      {d.qualification ? ` · ${d.qualification}` : ""}
                      {d.room ? ` · Room ${d.room}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone="blue">Now serving #{q?.now_serving ?? "—"}</Badge>
                      <Badge tone="amber">{waiting} waiting</Badge>
                      <Badge tone="slate">Est. wait {waitLabel(waiting * clinic.avg_consult_minutes)}</Badge>
                    </div>
                  </div>
                  <div className="md:w-[26rem]">
                    {mine ? (
                      <LinkButton href={`/patient/tokens/${mine.id}`} variant="teal" className="w-full">
                        View your token #{mine.token_number}
                      </LinkButton>
                    ) : (
                      <BookTokenForm doctorId={d.id} doctorName={d.display_name} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
