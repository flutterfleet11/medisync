import Link from "next/link";
import { ChevronRight, Phone } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import type { ClinicPatient } from "@/lib/data";
import { ageFrom, formatDate } from "@/lib/format";

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

/** Clickable patient cards (doctor + admin). */
export function PatientDirectory({ patients, hrefBase, emptyText }: { patients: ClinicPatient[]; hrefBase: string; emptyText: string }) {
  if (patients.length === 0) {
    return (
      <Card>
        <EmptyState title="No patients yet" description={emptyText} />
      </Card>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {patients.map((p) => {
        const age = ageFrom(p.date_of_birth);
        return (
          <Link key={p.id} href={`${hrefBase}/${p.id}`} className="group">
            <Card className="flex h-full items-start gap-3 p-4 transition-all group-hover:-translate-y-0.5 group-hover:border-blue-300 group-hover:shadow-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
                {initials(p.full_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-navy-900 group-hover:text-blue-700">{p.full_name || "Unnamed patient"}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[age != null ? `${age} y` : null, p.gender, p.blood_group].filter(Boolean).join(" · ") || "No details yet"}
                </p>
                {p.phone ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                    <Phone className="h-3 w-3" /> {p.phone}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="blue">
                    {p.visits} visit{p.visits === 1 ? "" : "s"}
                  </Badge>
                  <Badge tone="slate">Last {formatDate(p.last_visit)}</Badge>
                  {p.allergies ? <Badge tone="red">Allergy: {p.allergies.slice(0, 24)}</Badge> : null}
                </div>
              </div>
              <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-500" />
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
