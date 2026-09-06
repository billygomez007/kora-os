# Kora OS Customer Marketplace Design Batch 02

This package contains the authoritative visual references for the Kora OS
customer homepage, public business discovery, booking journey, and appointment
management experience.

## Authoritative files

1. `kora-customer-home-reference.png`
   - Customer landing page with search, categories, recommendations, and the
     entry point for voice-assisted discovery.
2. `kora-customer-ai-voice-search-reference.png`
   - Future voice-search interaction for expressing service, location, date,
     and budget intent.
3. `kora-customer-search-results-reference.png`
   - Public business search results and supported discovery filters.
4. `kora-customer-business-profile-reference.png`
   - Published public business profile and branch service catalogue.
5. `kora-customer-service-selection-reference.png`
   - Booking step 1: service selection using server-provided price and duration.
6. `kora-customer-provider-selection-reference.png`
   - Booking step 2: an eligible provider or any available professional.
7. `kora-customer-date-time-reference.png`
   - Booking step 3: advisory availability in the branch timezone.
8. `kora-customer-booking-review-reference.png`
   - Booking step 4: final customer review before atomic creation.
9. `kora-customer-booking-confirmed-reference.png`
   - Confirmation shown only after the server creates the appointment.
10. `kora-customer-appointments-reference.png`
    - Customer-owned upcoming and past appointment list.
11. `kora-customer-appointment-details-reference.png`
    - Appointment details, policy-aware rescheduling, and cancellation.

## Implementation rules

- Recreate every screen natively with Jetpack Compose. Do not ship these PNGs
  as full-screen backgrounds.
- Reuse the existing Kora design system, authentication, customer workspace,
  repositories, API client, navigation, session storage, and error handling.
- Sample people, businesses, photographs, ratings, areas, prices, dates, and
  booking references are visual placeholders. Never hardcode them.
- Discovery may expose only published public-business data. Never expose staff
  contact details, memberships, subscriptions, audit records, customer data,
  internal schedules, revenue, or other private information.
- Do not display distance or travel-time claims unless a future authoritative
  routing service supplies them. The current nearby search is approximate.
- Availability results are advisory. A slot is booked only after the atomic
  appointment API succeeds. Preserve server double-booking protection and
  stable idempotency behavior.
- Prices, durations, provider eligibility, policies, and appointment states
  come from the server. The client must not recalculate or invent them.
- Kora does not process a booking payment in this flow. Do not display payment
  success, gateway language, tax-invoice claims, or a fabricated receipt.
- Customer appointment access must remain scoped to the authenticated customer.
- Call, directions, calendar, favorite, reschedule, and cancel controls must be
  backed by real capabilities before they are interactive. Do not ship dead
  buttons.
- Implement loading, empty, offline, validation, conflict, permission, and
  recoverable error states natively even when a reference shows only success.
- Meet safe-area, keyboard, font-scaling, contrast, screen-reader, and minimum
  touch-target requirements on small and large phones.

## AI voice-search boundary

`kora-customer-ai-voice-search-reference.png` is an approved future design, not
permission to fabricate an AI feature. Do not expose it as functional until the
project has a real, authenticated server-side intent service, microphone and
location consent, retention rules, safety controls, observability, rate limits,
and tested fallback behavior. Never put provider secrets or model keys in the
mobile app. Until that foundation exists, the customer homepage may omit or
feature-gate the voice entry point honestly.

## Suggested implementation order

1. Customer navigation shell and homepage
2. Public discovery results and business profile
3. Service and provider selection
4. Date/time availability and booking review
5. Atomic booking confirmation
6. Appointment list and details
7. AI voice-search foundation in a separately approved stage

## Implementation status

Items 1-6 above are implemented natively in Jetpack Compose, wired to
the real backend (docs/ARCHITECTURE.md section 26, docs/SECURITY.md
section 40). Every screen was cross-referenced against the real backend
DTO shapes to decide what to keep or omit — ratings, reviews, "open
now" status, precise distance/travel-time, a map view, and per-card
prices on search results were omitted throughout because no endpoint
returns them; where a mockup showed a value the API does not provide,
the honest empty/omitted state was built instead, never a placeholder
or fabricated number.

Two implementation details deliberately depart from the static mockups
for correctness, not preference:

- The mockup's four-step wizard (Service → Professional → Date & Time →
  Review) is preserved conceptually, but provider selection is its own
  step inside the booking flow rather than folded into service
  selection, because eligible providers must be re-resolved if the
  customer backs up and changes the service or date.
- The mockup's "Professional: To be assigned" copy is not shown as
  literal UI text — a CONFIRMED appointment always has a specific
  assigned provider server-side, so the real resolved name is shown
  instead of a placeholder that would be factually wrong.

Item 7, AI voice-search, is **not implemented**. `kora-customer-ai-
voice-search-reference.png` is committed to this directory as an
approved future design reference only. The current customer home
screen shows an inert teaser card in its place — tapping it shows an
honest "coming soon" message; there is no microphone capture, no
speech-to-text, no model-provider integration, and no server-side
intent service. Building any of that is explicitly deferred to a
separately approved future stage (docs/ROADMAP.md).
