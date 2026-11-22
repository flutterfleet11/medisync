# ADR-003: Row Level Security strategy

**Status:** Accepted (2026-11-22)

**Context:** Patients must never see other patients' data, and staff must be scoped to their own clinic. Frontend checks alone are not enough.

**Decision:** RLS is enabled on every table.
- **Reads:** Patients read only their own rows. Staff read rows from their own clinic. Compounders cannot read `consultations` (diagnosis or notes), and patients cannot read inventory or the dispensing audit. Doctors read only patients who have held a token at their clinic.
- **Writes:** Workflow tables (tokens, consultations, prescriptions, items, dispensing) have **no direct write policies**. They change only through the checked functions in ADR-002.
- **Profiles:** A `BEFORE UPDATE` trigger blocks clients from changing `role`, `clinic_id` or `email`. Signup always creates a `patient` profile, so users cannot pick their own role.
- **Public data:** `clinics`, `doctors` and `queue_state` (which holds no PII) are publicly readable. That lets patients browse clinics and watch live boards.
- **Helpers:** `auth_role()`, `auth_clinic_id()`, `is_staff_of()` and `can_view_prescription()` are `SECURITY DEFINER` to avoid policy recursion.

**Amendment (critic pass, migration `…0400_hardening`):** Staff read profiles only for their own clinic's staff and patients who have held a token at their clinic. The front desk finds other patients through `search_patients()`. That function does fuzzy search only within the clinic; anyone else needs an exact email or full phone number, and phone numbers come back masked.

**Consequences:** Role escalation happens only through `admin_assign_staff()`, and an admin can assign only patients or staff of their own clinic. The service-role key is used server-side in exactly two places: walk-in account creation and computing realtime recipients.
