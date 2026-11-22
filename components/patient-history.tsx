import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { RxStatusBadge } from "@/components/status";
import { EmptyState, MedicineChips } from "@/components/ui";
import type { HistoryEntry } from "@/lib/data";
import { formatDate } from "@/lib/format";

/**
 * Completed consultations. When `rxHrefBase` is given (patient view), each
 * entry with a prescription becomes a link to it.
 */
export function PatientHistoryList({
  history,
  emptyText = "No previous consultations.",
  rxHrefBase,
}: {
  history: HistoryEntry[];
  emptyText?: string;
  rxHrefBase?: string;
}) {
  if (history.length === 0) return <EmptyState title={emptyText} />;
  return (
    <ol className="divide-y divide-slate-100">
      {history.map((h) => {
        const body = (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-navy-900 group-hover:text-blue-700">{h.diagnosis ?? "Consultation"}</p>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                {formatDate(h.started_at)}
                {rxHrefBase && h.prescription ? <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-blue-500" /> : null}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {h.doctor?.display_name}
              {h.doctor?.specialty ? ` · ${h.doctor.specialty}` : ""}
            </p>
            {h.notes ? <p className="mt-1 text-sm text-slate-600">{h.notes}</p> : null}
            {h.prescription ? (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <RxStatusBadge status={h.prescription.status} />
                  <span className="text-xs text-slate-500">
                    {h.prescription.items.length} medicine{h.prescription.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <MedicineChips names={h.prescription.items.map((i) => `${i.medicine_name}${i.frequency ? ` · ${i.frequency}` : ""}`)} max={5} />
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-400">No medicines prescribed</p>
            )}
          </>
        );
        return (
          <li key={h.id}>
            {rxHrefBase && h.prescription ? (
              <Link href={`${rxHrefBase}/${h.prescription.id}`} className="group block px-5 py-4 hover:bg-slate-50">
                {body}
              </Link>
            ) : (
              <div className="px-5 py-4">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
