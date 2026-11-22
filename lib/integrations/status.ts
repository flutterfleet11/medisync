import { isNexconnConfigured, serverEnv } from "@/lib/env";

/** Which sponsor integrations have credentials (server-side check only). */
export function integrationStatus() {
  const env = serverEnv();
  return {
    nexconn: isNexconnConfigured(),
    serpapi: Boolean(env.serpApiKey),
    youcom: Boolean(env.youApiKey),
  };
}
