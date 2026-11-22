// supabase-js >= 2.1xx throws at client construction on Node < 22 (no native
// WebSocket). Server-side clients never open realtime connections (browsers
// do), so on such runtimes we pass a placeholder transport that only fails if
// something actually tries to connect.
class ServerRealtimeUnavailable {
  constructor() {
    throw new Error("Supabase Realtime is browser-only in MediSync (no WebSocket on this server runtime).");
  }
}

export const serverRealtimeOptions =
  typeof globalThis.WebSocket === "undefined"
    ? { realtime: { transport: ServerRealtimeUnavailable as unknown as typeof WebSocket } }
    : {};
