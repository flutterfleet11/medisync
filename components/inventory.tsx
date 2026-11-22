"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { addMedicine, adjustStock } from "@/app/actions/workflow";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Spinner } from "@/components/ui";
import type { Medicine } from "@/lib/types";

export function InventoryManager({ medicines }: { medicines: Medicine[] }) {
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const shown = medicines.filter((m) => `${m.name} ${m.generic_name ?? ""}`.toLowerCase().includes(filter.toLowerCase()));

  const adjust = (m: Medicine, delta: number) => {
    setBusy(`${m.id}:${delta}`);
    start(async () => {
      const res = await adjustStock(m.id, delta);
      if (res.ok) toast(res.message ?? "Updated");
      else toast(res.error, "error");
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card>
        <CardHeader
          title={`${medicines.length} medicines`}
          description={`${medicines.filter((m) => m.stock_qty === 0).length} out of stock · ${medicines.filter((m) => m.stock_qty > 0 && m.stock_qty <= m.reorder_level).length} low`}
          action={<Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="w-44" aria-label="Filter medicines" />}
        />
        {shown.length === 0 ? (
          <EmptyState title="No medicines" description="Add medicines to start tracking stock." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Medicine</th>
                  <th className="px-5 py-2.5 font-medium">Stock</th>
                  <th className="px-5 py-2.5 text-right font-medium">Adjust</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-navy-900">{m.name}</p>
                      <p className="text-xs text-slate-500">{[m.generic_name, m.form, m.strength].filter(Boolean).join(" · ") || "—"}</p>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{m.stock_qty}</span>
                        <span className="text-xs text-slate-500">{m.unit}</span>
                        {m.stock_qty === 0 ? <Badge tone="red">Out</Badge> : m.stock_qty <= m.reorder_level ? <Badge tone="amber">Low</Badge> : null}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        {[-10, -1, 1, 10, 50].map((d) => (
                          <Button
                            key={d}
                            size="sm"
                            variant="secondary"
                            className="px-2"
                            disabled={pending || (d < 0 && m.stock_qty === 0)}
                            onClick={() => adjust(m, d)}
                            aria-label={`${d > 0 ? "Add" : "Remove"} ${Math.abs(d)} ${m.name}`}
                          >
                            {busy === `${m.id}:${d}` ? <Spinner /> : d > 0 ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {Math.abs(d)}
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <AddMedicineCard />
    </div>
  );
}

function AddMedicineCard() {
  const blank = { name: "", generic_name: "", form: "Tablet", strength: "", stock_qty: 0, unit: "tablets", reorder_level: 20 };
  const [form, setForm] = useState(blank);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  return (
    <Card className="h-fit">
      <CardHeader title="Add medicine" />
      <form
        className="space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await addMedicine(form);
            if (res.ok) {
              toast(res.message ?? "Added");
              setForm(blank);
              router.refresh();
            } else toast(res.error, "error");
          });
        }}
      >
        <Field label="Name (as prescribed) *">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Paracetamol 500mg" required minLength={2} />
        </Field>
        <Field label="Generic name">
          <Input value={form.generic_name} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Form">
            <Input value={form.form} onChange={(e) => setForm({ ...form, form: e.target.value })} />
          </Field>
          <Field label="Strength">
            <Input value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} />
          </Field>
          <Field label="Opening stock">
            <Input type="number" min={0} value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: Number(e.target.value) })} />
          </Field>
          <Field label="Unit">
            <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </Field>
        </div>
        <Field label="Reorder level">
          <Input type="number" min={0} value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })} />
        </Field>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? <Spinner /> : null}
          Add to inventory
        </Button>
      </form>
    </Card>
  );
}
