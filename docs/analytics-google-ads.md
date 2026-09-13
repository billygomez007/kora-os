# Kora GA4 and Google Ads measurement foundation

## Architecture

Kora uses the existing direct Google Analytics 4 integration in
`apps/web/src/components/analytics/GoogleAnalytics.tsx`. It is mounted once by
the App Router root layout and sends one query-string-free `page_view` per
localized public pathname transition. There is no Google Tag Manager container,
Google Ads tag, or second analytics installation in the web application.

The reusable, consent-gated event API lives in
`apps/web/src/lib/analytics.ts`. Events are sent through the same `gtag`
instance as page views. Event payload types only allow scalar values and safe
item fields; never pass names, email addresses, phone numbers, messages,
authentication values, customer records, or payment credentials.

The approved GA4 measurement ID already present in the repository is
`G-C58FM02YE0`. No new Analytics, Ads, or GTM credentials were invented or
added. There are currently no required analytics environment variables.

## Consent and privacy

Analytics is disabled until the visitor accepts the existing Kora analytics
banner. The `KORA_ANALYTICS_CONSENT` first-party cookie stores `granted` or
`denied`. Google Consent Mode defaults all four signals to denied:

- `analytics_storage`
- `ad_storage`
- `ad_user_data`
- `ad_personalization`

Accepting the optional analytics category grants only `analytics_storage`.
Advertising signals remain denied until a future, separately reviewed consent
design is approved. Event helpers return without sending when consent is not
granted or the GA4 script is unavailable.

Public marketing routes are tracked. Authenticated workspace, invitation,
QR/customer, and administrative routes remain excluded from page-view and
event tracking. The login/verification and business-onboarding boundaries are
eligible for explicit `login`/`sign_up` events only when the browser already
has an accepted analytics preference; they never emit page views and the
consent banner remains public-site only. A direct visit without prior consent
does not load analytics.

## Implemented events

| Event | Trigger | Parameters | GA4 / Ads guidance |
| --- | --- | --- | --- |
| `sign_up` | After the business onboarding API returns a successful organization/workspace creation. | `method: "email_otp"` | Candidate GA4 Key Event after validating volume and quality. Consider importing to Ads only if business acquisition is the intended conversion. |
| `login` | After a sign-in-mode OTP verification returns a valid session. Signup-mode verification is not counted as login. | `method: "email_otp"` | Analytics-only diagnostic event; do not make it a Google Ads primary conversion. |
| `view_pricing` | After the real localized pricing page is mounted, once per page view, after consent and GA readiness. | none | Informational event; do not make it a primary conversion. |

The `trackLead`, `trackBeginCheckout`, and `trackPurchase` helpers are available
for future use, but they are not called today:

- The Contact page validates its form locally but has no contact/enquiry API
  endpoint or successful submission response. It must not claim a lead was
  generated.
- Kora currently exposes subscription-plan and subscription-detail read APIs,
  not a paid Kora subscription checkout or payment-provider confirmation flow.
  Pricing links lead to onboarding/contact, so there is no valid
  `begin_checkout` boundary or subscription `purchase` boundary yet.
- Operational customer checkouts and recorded payments are business activity,
  not Kora subscription purchases. They must not be mislabeled as Ads
  conversions.

## Key-event recommendations

These are product recommendations, not changes made automatically in Google:

- **Primary candidates:** `sign_up`, `generate_lead`, `purchase` once each has
  a verified successful boundary and meaningful volume. `generate_lead` and
  `purchase` remain future candidates until their backend flows exist.
- **Secondary / observation:** `begin_checkout` while checkout intent and
  payment completion are being validated.
- **Do not make primary Ads conversions:** `login`, `view_pricing`,
  `page_view`, `scroll`, or `session_start`.

`trackPurchase` requires a non-empty provider/backend transaction ID and keeps
an in-memory plus `sessionStorage` transaction-id guard so a retry or refresh
in the same browser tab cannot double-send the same purchase. A future provider
integration should persist a server-side conversion idempotency decision as
well.

## Adding a tracked event

1. Confirm the backend/UI action has a real success response.
2. Add or reuse a typed wrapper in `apps/web/src/lib/analytics.ts`.
3. Call it only after the success response, never on page load, button click,
   validation success, or a failed request.
4. Keep parameters limited to non-PII values and actual transaction values.
5. Add a focused test for consent gating and duplicate prevention where the
   event can be retried.
6. Update this document with the exact trigger and conversion recommendation.

## Manual Google configuration still required

No Google Ads campaign, budget, bid, audience, keyword, location, or campaign
status was changed by this implementation.

After the Kora team has a Google Ads account and decides which business action
is a commercial conversion:

1. Link the GA4 property containing `G-C58FM02YE0` to Google Ads.
2. In GA4 Admin → Data display → Events, verify the events in DebugView/Realtime
   first. Mark only reviewed events as Key Events. Start with `sign_up`; add
   `generate_lead` or `purchase` only after their real backend flows are live.
   Keep `login` and `view_pricing` diagnostic.
3. In GA4 Admin → Key events, confirm the event name and counting behavior for
   each approved business outcome. Do not create duplicate custom events for
   the same action.
4. In Google Ads, open Goals → Conversions → Summary → New conversion action →
   Import → Google Analytics 4 properties, select the approved Key Event, and
   choose its primary/secondary status, counting, value, attribution, and
   lookback settings only after owner approval.
   Do not install a second Ads tag unless a separate, approved conversion
   design requires it.
5. Choose one primary conversion source for each business outcome. Do not
   count both an imported GA4 event and a future direct Ads tag for the same
   action.
6. Configure attribution, value, counting, and lookback windows in the Google
   UI only after product and finance owners approve them.

## Validation

For a consented browser, use GA4 DebugView and Realtime to verify:

- one `page_view` for each localized pathname transition;
- one `view_pricing` when pricing is genuinely viewed;
- `sign_up` only after successful business workspace creation;
- `login` only after successful sign-in OTP verification;
- no events after analytics is declined;
- no personal or authentication data in event parameters.

Use browser network inspection to confirm there is one
`googletagmanager.com/gtag/js?id=G-C58FM02YE0` script and no GTM or Ads tag was
added accidentally.
