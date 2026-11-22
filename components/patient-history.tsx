import { RxStatusBadge } from "@/components/status";
import { EmptyState } from "@/components/ui";
import type { HistoryEntry } from "@/lib/data";
import { formatDate } from "@/lib/format";

/** Read-only list of completed consultations (used by patient, doctor). */
export function PatientHistoryList({ history, emptyText = "No previous consultations." }: { history: HistoryEntry[]; emptyText?: string }) {
  if (history.length === 0) return <EmptyState title={emptyText} />;
  return (
    <ol className="divide-y divide-slate-100">
      {history.map((h) => (
        <li key={h.id} className="px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-navy-900">{h.diagnosis ?? "Consultation"}</p>
            <span className="text-xs text-slate-500">{formatDate(h.started_at)}</span>
          </div>
          <p className="text-xs text-slate-500">{h.doctor?.display_name}</p>
          {h.notes ? <p className="mt-1 text-sm text-slate-600">{h.notes}</p> : null}
          {h.prescription ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RxStatusBadge status={h.prescription.status} />
              <span className="text-xs text-slate-600">
                {h.prescription.items.map((i) => `${i.medicine_name} (${[i.dosage, i.frequency, i.duration].filter(Boolean).join(", ")})`).join("; ")}
              </span>
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
