# Kora web analytics

Kora's public web application uses Google Analytics 4 with measurement ID
`G-C58FM02YE0`.

## Runtime behavior

- The integration is rendered once from the root App Router layout.
- It is enabled only in production builds.
- Only public marketing routes are trackable: the localized home, company,
  utility, pricing and marketplace pages.
- Workspace, authentication, onboarding, invitation, QR/customer and admin
  routes are excluded.
- GA4 automatic page views are disabled. The client component emits one
  `page_view` event per pathname transition, including the locale prefix so
  English and French navigation remain distinguishable.
- Query strings are removed from `page_path` and `page_location`, so email
  addresses, tokens and other query values are not sent to Google Analytics.

No authenticated API response, business identifier, customer/staff value,
token, OTP, or custom business event is sent to analytics.

## Consent follow-up

The website does not currently provide an analytics consent-management layer,
and the existing privacy page does not yet describe GA4 cookies. A future
privacy/consent task should gate analytics before initialization where required
by the jurisdictions and audiences Kora serves.
