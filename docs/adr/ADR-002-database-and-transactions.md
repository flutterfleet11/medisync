# ADR-002: Schema and transactional workflow functions

**Status:** Accepted (2026-11-22)

**Context:** Token numbers must never be duplicated. Saving a consultation, its prescription and the token status change must happen atomically. Dispensing must never oversell stock.

**Decision:** There are 10 tables: `clinics`, `profiles`, `doctors`, `queue_state`, `tokens`, `consultations`, `medicines`, `prescriptions`, `prescription_items` and `dispensing_records`. `queue_entries` is merged into `tokens`. `pharmacy_searches` is omitted because the scope doesn't need it.
- **Token allocation:** `book_token()` upserts `queue_state (doctor_id, token_date)` with `last_token_number + 1 … RETURNING`. That row lock serialises concurrent bookings. Two constraints back it up: `unique(doctor_id, token_date, token_number)`, and a partial unique index allowing only one active token per patient, doctor and day.
- **Consultation:** `complete_consultation()` saves the diagnosis, the prescription and its items, matches inventory case-insensitively, and completes the token in one transaction.
- **Dispensing:** `dispense_items()` runs `UPDATE medicines SET stock = stock - q WHERE stock >= q` for each item. An item without stock is marked unavailable instead. Every action writes a `dispensing_records` row.
- **Queue snapshot:** A trigger keeps `queue_state.now_serving` and `waiting_count` current.

**Consequences:** All workflow writes are `SECURITY DEFINER` functions with explicit role and clinic checks. They are verified by `npm run test:db` (PGlite, 72 checks).
