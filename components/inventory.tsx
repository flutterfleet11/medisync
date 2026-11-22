"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Pencil, Pill, Plus, Search, Trash2, X } from "lucide-react";
import { addMedicine, adjustStock, deleteMedicine, setStock, updateMedicine, type MedicineInput } from "@/app/actions/workflow";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Spinner, cn } from "@/components/ui";
import { safeAction } from "@/lib/safe-action";
import type { ActionResult, Medicine } from "@/lib/types";

const FORMS = ["Tablet", "Capsule", "Syrup", "Injection", "Inhaler", "Drops", "Ointment", "Cream", "Sachet", "Other"];
type Filter = "all" | "low" | "out";

function useRunner() {
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const run = (key: string, fn: () => Promise<ActionResult<unknown>>, onOk?: () => void) => {
    setBusy(key);
    start(async () => {
      const res = await safeAction(fn);
      if (res.ok) {
        toast(res.message ?? "Saved");
        onOk?.();
      } else toast(res.error, "error");
      setBusy(null);
      router.refresh();
    });
  };
  return { busy, pending, run };
}

export function InventoryManager({ medicines }: { medicines: Medicine[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const out = medicines.filter((m) => m.stock_qty === 0).length;
  const low = medicines.filter((m) => m.stock_qty > 0 && m.stock_qty <= m.reorder_level).length;

  const shown = medicines.filter((m) => {
    const text = `${m.name} ${m.generic_name ?? ""} ${m.form ?? ""}`.toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (filter === "out") return m.stock_qty === 0;
    if (filter === "low") return m.stock_qty > 0 && m.stock_qty <= m.reorder_level;
    return true;
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", `All (${medicines.length})`],
                ["low", `Low (${low})`],
                ["out", `Out of stock (${out})`],
              ] as [Filter, string][]
            ).map(([f, label]) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                  filter === f ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search medicines" className="pl-9" aria-label="Search medicines" />
          </div>
        </div>
        {medicines.length === 0 ? (
          <EmptyState title="No medicines yet" description="Add your first medicine with the form on the right. Doctors will see stock while prescribing." />
        ) : shown.length === 0 ? (
          <EmptyState title="Nothing matches" description="Try another search or filter." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((m) => (
              <MedicineRow key={m.id} medicine={m} />
            ))}
          </ul>
        )}
      </Card>
      <MedicineFormCard />
    </div>
  );
}

function stockTone(m: Medicine) {
  if (m.stock_qty === 0) return <Badge tone="red">Out of stock</Badge>;
  if (m.stock_qty <= m.reorder_level) return <Badge tone="amber">Low · reorder at {m.reorder_level}</Badge>;
  return <Badge tone="green">In stock</Badge>;
}

function MedicineRow({ medicine: m }: { medicine: Medicine }) {
  const [editing, setEditing] = useState(false);
  const [count, setCount] = useState(String(m.stock_qty));
  const [synced, setSynced] = useState(m.stock_qty);
  const { busy, pending, run } = useRunner();

  // Keep the input in sync when the server value changes (after +/- or another user's edit).
  if (synced !== m.stock_qty) {
    setSynced(m.stock_qty);
    setCount(String(m.stock_qty));
  }
  const dirty = count !== String(m.stock_qty);
  const validCount = /^\d+$/.test(count) && Number(count) <= 1_000_000;

  if (editing) {
    return (
      <li className="bg-slate-50/60 px-5 py-4">
        <MedicineForm
          initial={m}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={(values, done) => run("edit", () => updateMedicine(m.id, values), () => {
            setEditing(false);
            done();
          })}
          pending={pending && busy === "edit"}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 px-5 py-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
          <Pill className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-navy-900">{m.name}</p>
            {stockTone(m)}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{[m.generic_name, m.form, m.strength].filter(Boolean).join(" · ") || "No details"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" className="px-2" disabled={pending || m.stock_qty === 0} onClick={() => run("dec", () => adjustStock(m.id, -1))} aria-label={`Remove 1 ${m.name}`}>
            {busy === "dec" ? <Spinner /> : <Minus className="h-3.5 w-3.5" />}
          </Button>
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (dirty && validCount) run("set", () => setStock(m.id, Number(count)));
            }}
          >
            <div className="w-24 shrink-0">
              <Input
                value={count}
                onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className={cn("h-8 text-center tabular-nums", !validCount && "border-red-400")}
                aria-label={`Stock count for ${m.name}`}
              />
            </div>
            {dirty ? (
              <Button type="submit" size="sm" disabled={pending || !validCount}>
                {busy === "set" ? <Spinner /> : null}
                Set
              </Button>
            ) : null}
          </form>
          <Button size="sm" variant="secondary" className="px-2" disabled={pending} onClick={() => run("inc", () => adjustStock(m.id, 1))} aria-label={`Add 1 ${m.name}`}>
            {busy === "inc" ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
          <Button size="sm" variant="secondary" className="px-2" disabled={pending} onClick={() => run("inc10", () => adjustStock(m.id, 10))} aria-label={`Add 10 ${m.name}`}>
            {busy === "inc10" ? <Spinner /> : "+10"}
          </Button>
          <span className="ml-1 text-xs text-slate-500">{m.unit}</span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(true)} aria-label={`Edit ${m.name}`}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            disabled={pending}
            aria-label={`Delete ${m.name}`}
            onClick={() => {
              if (window.confirm(`Delete ${m.name} from inventory?\n\nPast prescriptions keep the medicine name; only the stock record is removed.`)) {
                run("del", () => deleteMedicine(m.id));
              }
            }}
          >
            {busy === "del" ? <Spinner /> : <Trash2 className="h-3.5 w-3.5" />} Delete
          </Button>
        </div>
      </div>
    </li>
  );
}

const emptyMedicine: MedicineInput = { name: "", generic_name: "", form: "Tablet", strength: "", stock_qty: 0, unit: "tablets", reorder_level: 20 };

function MedicineForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  pending,
}: {
  initial?: Partial<Medicine>;
  submitLabel: string;
  onSubmit: (values: MedicineInput, done: () => void) => void;
  onCancel?: () => void;
  pending: boolean;
}) {
  const [f, setF] = useState<MedicineInput>({
    name: initial?.name ?? emptyMedicine.name,
    generic_name: initial?.generic_name ?? "",
    form: initial?.form ?? emptyMedicine.form,
    strength: initial?.strength ?? "",
    stock_qty: initial?.stock_qty ?? 0,
    unit: initial?.unit ?? emptyMedicine.unit,
    reorder_level: initial?.reorder_level ?? emptyMedicine.reorder_level,
  });
  const set = (k: keyof MedicineInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: k === "stock_qty" || k === "reorder_level" ? Number(e.target.value) : e.target.value });

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(f, () => setF({ ...emptyMedicine }));
      }}
    >
      <Field label="Name (as doctors prescribe it) *" className="sm:col-span-2">
        <Input value={f.name} onChange={set("name")} placeholder="e.g. Paracetamol 500mg" required minLength={2} maxLength={120} />
      </Field>
      <Field label="Generic name">
        <Input value={f.generic_name} onChange={set("generic_name")} maxLength={120} />
      </Field>
      <Field label="Form">
        <select value={f.form} onChange={set("form")} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
          {FORMS.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </Field>
      <Field label="Strength">
        <Input value={f.strength} onChange={set("strength")} placeholder="500 mg" maxLength={40} />
      </Field>
      <Field label="Unit *">
        <Input value={f.unit} onChange={set("unit")} placeholder="tablets" required maxLength={20} />
      </Field>
      <Field label="Stock count *">
        <Input type="number" min={0} max={1000000} step={1} value={f.stock_qty} onChange={set("stock_qty")} required />
      </Field>
      <Field label="Reorder level *" hint="Shows 'Low' at or below this">
        <Input type="number" min={0} max={1000000} step={1} value={f.reorder_level} onChange={set("reorder_level")} required />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner /> : null}
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4" /> Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function MedicineFormCard() {
  const { busy, pending, run } = useRunner();
  return (
    <Card className="h-fit">
      <CardHeader title="Add medicine" description="Exact names help prescriptions match stock automatically." />
      <div className="p-5">
        <MedicineForm submitLabel="Add to inventory" pending={pending && busy === "add"} onSubmit={(values, done) => run("add", () => addMedicine(values), done)} />
      </div>
    </Card>
  );
}
