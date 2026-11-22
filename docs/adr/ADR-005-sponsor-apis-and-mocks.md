# ADR-005: Sponsor API calls are server-only, with honestly labeled fallbacks

**Status:** Accepted (2026-11-22)

**Context:** SerpApi and You.com keys must never reach the browser. The demo must survive missing keys, rate limits and outages. Medical AI must never fabricate citations or act as a prescriber.

**Decision:**
- **SerpApi** uses the `google_maps` engine and reads `local_results`. Results get a 10-minute cache, a 10-second timeout and a per-user rate limit (15 per 5 minutes). On HTTP 429, an error or a missing key, the app returns **mock places named "Sample: …"** and shows the `Mock data · SerpApi offline` badge. External clinics are shown as information only (directions and phone), never as bookable. The app never suggests substitute medicines.
- **You.com** uses the Answer API (`POST https://api.you.com/v1/answer`, `X-API-Key`). Inline `[[n]]` markers are mapped to the returned `citations[]`; only URLs from the response are shown. With no key, a timeout or an error, the app shows an **offline sample** built from a short curated list. It is labeled as such and has **zero citations**. No patient identity or diagnosis is sent, only the medicine name or the doctor's question. Every answer is labeled "AI-generated information · not medical advice". The AI is read-only: no code path writes AI output into a prescription.

**Consequences:** Each sponsor works or degrades visibly. The integrations were built from the official docs but **not called live** during the build because no keys were provided.
