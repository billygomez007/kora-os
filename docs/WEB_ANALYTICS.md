# Kora web analytics

Kora's public web application uses Google Analytics 4 with measurement ID
`G-C58FM02YE0`.

## Runtime behavior

- The integration is rendered once from the root App Router layout.
- It is enabled only in production builds and only after explicit analytics
  consent.
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

## Consent

The first-party Kora consent banner has two categories:

- Essential cookies are always enabled.
- Analytics is optional and is denied until the visitor explicitly accepts it.

Google Consent Mode defaults `analytics_storage`, `ad_storage`,
`ad_user_data` and `ad_personalization` to `denied`. Accepting analytics updates
only `analytics_storage` to `granted`; advertising consent remains denied.
Declining analytics leaves measurement disabled and clears matching GA cookies
where the browser permits it.

The preference is stored in the first-party `KORA_ANALYTICS_CONSENT` cookie with
the value `granted` or `denied`, `Path=/`, `SameSite=Lax`, and a one-year
`Max-Age` (plus `Secure` over HTTPS). It does not contain authentication data.
The public footer's Cookie preferences control lets visitors reopen the banner
and change their choice later.

The privacy page discloses the GA4 purpose, cookies/similar technologies,
Google processing, the exclusion of authenticated workspace data and the
available opt-out/change controls.
