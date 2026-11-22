# ADR-004: Realtime via Nexconn, with a Supabase Realtime fallback

**Status:** Accepted (2026-11-22)

**Context:** The sponsor brief asks for Nexconn to carry queue and prescription realtime. We had no Nexconn credentials during the build, and the demo must work regardless.

**Decision:** Realtime messages are **invalidation signals only**. A message carries `{ topics: ["queue:<doctorId>", "rx:<id>", …] }` and never patient data. On receipt, the page re-fetches through RLS.
- **Nexconn path** (when `NEXT_PUBLIC_NEXCONN_APP_KEY` and `NEXCONN_APP_SECRET` are set):
  - After each mutation, the server computes the recipients (the clinic's staff and the affected patients) and sends a silent custom `MS:Sync` message through the documented Platform API, `POST /v4/system-channel/message/send`, signed with App-Key, Nonce, Timestamp and SHA1 Signature.
  - Browsers get a token from `/api/realtime/nexconn-token` (`/v4/auth/access-token/issue`). They then use the `@nexconn/chat` SDK: `NCEngine.initialize`, `registerCustomMessages`, `addMessageHandler` and `connect`.
- **Fallback path:** If Nexconn isn't configured or fails to connect, the client subscribes to Supabase `postgres_changes` on the same tables. RLS applies to those events too.

**Consequences:** The UI badge always states which transport is live ("Live · Nexconn" or "Live · Supabase Realtime (fallback)"). After the critic pass, Supabase Realtime **always** runs underneath Nexconn as a backup, so a Nexconn delivery failure cannot freeze the screens. The Nexconn path was **verified live** on the Singapore data center: the patient session received 7–8 Nexconn signals per E2E run.
