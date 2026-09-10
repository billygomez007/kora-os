# Kora OS localization

## Supported locales

Kora web currently supports English (`en`) and French (`fr`). Locale definitions are centralized in `apps/web/src/i18n/config.ts`; this keeps Portuguese, Swahili, Arabic, and future right-to-left behavior straightforward to add.

## Resolution and routes

Next.js 16 uses `apps/web/src/proxy.ts` (the current `proxy` convention, formerly middleware). Public locale URLs are `/en`, `/fr`, and their corresponding nested routes. Locale-prefixed requests are rewritten internally to the existing App Router route so existing auth, tenant, branch, permission, and RBAC checks remain unchanged.

Requests without a locale prefix redirect, preserving the path and query string, using this order:

1. The saved `KORA_LOCALE` cookie from an explicit user choice.
2. The browser `Accept-Language` preference.
3. A hosting country header, when present and explicitly mapped.
4. English.

Browser preference is evaluated before country. Cameroon is deliberately not country-mapped. Unknown countries do not imply a language. Country hints currently recognize Vercel, Cloudflare, and CloudFront headers and are never required for correct operation.

## Messages and components

Translations live in `apps/web/messages/en.json` and `apps/web/messages/fr.json`, organized by feature namespace. Server Components use `getTranslations`; Client Components use `useTranslations`. Add the English key and its professionally reviewed French equivalent together, then replace the user-facing literal with the appropriate translation call.

`NextIntlClientProvider` is configured at the root. Locale-aware date, time, number, and currency helpers are in `src/i18n/format.ts`. A UI language never determines currency: callers must pass the configured business or branch currency.

## Adding a language

1. Add its code to `locales` and add a message file with the same schema.
2. Add it to the language selector and SEO alternates.
3. Extend country fallback only for unambiguous markets; browser and saved preferences remain stronger.
4. For Arabic, also set document direction from the locale and audit layouts for RTL.
5. Run the locale tests, typecheck, lint, and production build.

## Manual preference

The EN/FR selector writes `KORA_LOCALE` for one year with `Path=/` and `SameSite=Lax`, then navigates to the same localized path with its query parameters. Explicit locale URLs render their explicit language; the cookie controls later automatic resolution of unprefixed URLs.

## SEO

The root metadata is localized and emits a canonical for the current localized path plus `en`, `fr`, and `x-default` alternates. The document `lang` and Open Graph locale match the active locale. Feature pages can add more specific localized metadata progressively without changing the routing foundation.

## Transactional email follow-up

No email delivery code is changed here. Add an optional locale to the recipient/customer notification context at the existing API rendering boundary, resolve it from saved user/customer preference with `en` fallback, and select an email message catalogue there. Invitations should carry the invitee locale when known; OTP emails should use the locale submitted by the web client or the account preference; booking notifications should use the customer preference independently of the business currency and timezone. Keep templates and delivery infrastructure separate so adding locale cannot block delivery.
