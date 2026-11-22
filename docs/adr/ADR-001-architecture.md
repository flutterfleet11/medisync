# ADR-001: Next.js monolith on Supabase

**Status:** Accepted (2026-11-22)

**Context:** The repository was empty (only empty `backend/` and `frontend/<role>/` folders). We had a 2-hour build window, four roles and three sponsor integrations to cover, and Vercel as the deployment target.

**Decision:** We use a single Next.js 16 (App Router, TypeScript, Tailwind v4) app at the repo root, with Supabase for Postgres, Auth, Realtime and RLS. Server Components read data with the user's session. Server Actions do every write, and each action calls a transactional Postgres function. Sponsor APIs run only in server code behind provider modules (`lib/integrations/*`, `lib/realtime/*`). `cacheComponents` is off because every screen is session-scoped. Pages call `connection()` so they always render per request.

**Consequences:** We deploy one artifact with no separate backend. The empty `backend/` and `frontend/` folders are superseded and left untouched. Next 16 renamed middleware to `proxy.ts`, which refreshes the Supabase session.
