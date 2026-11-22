# MediSync

**One connected clinic workflow: Patient → Clinic → Doctor → Compounder → Pharmacy → Patient.**

MediSync replaces paper tokens and hand-carried prescriptions. Patients book a token and watch their live queue position. Doctors write digital prescriptions that reach the compounder instantly. Compounders dispense against real inventory and point patients to nearby pharmacies when a medicine is out of stock. Patients leave with a PDF prescription and plain-language explanations backed by cited sources.

> This is a hackathon build. All data is synthetic, and the AI output is general information, not medical advice.

## The problem

- Patients wait without knowing their queue position.
- Clinics manage tokens on paper.
- Prescriptions are carried by hand to the compounder.
- Nobody knows which medicines are in stock.
- Patients hunt for unavailable medicines on their own.
- Patients struggle to understand their prescriptions.

## Features by role

| Role | What they can do |
|---|---|
| **Patient** | Register, search MediSync clinics and nearby clinics (SerpApi), book a token, watch the **live queue** (now serving, tokens ahead, estimated wait), cancel a token, view prescriptions with live dispensing status, download the **PDF**, get **You.com explanations** for each medicine, find **nearby pharmacies** for unavailable medicines, edit their profile and view their medical history |
| **Doctor** | Manage today's live queue (call next, call, start, cancel), open a consultation with the patient's history and allergy warning, write a diagnosis and an inventory-aware prescription (shows stock per medicine), send it to the compounder in realtime, ask the **Doctor Copilot** (You.com, cited), browse patients |
| **Compounder** (absorbs the receptionist role) | Use the realtime prescription inbox, check availability per medicine, dispense with **atomic stock deduction**, mark medicines unavailable, search nearby pharmacies, register walk-in patients, book walk-in tokens, control every doctor's queue, manage inventory |
| **Admin** | View the operational dashboard (tokens, waiting, prescriptions, low stock, integration status), assign staff roles, edit or deactivate doctors, edit clinic settings (including average consult time, which feeds wait estimates), oversee inventory |

## Architecture

```
Browser (React 19, Tailwind v4)
  │  Server Components read with the user's session  ──►  Supabase Postgres (RLS on every table)
  │  Server Actions → checked SECURITY DEFINER RPCs   ──►  book_token / complete_consultation / dispense_items …
  │  Realtime: Nexconn (MS:Sync signals) ─ or ─ Supabase Realtime postgres_changes (fallback)
  └─ Server-only providers: lib/integrations/serpapi.ts · youcom.ts · lib/realtime/nexconn-server.ts
```

- **Stack:** Next.js 16 (App Router, `proxy.ts`), TypeScript, Tailwind v4 and Supabase (Postgres, Auth, Realtime, RLS). PDFs are generated with `pdf-lib`, icons come from `lucide-react`, and the app is Vercel-ready.
- **Writes:** Every write goes through a server action that calls one **transactional Postgres function**. That function re-checks the caller's role and clinic. See [ADR-002](docs/adr/ADR-002-database-and-transactions.md).
- **Realtime:** Realtime messages are **invalidation signals only**. They carry no patient data; clients re-fetch through RLS. See [ADR-004](docs/adr/ADR-004-realtime-nexconn.md).
- **Decision records:** All design decisions are in [docs/adr](docs/adr). The build log is [docs/DEV_LOG.md](docs/DEV_LOG.md).

### Database (10 tables)

| Table | Purpose |
|---|---|
| `profiles` | One row per user, holding role and clinic |
| `clinics` | Clinic directory |
| `doctors` | Public doctor directory |
| `queue_state` | Per doctor per day: the atomic token counter and the PII-free "now serving" snapshot |
| `tokens` | Queue entries (status: waiting → called → in_consultation → completed or cancelled) |
| `consultations` | Diagnosis and notes |
| `prescriptions` and `prescription_items` | Medicine-level status: pending, available, unavailable or dispensed |
| `medicines` | Clinic inventory |
| `dispensing_records` | Audit trail |

### Security

