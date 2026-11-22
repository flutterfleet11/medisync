import type { Metadata } from "next";
import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import { PlacesSearch } from "@/components/places-search";
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { listClinics } from "@/lib/data";

export const metadata: Metadata = { title: "Find a clinic" };

export default async function ClinicsPage({ searchParams }: PageProps<"/patient/clinics">) {
  await requireRole("patient");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const clinics = await listClinics(q);

  return (
    <>
      <PageHeader title="Find a clinic" description="Book a token at a MediSync clinic, or discover other clinics nearby." />

      <form className="mb-6 flex gap-2" action="/patient/clinics">
        <Input name="q" defaultValue={q} placeholder="Search by clinic name, area or city" aria-label="Search clinics" />
        <Button type="submit">Search</Button>
      </form>

      <section className="mb-10">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">MediSync clinics</h2>
          <Badge tone="blue">Live tokens</Badge>
        </div>
        {clinics.length === 0 ? (
          <Card>
            <EmptyState title="No MediSync clinics match your search" description="Try another area, or look for nearby clinics below." />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {clinics.map((c) => (
              <Link key={c.id} href={`/patient/clinics/${c.id}`} className="group">
                <Card className="h-full p-5 transition-colors group-hover:border-blue-300">
                  <p className="text-base font-semibold text-navy-900">{c.name}</p>
                  {c.description ? <p className="mt-1 line-clamp-2 text-sm text-slate-500">{c.description}</p> : null}
                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    <p className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      {[c.address, c.city].filter(Boolean).join(", ")}
                    </p>
                    {c.opening_hours ? (
                      <p className="flex items-center gap-2">
                        <Clock className="h-4 w-4 shrink-0 text-slate-400" />
                        {c.opening_hours}
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-4 text-sm font-medium text-blue-700 group-hover:underline">View doctors &amp; book →</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader
          title="Discover clinics nearby"
          description="Google Maps listings via SerpApi. These clinics are not on MediSync yet — use directions or call them directly."
        />
        <div className="p-5">
          <PlacesSearch kind="clinic" defaultQuery={q || "clinic"} />
        </div>
      </Card>
    </>
  );
}
