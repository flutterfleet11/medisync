import { Download } from "lucide-react";

const FORMATS = [
  { format: "xlsx", label: "Excel" },
  { format: "csv", label: "CSV" },
  { format: "pdf", label: "PDF" },
  { format: "json", label: "JSON" },
];

/** Download links for /api/export/{dataset} in every supported format. */
export function ExportMenu({ dataset, label = "Export" }: { dataset: "inventory" | "patients"; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
        <Download className="h-3.5 w-3.5" /> {label}
      </span>
      {FORMATS.map((f) => (
        <a
          key={f.format}
          href={`/api/export/${dataset}?format=${f.format}`}
          download
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          {f.label}
        </a>
      ))}
    </div>
  );
}