- **RLS everywhere.** Patients see only their own rows. Staff see only their clinic's rows. Compounders cannot read diagnoses, and patients cannot read inventory. See [ADR-003](docs/adr/ADR-003-rls-strategy.md).
- **No direct writes.** Workflow tables have no direct write policies, so changes happen only through the checked RPCs.
- **No self-assigned roles.** Every signup becomes a patient. Clients cannot change `role`, `clinic_id` or `email`.
- **Server-only secrets.** The service-role key and the SerpApi, You.com and Nexconn secrets are read only in server code. The only `NEXT_PUBLIC_*` values are the Supabase URL, the anon key and the Nexconn App Key, all of which are public by design.
- **Staff scope.** Staff can read only their own clinic's staff and patients who have visited that clinic. Front-desk lookup of anyone else goes through `search_patients()`, which needs an exact email or phone number and returns masked phone numbers.
- **Tested.** `npm run test:db` runs 72 RLS and workflow checks against real Postgres (PGlite), with no Supabase project or Docker needed.

## Sponsor integrations

| Sponsor | Use in MediSync | Status | Fallback | Credentials |
|---|---|---|---|---|
| **Nexconn** | Realtime push for queue moves, prescription handoff and dispensing status. The server sends silent `MS:Sync` messages to exactly the affected users; the browser receives them through the `@nexconn/chat` SDK. | **Live, verified** (Singapore data center). Token issue and system-channel sends return `code 0`. In each E2E run, the patient's browser received 7–8 Nexconn signals, and the header badge showed `Live · Nexconn`. | **Supabase Realtime** (`postgres_changes`, RLS-filtered) always runs underneath as a backup. It takes over automatically if Nexconn is missing or fails to connect. | `NEXT_PUBLIC_NEXCONN_APP_KEY`, `NEXCONN_APP_SECRET`, `NEXT_PUBLIC_NEXCONN_REGION` |
| **SerpApi** | Discovering nearby clinics, and nearby pharmacies when a medicine is unavailable. Results include ratings, open state, phone, directions and map links. | **Live, verified** (`google_maps` engine) | Places named "Sample: …", with the badge `Mock data · SerpApi offline`. Used when there is no key, on HTTP 429, on an error or on a timeout. | `SERPAPI_API_KEY` |
| **You.com** | The Doctor Copilot (drug information, interactions, references) and patient medicine explanations. | **Live, verified** (Answer API, with real `citations[]`) | An offline sample that is labeled and has **no citations**; the app never fabricates them | `YOU_API_KEY` |

**AI guardrails:**
- The AI is read-only. No code path writes AI output into a prescription.
- Every answer is labeled "AI-generated information · not medical advice".
- No patient identity or diagnosis is sent to You.com.
- External clinics are never bookable, and the app never auto-substitutes a medicine.

## Setup

```bash
npm install
cp .env.example .env.local        # fill in the values (see below)
npm run db:push -- "<session-pooler-db-url>"   # applies supabase/migrations (Supabase CLI)
npm run seed                      # synthetic demo data; re-run anytime to reset the demo
npm run dev                       # http://localhost:3000
```

- **Supabase direct connection.** The direct database host (`db.<ref>.supabase.co`) is IPv6-only. Use the **Session pooler** URL from Supabase → Connect.
- **Supabase email confirmation.** In Authentication → Providers → Email, turn off "Confirm email" so patients who register can sign in immediately.
- **Node version.** Node 22+ is recommended. Node 20 works: server Supabase clients get an inert realtime transport (`lib/supabase/server-realtime.ts`).

### Environment variables

| Variable | Scope | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | yes |
| `SUPABASE_SERVICE_ROLE_KEY` (a legacy service_role JWT or an `sb_secret_…` key) | server | yes (seed, walk-in registration, Nexconn recipients) |
| `SUPABASE_DB_URL` | CLI only | to apply migrations |
| `SERPAPI_API_KEY`, `YOU_API_KEY`, `NEXCONN_APP_SECRET` | server | optional (labeled fallbacks) |
| `NEXT_PUBLIC_NEXCONN_APP_KEY`, `NEXT_PUBLIC_NEXCONN_REGION` (`sg`, `na` or `sa`) | public | optional |

### Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript |
| `npm run test:db` | Applies the migrations to in-process Postgres and runs 72 RLS and workflow checks |
| `npm run seed` | Resets the demo data (synthetic only) |
| `npm run db:push -- "<db-url>"` | Applies the migrations to a Supabase project |

## Demo accounts

All demo accounts use the password **`MediSync@2026`**. The login page has one-click buttons for each role.

| Role | Email | Notes |
|---|---|---|
| Patient | `patient@medisync.demo` | Aisha Khan. Penicillin allergy, has a past visit |
| Doctor | `doctor@medisync.demo` | Dr. Ananya Rao, CityCare. Today's queue: #1 done, #2 waiting |
| Compounder | `compounder@medisync.demo` | Ravi Kumar, CityCare |
| Admin | `admin@medisync.demo` | Meera Iyer, CityCare |

There are also `doctor2`, `doctor3`, `compounder2` and `patient2` through `patient4` (all `@medisync.demo`). Azithromycin 500mg and Vitamin D3 are **out of stock on purpose**, so the demo can show the unavailable-medicine path.

## Hackathon demo script (about 5 minutes)

Open three windows (patient on a phone-sized window, doctor, compounder) and run `npm run seed` first.

1. **Patient:** Go to Find a clinic → **CityCare Family Clinic** → Dr. Ananya Rao → **Book token**. The token page shows **#3, 1 ahead, about 8 min**.
2. **Doctor:** The token appears in the queue live. Click **Call next patient**. The patient's "Now serving" changes **without a refresh**.
3. **Doctor:** On Aisha's row, click **Start consultation**. The called patient (#2) automatically goes back to the waiting list.
   - Note the allergy warning and the visit history.
   - Enter the diagnosis.
   - Add **Paracetamol 500mg** (in stock) and **Azithromycin 500mg**. The badge shows "Low/no clinic stock".
   - Ask Copilot "Drug interactions…" and get a cited answer.
   - Click **Save & send to compounder**.
4. **Compounder:** The prescription lands in the inbox live. Open it, then **Dispense selected** (stock is deducted). Mark Azithromycin **Unavailable**, then search **Nearby pharmacies** to get live Google Maps results with directions.
5. **Patient:** The token page flips to "Consultation complete". Open the prescription: Paracetamol shows Dispensed and Azithromycin shows Unavailable. Click **Explain**, which returns a You.com answer with sources. Then **Download PDF**, and use **Find unavailable medicines nearby**.
6. **Admin:** The overview shows today's stats, low stock and each integration's status.
7. **Compounder (bonus):** In Queue & walk-ins, register a new walk-in patient and book a token for them.

## Verification (actual results)

- `npm run typecheck`: clean
- `npm run lint`: clean
- `npm run build`: passes (all routes dynamic)
- `npm run test:db`: **72/72 passed** (covers RLS, role escalation, cross-clinic isolation, anon access with Supabase default grants, queue rules, atomic stock)
- Live browser E2E (Playwright, 4 concurrent role sessions, 24 steps covering the full script above plus an RLS check from another patient) against live Supabase, SerpApi, You.com and Nexconn: **passed twice back to back**, with no reseed between runs and no manual DB edits

## Known limitations

- **Shared demo accounts.** The one-click demo logins, including admin, are public. Anyone with the URL can change the shared demo data. Run `npm run seed` right before judging to reset it.
- **Walk-in patients** get login-less accounts and cannot sign in until a "claim account" flow exists (ADR-006).
- **Doctors** belong to one clinic. There are no appointment time slots; queues are first come, first served per day. Tokens left open from a previous day are not auto-cancelled; they show in history, not as active.
- **Rate limiting and caches** are in-memory per server instance, which is fine for a demo but not shared across serverless instances.
- **Timezone.** Display times use the clinic timezone (`Asia/Kolkata` by default).
- **Mobile layout.** The patient journey is designed mobile-first. Staff screens are optimised for desktop and tablet.
