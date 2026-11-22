"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { completeConsultation, type RxItemInput } from "@/app/actions/workflow";
import { CopilotPanel } from "@/components/ai-answer";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, Field, Input, Notice, Select, Spinner, Textarea } from "@/components/ui";
import { FREQUENCY_OPTIONS, suggestQuantity } from "@/lib/format";

interface InventoryItem {
  name: string;
  stock_qty: number;
  unit: string;
}

type DraftItem = RxItemInput & { qtyTouched?: boolean };

const blankItem = (): DraftItem => ({
  medicine_name: "",
  dosage: "1 tablet",
  frequency: "BD",
  duration: "5 days",
  instructions: "",
  quantity: suggestQuantity("BD", "5 days"),
});

export function ConsultationWorkspace({
  tokenId,
  inventory,
  allergies,
  sidebar,
}: {
  tokenId: string;
  inventory: InventoryItem[];
  allergies: string | null;
  sidebar?: React.ReactNode;
}) {
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [advice, setAdvice] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [items, setItems] = useState<DraftItem[]>([blankItem()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const stockFor = (name: string) => inventory.find((m) => m.name.toLowerCase() === name.trim().toLowerCase());

  // Quantity follows frequency × duration until the doctor edits it by hand.
  const update = (idx: number, patch: Partial<RxItemInput>) =>
    setItems((list) =>
      list.map((it, i) => {
        if (i !== idx) return it;
        const next: DraftItem = { ...it, ...patch };
        if ("quantity" in patch) next.qtyTouched = true;
        else if (("frequency" in patch || "duration" in patch) && !it.qtyTouched) next.quantity = suggestQuantity(next.frequency, next.duration);
        return next;
      }),
    );

  const suggestions = useMemo(() => {
    const names = items.map((i) => i.medicine_name.trim()).filter(Boolean);
    const s: string[] = [];
    if (names.length >= 2) s.push(`Drug interactions between ${names.slice(0, 3).join(" and ")}?`);
    for (const n of names.slice(0, 2)) s.push(`Key contraindications and precautions for ${n}`);
    if (diagnosis.trim()) s.push(`First-line management guidelines for ${diagnosis.trim()}`);
    if (s.length === 0) s.push("Paracetamol maximum daily dose for adults", "Amoxicillin use in penicillin allergy");
    return s;
  }, [items, diagnosis]);

  const submit = () => {
    setError(null);
    if (!diagnosis.trim()) {
      setError("Diagnosis is required.");
      return;
    }
    start(async () => {
      try {
        const res = await completeConsultation({ tokenId, diagnosis, notes, advice, followUp, items });
        if (res.ok) {
          toast(res.message ?? "Saved");
          router.push("/doctor");
        } else {
          setError(res.error);
        }
      } catch {
        // Keep the form intact so nothing the doctor typed is lost.
        setError("Network error — your notes are still here. Please try saving again.");
      }
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Assessment" />
          <div className="grid gap-4 p-5">
            <Field label="Diagnosis *">
              <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Acute upper respiratory tract infection" maxLength={500} />
            </Field>
            <Field label="Clinical notes" hint="Visible to the patient and doctors at this clinic — not to the compounder.">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Symptoms, findings, vitals…" maxLength={2000} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Prescription"
            description="Medicines matched to clinic inventory are checked by the compounder on arrival."
            action={
              <Button variant="secondary" size="sm" onClick={() => setItems((l) => [...l, blankItem()])} disabled={items.length >= 25}>
                <Plus className="h-4 w-4" /> Add medicine
              </Button>
            }
          />
          {allergies ? (
            <div className="px-5 pt-4">
              <Notice tone="warn" title="Patient allergies">
                {allergies}
              </Notice>
            </div>
          ) : null}
          <datalist id="inventory-medicines">
            {inventory.map((m) => (
              <option key={m.name} value={m.name}>
                {m.stock_qty > 0 ? `${m.stock_qty} ${m.unit} in stock` : "Out of stock"}
              </option>
            ))}
          </datalist>
          <ul className="divide-y divide-slate-100">
            {items.map((item, idx) => {
              const stock = item.medicine_name.trim() ? stockFor(item.medicine_name) : undefined;
              return (
                <li key={idx} className="grid gap-3 px-5 py-4 sm:grid-cols-6">
                  <Field label={`Medicine ${idx + 1}`} className="sm:col-span-3">
                    <Input
                      list="inventory-medicines"
                      value={item.medicine_name}
                      onChange={(e) => update(idx, { medicine_name: e.target.value })}
                      placeholder="Start typing…"
                      maxLength={120}
                    />
                  </Field>
                  <Field label="Dosage" className="sm:col-span-2">
                    <Input value={item.dosage} onChange={(e) => update(idx, { dosage: e.target.value })} maxLength={60} required={Boolean(item.medicine_name.trim())} />
                  </Field>
                  <Field label="Qty">
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={item.quantity}
                      onChange={(e) => update(idx, { quantity: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Frequency" className="sm:col-span-2">
                    <Select value={item.frequency} onChange={(e) => update(idx, { frequency: e.target.value })}>
                      {FREQUENCY_OPTIONS.map((f) => (
                        <option key={f.code} value={f.code}>
                          {f.code} — {f.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Duration" className="sm:col-span-2">
                    <Input value={item.duration} onChange={(e) => update(idx, { duration: e.target.value })} maxLength={40} placeholder="e.g. 5 days" required={Boolean(item.medicine_name.trim())} />
                  </Field>
                  <div className="flex items-end sm:col-span-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setItems((l) => (l.length === 1 ? [blankItem()] : l.filter((_, i) => i !== idx)))}
                    >
                      <Trash2 className="h-4 w-4" /> Remove
                    </Button>
                  </div>
                  <Field label="Instructions" className="sm:col-span-6">
                    <Input
                      value={item.instructions}
                      onChange={(e) => update(idx, { instructions: e.target.value })}
                      placeholder="e.g. After food, with water"
                      maxLength={300}
                    />
                  </Field>
                  {item.medicine_name.trim() ? (
                    <div className="sm:col-span-6">
                      {stock ? (
                        stock.stock_qty >= (item.quantity || 1) ? (
                          <Badge tone="teal">In clinic stock · {stock.stock_qty} {stock.unit}</Badge>
                        ) : (
                          <Badge tone="red">
                            Low/no clinic stock ({stock.stock_qty}) — compounder will help find a nearby pharmacy
                          </Badge>
                        )
                      ) : (
                        <Badge tone="amber">Not in clinic inventory — patient will buy outside</Badge>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Advice & follow-up" />
          <div className="grid gap-4 p-5 sm:grid-cols-[1fr_12rem]">
            <Field label="Advice to patient">
              <Textarea value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="Rest, fluids, return if fever persists…" maxLength={1000} />
            </Field>
            <Field label="Follow-up date">
              <Input type="date" min={new Date().toISOString().slice(0, 10)} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
            </Field>
          </div>
        </Card>

        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={submit} disabled={pending}>
            {pending ? <Spinner /> : null}
            Save &amp; send to compounder
          </Button>
          <p className="text-xs text-slate-500">Saving completes the consultation and sends the prescription in realtime.</p>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Doctor Copilot" description="You.com · cited clinical reference" />
          <div className="p-5">
            <CopilotPanel suggestions={suggestions} />
          </div>
        </Card>
        {sidebar}
      </div>
    </div>
  );
}
