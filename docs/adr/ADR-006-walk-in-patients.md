# ADR-006: Walk-in patients get login-less accounts

**Status:** Accepted (2026-11-22)

**Context:** The compounder took over the receptionist's duties, so they must register walk-ins who have no MediSync account. Every patient row is tied to `auth.users`, and that tie is what lets RLS work.

**Decision:** After verifying that the caller is a compounder or admin, the server action uses the service role to create an auth user. The account gets a synthetic email (`walkin.<id>@walkin.medisync.local`), a random password and `email_confirm: true`. The signup trigger then creates the patient profile as usual.

**Consequences:** There is one patient model, so the same RLS and functions apply to walk-ins. A walk-in cannot sign in until a future "claim account" flow exists; that is a known limitation. The seed script deletes these synthetic accounts on reset.
