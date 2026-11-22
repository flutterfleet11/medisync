# MediSync development log

The build ran on 2026-11-22 against the 120-minute plan in the master build prompt. Times are minutes from the start of the build.

## M0 · Repository audit (0–5)
- **Repo state:** The repo held one commit, `initial push`, containing a placeholder `.txt` file. There were empty, untracked `backend/` and `frontend/{patient,doctor,compounder-receptionist}/` folders. There was no package config, app code, Supabase setup or env vars. The machine runs Node 20.15 and has no Supabase CLI or Docker.
- **Decision:** We built a greenfield Next.js 16 + Supabase app at the repo root (ADR-001).
- **Sponsor docs:** We read the official docs before coding:
  - Nexconn: Platform API auth, token issue, system-channel send, and the Web SDK. We then checked the method names against the installed `@nexconn/chat` type definitions.
  - SerpApi: the `google_maps` engine.
  - You.com: the Search and Answer APIs.
- **Agents:** We used separate agents to fetch the docs. The build itself ran in one session to keep file ownership simple, and one independent critic agent reviewed it at the end.

## M1 · Foundation (5–25)
- **Migrations** (`supabase/migrations`):
  - The schema has 10 tables and 4 enums.
  - Checked `SECURITY DEFINER` functions handle token booking, the queue, consultation, dispensing, stock and admin.
  - RLS is enabled on every table, and the realtime publication covers the workflow tables.
- **Signup:** A trigger creates a `patient` profile on every signup. A second trigger stops clients from changing `role`, `clinic_id` or `email`.
- **App shell:** Supabase SSR auth runs through `proxy.ts` and server role guards (`requireRole`, `requireStaff`). The app has a responsive sidebar shell, demo-account login, patient registration, and setup and unassigned screens.
- **Tests:** `npm run test:db` passed 55/55 checks on first run, later 59/59. It covers sequential tokens, rejection of duplicate active tokens, cross-clinic and cross-patient isolation, blocked self-promotion, blocked direct writes, atomic stock and admin scoping.

## M2 · Core workflow (25–70)
- **Patient:** Clinic search, booking (redirects to a live token page), the queue position RPC, the prescription list and detail, the PDF, and profile and history.
- **Doctor:** The live queue (call next, call, start, cancel), a consultation workspace with an inventory-aware prescription builder and allergy warning, patient history and the patients list.
- **Compounder:** A realtime inbox, a dispense panel with medicine-level availability and atomic `dispense_items`, walk-in search, registration and booking, control of every doctor's queue, and inventory.
- **Admin:** An overview with stats, low stock and integration status, staff role assignment, doctor activate and edit, clinic settings and inventory.
- **PDF:** Generated server-side with `pdf-lib`. RLS decides who can fetch it.

## M3 · Sponsor integrations (70–100)
- **Nexconn:**
  - The server signs requests (App-Key, Nonce, Timestamp, SHA1 Signature) for `/v4/auth/access-token/issue` and `/v4/system-channel/message/send`, with backup-domain failover.
  - The client uses `NCEngine.initialize`, `registerCustomMessages`, `addMessageHandler` and `connect`.
  - Signals are PII-free `MS:Sync` topic invalidations.
  - **Status:** Live-verified after the App Key and App Secret were provided (Singapore data center; NA and SA return 403). Token issue and system-channel sends return `code 0`, and the patient's browser received 7–8 signals per E2E run. Supabase Realtime always runs underneath as a backup.
- **SerpApi:** Uses `google_maps` / `local_results` with directions and maps links, a 10-minute cache, a timeout, a per-user rate limit, and a labeled mock fallback on 429, error or no key. **Live-verified:** 20 Bengaluru pharmacies returned.
- **You.com:** Uses the Answer API. `[[n]]` markers map to the returned `citations[]`, and when there are no citations the app shows the related `results.web` links, labeled. The offline sample has zero citations. **Live-verified:** answers with 2 citations.

## M4 · End-to-end (100–110)
- We applied the migrations to the live Supabase project with `supabase db push` through the Tokyo session pooler. The direct host is IPv6-only.
- **Seed:** `npm run seed` loads synthetic clinics, users, inventory with deliberate stock-outs, history and today's queue.
- **Issue → fix:** supabase-js 2.119 throws at client creation on Node < 22 because Node 20 has no global WebSocket. Server clients now get an inert transport (`lib/supabase/server-realtime.ts`), since only browsers subscribe to realtime.
- **Issue → fix:** With the App Key set but no App Secret, the client attempted Nexconn and got a 503. The server now tells the client whether Nexconn is usable.
- **Issue → fix:** The prescription form was too narrow on the consult page. We moved Copilot and history into the right column.
- **Browser E2E** (Playwright, run outside the repo): patient, doctor, compounder and admin ran concurrently against the live app. The script covers booking, the live queue (now-serving updates with no reload), consultation, the realtime compounder inbox, dispensing, the unavailable medicine, SerpApi pharmacies, the You.com explanation, the PDF, an RLS check from another patient, Copilot, walk-ins, inventory and admin.
- **E2E results:** Run A passed 24/24, and run B passed 24/24 back to back with no reseed and no manual DB edits.

## M5 / M6 · Critic pass and stabilization (110–120)
One independent combined critic pass covered security, integrations, architecture, UI and the judge's view. It found 14 issues: 2 High, 7 Medium and 5 Low.

- **Fixed (High):**
  - Compounders and admins could read every patient platform-wide. They are now limited to their own clinic, and lookups go through the masked `search_patients` RPC (migration `…0400_hardening`).
  - A Nexconn delivery failure could freeze screens. Supabase Realtime now always runs as a backup, and message content is parsed robustly.
- **Fixed (Medium):**
  - The "Live" badge now reflects the real channel status, refreshes to catch up after a reconnect or when the tab becomes visible, and polls every 30 s while down.
  - Only one token can be "called" at a time, and a doctor can run only one consultation at a time. Only the doctor can complete a consultation in progress.
  - Times are formatted in the clinic timezone, not the server's UTC.
  - Pharmacy search centres on the prescribing clinic, and its wording no longer overclaims.
  - Marking a medicine unavailable asks for confirmation, and it can be marked available again.
  - Client action calls are wrapped in `safeAction` (network errors show a toast and keep form state), and `app/error.tsx` was added.
- **Fixed (Low):**
  - Patient search results show masked phones.
  - Mock places get no navigation links.
  - Prescription quantity is suggested from frequency × duration.
  - The patient dashboard shows only today's active tokens.
  - Walk-in registration is rate-limited.
  - The DB tests mirror Supabase's default grants; the always-true assertion was fixed.
- **Deferred (documented in the README):** One-click staff demo logins are public; `npm run seed` resets the demo. `lib/env.ts` has no `server-only` split; a bundle scan found no secrets leaking.
- **Final checks:**
  - `tsc` and `eslint` clean, `next build` passes, `npm run test:db` 72/72.
  - Browser E2E with Nexconn live: 24/24 steps, twice in a row.

## Remaining work (priority order)
1. Put the staff demo logins behind a flag for any public deployment.
2. Let walk-in patients claim their accounts so they can sign in.
3. Move the Playwright E2E into the repo as a dev dependency.
4. Add multi-clinic doctors and appointment slots.
