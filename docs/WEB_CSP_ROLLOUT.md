# Kora web Content Security Policy rollout

The web application currently has baseline security headers but no enforced custom CSP. A strict policy should be introduced in stages so Next.js runtime scripts, fonts, images, marketplace media, the Kora API, and future payment integrations are inventoried before enforcement.

## Staged rollout

1. **Inventory**: list Next.js scripts, styles, font origins, image origins, API calls, QR/print behavior, marketplace image hosts, analytics, and payment-provider frames or redirects. Avoid adding `*` as a permanent source.
2. **Report-Only**: ship `Content-Security-Policy-Report-Only` with a report endpoint that stores only aggregate violation data. Do not include tokens or user-entered values in reports.
3. **Observe**: exercise public pages, EN/FR routes, login/OTP, onboarding, workspace screens, marketplace images, QR flows, and payment flows in staging. Separate genuine violations from browser extensions and third-party noise.
4. **Tighten**: use nonces or hashes for required inline scripts, explicit `connect-src` for `https://api.koraafric.com`, explicit image/font sources, and the narrowest payment-provider origins actually used. Keep `frame-ancestors 'none'` unless an approved integration requires framing.
5. **Enforce**: move the tested policy to `Content-Security-Policy`, keep violation monitoring, and review every new third-party integration before adding an origin.

## Constraints

- Do not use `unsafe-eval` or a wildcard `script-src` to make the policy pass.
- Keep `object-src 'none'`, `base-uri 'self'`, and `form-action 'self'` unless a verified flow requires otherwise.
- Preserve the API's existing Helmet policy and test the Vercel deployment separately from local development.
- Marketplace external images must be allowlisted by actual approved host, not by a broad wildcard.
- Future payment integrations must prefer hosted redirects or provider-approved frames and must be reviewed for `connect-src`, `frame-src`, and `form-action` impact.
