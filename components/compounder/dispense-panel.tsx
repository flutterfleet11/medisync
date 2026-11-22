"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dispenseItems, setItemAvailability } from "@/app/actions/workflow";
import { ItemStatusBadge } from "@/components/status";
import { useToast } from "@/components/toast";
import { Badge, Button, Spinner } from "@/components/ui";
import type { ItemStatus } from "@/lib/types";

export interface DispenseRow {
  id: string;
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string | null;
  quantity: number;
  status: ItemStatus;
  stock: number | null; // null = not in clinic inventory
  unit: string | null;
}

export function DispensePanel({ prescriptionId, rows }: { prescriptionId: string; rows: DispenseRow[] }) {
  const selectable = rows.filter((r) => r.status === "pending" || r.status === "available");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(selectable.filter((r) => r.stock != null && r.stock >= r.quantity).map((r) => r.id)),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const run = (key: string, fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
    setBusy(key);
    start(async () => {
      const res = await fn();
      if (res.ok) toast(res.message ?? "Updated");
      else toast(res.error ?? "Failed", "error");
      setBusy(null);
      router.refresh();
    });
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = [...selected].filter((id) => selectable.some((r) => r.id === id));

  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => {
          const canSelect = r.status === "pending" || r.status === "available";
          const enough = r.stock != null && r.stock >= r.quantity;
          return (
            <li key={r.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-blue-600"
                checked={canSelect && selected.has(r.id)}
                disabled={!canSelect || pending}
                onChange={() => toggle(r.id)}
                aria-label={`Select ${r.medicine_name} for dispensing`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-navy-900">{r.medicine_name}</p>
                  <ItemStatusBadge status={r.status} />
                </div>
                <p className="mt-0.5 text-sm text-slate-600">
                  {[r.dosage, r.frequency, r.duration].filter(Boolean).join(" · ")} · Qty {r.quantity}
                </p>
                {r.instructions ? <p className="text-sm text-slate-500">{r.instructions}</p> : null}
                <div className="mt-1.5">
                  {r.stock == null ? (
                    <Badge tone="amber">Not stocked at this clinic</Badge>
                  ) : enough ? (
                    <Badge tone="teal">
                      In stock: {r.stock} {r.unit}
                    </Badge>
                  ) : (
                    <Badge tone="red">
                      Insufficient stock: {r.stock} {r.unit}
                    </Badge>
                  )}
                </div>
              </div>
              {canSelect ? (
                <div className="flex gap-2">
                  {r.status !== "available" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || !enough}
                      title={enough ? "Confirm it's on the shelf" : "Not enough stock"}
                      onClick={() => run(`a-${r.id}`, () => setItemAvailability(r.id, true))}
                    >
                      {busy === `a-${r.id}` ? <Spinner /> : null}
                      Mark available
                    </Button>
                  ) : null}
                  <Button size="sm" variant="danger" disabled={pending} onClick={() => run(`u-${r.id}`, () => setItemAvailability(r.id, false))}>
                    {busy === `u-${r.id}` ? <Spinner /> : null}
                    Unavailable
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
        <p className="text-sm text-slate-500">
          {chosen.length} of {selectable.length} pending medicine{selectable.length === 1 ? "" : "s"} selected
        </p>
        <Button disabled={pending || chosen.length === 0} onClick={() => run("dispense", () => dispenseItems(prescriptionId, chosen))}>
          {busy === "dispense" ? <Spinner /> : null}
          Dispense selected
        </Button>
      </div>
    </div>
  );
}
