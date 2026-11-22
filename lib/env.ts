// Central env access. NEXT_PUBLIC_* values must be referenced literally so
// Next.js can inline them into client bundles.
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  nexconnAppKey: process.env.NEXT_PUBLIC_NEXCONN_APP_KEY ?? "",
  nexconnRegion: (process.env.NEXT_PUBLIC_NEXCONN_REGION ?? "sg").toLowerCase(),
};

export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}

/** Server-only secrets. Never import this from a client component. */
export function serverEnv() {
  return {
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    serpApiKey: process.env.SERPAPI_API_KEY ?? "",
    youApiKey: process.env.YOU_API_KEY ?? "",
    nexconnAppSecret: process.env.NEXCONN_APP_SECRET ?? "",
  };
}

export function isNexconnConfigured(): boolean {
  return Boolean(publicEnv.nexconnAppKey && serverEnv().nexconnAppSecret);
}
