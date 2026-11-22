"use server";

import { getSession } from "@/lib/auth";
import { isUuid } from "@/lib/format";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { searchPlaces, type PlaceKind, type PlacesResult } from "@/lib/integrations/serpapi";
import { askCopilot, explainMedicine, type AiAnswer } from "@/lib/integrations/youcom";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

// Sponsor API calls (SerpApi, You.com) run only on the server; API keys never
// reach the browser. Each is per-user rate limited to protect quotas.

const DEFAULT_ORIGIN = { lat: 12.9716, lng: 77.5946 }; // Bengaluru city centre

export async function searchPlacesAction(
  kind: PlaceKind,
  query: string,
  coords?: { lat: number; lng: number } | null,
): Promise<ActionResult<PlacesResult>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in." };
  if (kind !== "clinic" && kind !== "pharmacy") return { ok: false, error: "Invalid search." };
  const rl = rateLimit(`places:${session.userId}`, 15, 5 * 60 * 1000);
  if (!rl.ok) return { ok: false, error: `Too many searches. Try again in ${rl.retryInSec}s.` };

  let origin = DEFAULT_ORIGIN;
  if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng) && Math.abs(coords.lat) <= 90 && Math.abs(coords.lng) <= 180) {
    origin = coords;
  } else if (session.clinic?.latitude != null && session.clinic.longitude != null) {
    origin = { lat: session.clinic.latitude, lng: session.clinic.longitude };
  }
  const result = await searchPlaces(kind, query, origin.lat, origin.lng);
  return { ok: true, data: result };
}

export async function explainItemAction(itemId: string): Promise<ActionResult<AiAnswer>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Please sign in." };
  if (!isUuid(itemId)) return { ok: false, error: "Invalid medicine." };
  // RLS: only the patient (or clinic staff) can read this item.
  const supabase = await createClient();
  const { data: item } = await supabase.from("prescription_items").select("medicine_name").eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, error: "Medicine not found." };
  const rl = rateLimit(`ai:${session.userId}`, 20, 5 * 60 * 1000);
  if (!rl.ok) return { ok: false, error: `Too many requests. Try again in ${rl.retryInSec}s.` };
  return { ok: true, data: await explainMedicine(item.medicine_name as string) };
}

export async function copilotAction(question: string): Promise<ActionResult<AiAnswer>> {
  const session = await getSession();
  if (!session || session.profile.role !== "doctor") return { ok: false, error: "Doctor Copilot is available to doctors only." };
  const q = question.trim();
  if (q.length < 3) return { ok: false, error: "Ask a longer question." };
  const rl = rateLimit(`ai:${session.userId}`, 20, 5 * 60 * 1000);
  if (!rl.ok) return { ok: false, error: `Too many requests. Try again in ${rl.retryInSec}s.` };
  return { ok: true, data: await askCopilot(q) };
}
