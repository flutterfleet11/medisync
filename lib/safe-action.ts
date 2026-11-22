import type { ActionResult } from "@/lib/types";

/**
 * Calls a server action from the client and converts transport failures
 * (offline, redeploy version skew) into a normal error result, so a blip shows
 * a toast instead of the error boundary — and never wipes form state.
 */
export async function safeAction<T>(call: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await call();
  } catch {
    return { ok: false, error: "Network error — please check your connection and try again." };
  }
}
