import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";
import { serverRealtimeOptions } from "@/lib/supabase/server-realtime";

/**
 * Service-role client. BYPASSES RLS — server-only, and only after the caller's
 * role has been verified. Used for walk-in account creation and computing
 * realtime recipients.
 */
export function createAdminClient() {
  const { serviceRoleKey } = serverEnv();
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(publicEnv.supabaseUrl, serviceRoleKey, {
    ...serverRealtimeOptions,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
