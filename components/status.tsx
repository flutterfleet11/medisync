import { Badge, type Tone } from "@/components/ui";
import type { ItemStatus, PrescriptionStatus, TokenStatus } from "@/lib/types";

const TOKEN: Record<TokenStatus, [string, Tone]> = {
  waiting: ["Waiting", "amber"],
  called: ["Called", "blue"],
  in_consultation: ["In consultation", "violet"],
  completed: ["Completed", "green"],
  cancelled: ["Cancelled", "slate"],
};

const RX: Record<PrescriptionStatus, [string, Tone]> = {
  sent: ["New", "blue"],
  in_progress: ["In progress", "amber"],
  partially_dispensed: ["Partially dispensed", "red"],
  dispensed: ["Dispensed", "green"],
};

const ITEM: Record<ItemStatus, [string, Tone]> = {
  pending: ["Pending check", "slate"],
  available: ["Available", "teal"],
  unavailable: ["Unavailable", "red"],
  dispensed: ["Dispensed", "green"],
};

export function TokenStatusBadge({ status }: { status: TokenStatus }) {
  const [label, tone] = TOKEN[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function RxStatusBadge({ status }: { status: PrescriptionStatus }) {
  const [label, tone] = RX[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const [label, tone] = ITEM[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Honest integration labelling: Live vs Mock vs Fallback. */
export function SourceBadge({ provider, source }: { provider: string; source: "live" | "mock" | "fallback" }) {
  if (source === "live") return <Badge tone="teal">Live · {provider}</Badge>;
  if (source === "fallback") return <Badge tone="amber">Fallback · {provider}</Badge>;
  return <Badge tone="amber">Mock data · {provider} offline</Badge>;
}
