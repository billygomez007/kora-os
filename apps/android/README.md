# Kora OS — Android

Native Android client for Kora OS, a multi-tenant operating system for
service businesses. This is a real, API-connected application — not a
prototype or demo. It preserves the existing Google Play
`applicationId` (`com.aistudio.chairside.ksghna`) for update continuity
and the Kotlin namespace `com.realtegic.kora`.

Status: third production integration stage. See docs/ROADMAP.md,
docs/ARCHITECTURE.md sections 23-25, and docs/SECURITY.md sections
36, 39 (all in the repository root) for the full design record. This
README covers what a developer needs to build, run, and test the app
locally.

## What works today

- Passwordless email OTP sign-in, session restoration across app
  restarts, and secure sign-out (including "sign out everywhere").
- A real customer home screen: branded search, service categories,
  "Near you" approximate-location discovery, and an upcoming-appointment
  card.
- Business discovery, branch/service browsing, real availability, and
  atomic appointment booking with a stable idempotency key.
- Customer appointment management: list, detail, cancel, reschedule.
- Customer favorites.
- Secure workspace selection between the customer workspace and one or
  more business workspaces, and a subscription-aware, permission-driven
  business workspace: a bottom navigation bar computed from the
  workspace's own granted permissions (Overview plus up to four more
  destinations, ranked by priority — Queue, Appointments, My Work,
  Checkout, Reports, Transactions, Verifications, Disputes, Earnings,
  Receipts), with everything else, plus Setup/Services/Team/Business
  hours/account actions, in a "More" list.
- A resumable business-onboarding wizard: an owner creates a business
  (organization + first branch + trial subscription, one idempotent
  atomic call), adds services, sets weekly business hours, and
  optionally invites staff — reopening mid-setup revalidates against
  the server's own setup-status rather than trusting local progress.
- Post-onboarding business-profile (visibility, publish/unpublish),
  service-catalogue (create/archive), branch-service enablement, and
  business-hours management.
- The full staff-invitation lifecycle: create an invitation (role +
  optional branch), get a one-time share link (Copy/Share — no
  automated delivery yet), team directory, pending-invitation list,
  revoke, and deep-link acceptance (`kora://invite/{token}`) with
  email-verification-on-accept.
- Appointment check-in and walk-in intake into a near-real-time (10-20s
  jittered, foreground-only) live branch queue, with call/assign/
  return-to-waiting/cancel/no-show/start-service commands.
- Service sessions: start from an eligible queue entry, an active-
  service screen with a locally-derived (never server-authoritative)
  elapsed-time display, replace items, complete, cancel.
- Checkout from a completed service session (create-or-recover with a
  stable idempotency key, never a local duplicate on a
  `CHECKOUT_ALREADY_EXISTS` conflict), adjustments with a required
  reason, void.
- Manual payment recording — CASH/MOBILE_MONEY/CARD/BANK_TRANSFER/OTHER
  exactly as the backend defines them, integer minor units throughout, a
  stable idempotency key, and a per-branch cash policy honored
  client-side (a `REQUIRED` policy is never bypassed, only a different
  method is offered). Always "Record payment," never "process
  payment" — no payment gateway exists anywhere in this app.
- Provider payment confirmation and dispute (self-confirmation forbidden
  and never worked around client-side), and owner/manager dispute
  resolution with a mandatory rejection reason and a prominent warning
  before a solo-owner override.
- Read-only Transaction and Receipt views — POSTED-only for revenue,
  rendered as immutable server snapshots, never recalculated, never
  called a tax invoice.
- Staff earnings (today/this-week, a dedicated server-computed summary
  plus line-level detail) and owner/manager reports (revenue by day,
  staff/service/payment-method/commission breakdowns) over a selectable
  7/30/90-day window.

## What is intentionally not connected yet

Refund/reversal corrections, cash-session operations (opening,
movements, closing, review — only the per-branch cash *policy* is read,
to gate the payment form), commission-rule management and payout,
branch-service price/duration overrides beyond enable/disable,
staff-service assignment beyond what Branch Services already covers,
schedule exceptions, booking policy, staff availability rules/
exceptions, invitation resend/reissue, custom-role management, and
branch create/deactivate are not reachable from Android in this stage —
see docs/ROADMAP.md for why, and where they land next. No screen
represents any of those as an available action. A real branch switcher
also does not exist yet; every screen uses the workspace's first branch
(docs/ARCHITECTURE.md section 25).

There is no fake AI voice/microphone button anywhere in the app.
Voice/AI-assisted discovery is a deferred roadmap item, not a
placeholder UI element (docs/ROADMAP.md).

## Architecture

Feature-and-core package organization under
`app/src/main/java/com/realtegic/kora/`:

```
core/
  model/        API DTOs (Moshi @JsonClass data classes)
  network/      Retrofit/OkHttp/Moshi, envelope + error parsing,
                request-id header, refresh-on-401 Authenticator,
                debug-only redacted logging
  session/      Keystore-encrypted token storage, SessionManager,
                AuthRepository
  data/         Cross-feature repositories (workspaces, discovery,
                appointments, favorites, reports)
  preferences/  DataStore-backed, non-sensitive UX convenience
                (last selected workspace)
  location/     On-demand, approximate-only location lookup
  designsystem/ Kora dark/gold buttons, text fields, state views,
                money/date-time formatting
  navigation/   Route constants, NavHost, auth/workspace/customer/
                business nav graphs
  di/           AppContainer — manual, constructor-injection DI
feature/
  auth/                       welcome, email entry, OTP verify, splash
  workspace/                  workspace chooser + routing decision
  customer/home/              customer home screen
  customer/discovery/         search, business detail, branch services
  customer/booking/           availability + booking wizard
  customer/appointments/      list, detail, cancel, reschedule
  customer/profile/           profile, account settings, favorites
  business/dashboard/         subscription-aware business home + bottom nav
  business/onboarding/        resumable owner onboarding wizard
  business/profile/           business-profile visibility + publish
  business/services/          service catalogue create/archive
  business/schedule/          weekly business-hours editor
  business/team/              team directory, pending invitations, invite sheet
  business/setup/             setup-progress checklist
  business/subscription/      plan/trial/usage (read-only, no billing)
  invitation/                 invitation deep-link preview + accept/reject
ui/theme/                     the existing Kora visual system (kept
                               unchanged from before this stage)
```

No Gradle multi-module split was introduced — the app is one module,
organized by package.

**Dependency injection is manual, not Hilt.** `core/di/AppContainer.kt`
is built once in `KoraApplication.onCreate()`. Hilt would add a new
annotation-processing toolchain for a graph small enough that plain
constructor injection is sufficient and fully unit-testable without it.
`AppContainer` builds two Retrofit/OkHttp clients to break one circular
dependency (`SessionManager` needs `AuthApi`; the main client's
`Authenticator` needs `SessionManager`) — see
docs/ARCHITECTURE.md section 23 for the full explanation.

**Room is not used as an authoritative store in this stage.** The
previous Google-AI-Studio-origin app was a fully local, Room-backed POS
simulation with zero networking; that entire local data layer, and the
demonstration UI built on it, has been removed (the Kora visual system
and logo were kept). Every screen's data now comes from a live API
call.

## Setup

Prerequisites: Android Studio (for its bundled JBR — see "JDK" below)
and the Android SDK.

1. Open this directory (`apps/android`) in Android Studio, or build
   from the command line (see "Building and testing" below).
2. The backend must be running for the app to do anything beyond the
   sign-in screen — see the root `apps/api/README.md` (`pnpm db:up`,
   `pnpm prisma:migrate:deploy`, `pnpm prisma:seed`, `pnpm start:dev`).
3. Never commit `local.properties` — it is developer-machine-specific
   and already git-ignored.

### JDK

This project's Gradle/AGP/Kotlin toolchain expects the JBR bundled with
Android Studio, not a generic system JDK:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

## API base URL and network security

Configured via `BuildConfig.API_BASE_URL`, set at build time
(`app/build.gradle.kts`) — never hardcoded in application code and
never read from a runtime-editable setting.

- **Debug** defaults to `http://10.0.2.2:3000/v1/` (the Android
  emulator's alias for the host machine's `localhost`), matching a
  locally running `apps/api` on port 3000. Override with
  `-PkoraApiBaseUrl=...` or the `KORA_API_BASE_URL` environment
  variable if your backend runs elsewhere (a physical device on the
  same network, for example).
- **Release** has no built-in default at all. It must be supplied via
  `-PkoraApiBaseUrl=https://...` or `KORA_API_BASE_URL`, and is
  validated (`assertSafeReleaseApiBaseUrl`, checked lazily only when a
  `Release` task is actually requested, so it never breaks a plain
  debug build): non-blank, `https://`-prefixed, and not a
  localhost/`10.0.2.2`/placeholder host. A release build with a missing
  or unsafe URL fails the build outright rather than shipping silently
  broken or pointed at a development server.
- **Cleartext HTTP** is only ever possible in a debug build, and only
  to `10.0.2.2` (`src/debug/res/xml/network_security_config.xml`, a
  debug-source-set-only override). The base config
  (`src/main/res/xml/network_security_config.xml`, shipped in every
  variant) sets `cleartextTrafficPermitted="false"` unconditionally —
  the debug override is physically absent from a release APK's
  resources, not merely disabled by a flag.
- **Logging**: debug builds log method, a safe route template, HTTP
  status, and duration only (`SafeDebugLoggingInterceptor`) — never a
  header, query parameter, or body, so `Authorization` headers, OTP
  codes, emails, and payment details are structurally unloggable.
  Release builds have no network logging interceptor at all.

## Secure session handling

- The refresh token and minimal session metadata (`sessionId`,
  `userId`, `displayName`, `email`) are the only things ever persisted
  for a signed-in session, and only inside `TokenStore`, which is
  backed by `androidx.security.crypto.EncryptedSharedPreferences` (an
  Android Keystore-managed AES-256-GCM master key; AES-256-SIV key /
  AES-256-GCM value encryption).
- **The access token is never persisted anywhere.** It lives only in
  memory in `SessionManager` and is re-obtained from the stored refresh
  token on the next cold start.
- If the underlying Keystore key becomes invalid or the encrypted file
  is unreadable, `TokenStore` fails safe: it deletes the corrupted file
  and reports "no stored session" rather than crashing or leaking a
  decryption exception.
- Refresh-token rotation is single-flight under concurrent 401s (a
  `Mutex` in `SessionManager.refreshIfNeeded`), retries an original
  request at most once, and never intercepts the auth endpoints
  themselves — so a failing refresh call can never trigger another
  refresh. See docs/SECURITY.md section 36 for the full model.

## Staff invitation deep link

`kora://invite/{token}` is registered as a custom-scheme deep link
(`AndroidManifest.xml`) — a **development-only scheme, not a verified
HTTPS Android App Link**. No production domain or hosted
`assetlinks.json` exists yet, so Android cannot cryptographically
confirm this app is the legitimate handler for it the way a verified
`https://` App Link would; shipping a verified App Link is a release
prerequisite (docs/SECURITY.md section 38). `MainActivity` uses
`android:launchMode="singleTop"` with an `onNewIntent` override so a
warm-start deep link updates the running app rather than spawning a
second Activity instance. The token itself is the real security
boundary regardless of the scheme (high-entropy, single-use,
server-validated, hashed at rest) — it lives only in an in-memory
Compose state, is never logged, and is cleared on every terminal
outcome. To test it locally against a real invitation created through
the app or the API:

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "kora://invite/<raw-token-from-the-create-response>" \
  com.aistudio.chairside.ksghna
```

## Passwordless email OTP and local testing

Kora OS has no password authentication anywhere, on any platform. Sign-in
is: enter an email, receive a one-time code by email, enter the code.

To test the full sign-in flow against a local backend:

1. Start the backend's local dependencies from the repository root:
   `pnpm db:up` (starts PostgreSQL **and Mailpit**, a local
   credential-free SMTP catcher bound to `127.0.0.1`).
2. Start the API: `pnpm --filter api start:dev` (or see
   `apps/api/README.md`).
3. Run the Android app against it (default debug configuration already
   points at `http://10.0.2.2:3000/v1/`, which reaches the host
   machine's `localhost:3000` from the emulator).
4. Enter an email address in the app and request a code.
5. Open Mailpit's web inbox at **http://127.0.0.1:8025** on the host
   machine and read the delivered code.
6. Enter that code in the app to complete sign-in.

Mailpit is a local inbox only, never an authentication bypass — the
code still travels through the real `EmailOtpSender` interface exactly
as it would with a production provider configured. The console/log OTP
printing some earlier prototypes used has not been restored, and never
will be. OTP codes are never exposed in API responses, application
logs, Android logs, test reports, or committed screenshots.

## Building and testing

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd apps/android

# Unit tests (JVM, via Robolectric where an Android context is needed)
./gradlew testDebugUnitTest

# Debug APK
./gradlew assembleDebug

# Both, from a clean build
./gradlew clean testDebugUnitTest assembleDebug

# Screenshot captures for principal screens (build/outputs/roborazzi/*.png)
./gradlew recordRoborazziDebug
```

Unit test coverage includes: response-envelope and error-envelope
parsing; the `x-request-id` header; authorization/OTP/email redaction
in debug logging; secure token storage (including the Keystore-
unavailable fail-safe path); session restoration; concurrent-401
single-flight refresh; refresh-failure sign-out; OTP screen state
transitions and resend cooldown; workspace routing and stale-selection
invalidation; discovery search debounce and genuine mid-flight
cancellation; money formatting; branch-timezone conversion; the stable
booking idempotency key (including "never a fresh key per HTTP retry"
and "a slot conflict forces a fresh key"); appointment cancel/reschedule
without client-side eligibility checks; favorites isolation;
READ_ONLY/BLOCKED business-dashboard states; money-string parsing to
integer minor units without floating point; the organization-creation
idempotency key (stable across a snapshot-unchanged retry, refreshed
only on a slug conflict, and a duplicate-tap guard verified with a
held-open fake network call); the invitation-preview/accept/reject
flow (loads regardless of auth state, a 403 on accept surfaces as a
specific email-mismatch state rather than a generic error, and an
already-expired invitation renders as terminal); the checkout and
walk-in idempotency-key lifecycle (stable across a retry of an
unchanged submission, regenerated only when the request itself
changes); a `REQUIRED` cash policy blocking a cash submission
client-side without ever calling the payment endpoint; a
`CHECKOUT_ALREADY_EXISTS` conflict recovering the real existing
checkout rather than fabricating one; a self-confirmation-forbidden
payment rejection reloading the authoritative list instead of being
treated as a successful confirmation; and the solo-owner dispute-
resolution override requiring a reason to reject but never to confirm.
Compose UI tests cover
the OTP entry screen, the customer home screen, and the workspace
chooser. Screenshot captures exist for the customer home screen and the
workspace chooser, reviewed manually for clipping, color, the logo, and
label correctness — they are visual-review captures on every run, not
yet a pixel-diff regression gate against a committed golden image.
Dedicated Compose UI and screenshot coverage for the onboarding wizard,
business-profile/services/hours/team screens, and the invitation screen
itself does not exist yet — only their ViewModels are unit-tested; this
is a known gap, not a silent omission.

**A genuine Android Keystore does not exist inside a plain-JVM
Robolectric test.** Tests that need to prove `TokenStore`'s own logic
(field mapping, partial updates, null handling) use a test-only
`prefsProvider` seam to substitute a plain `SharedPreferences`; a
separate dedicated test uses the real default factory to confirm the
"Keystore unavailable" case fails safe. The true hardware-backed
encrypted round trip is a connected/instrumented-test concern, not a
unit-test one.

### Connected/instrumented testing

Requires a running emulator or physical device:

```bash
$HOME/Library/Android/sdk/platform-tools/adb devices
./gradlew connectedDebugAndroidTest
```

No emulator is created or deleted automatically by any script in this
repository — set one up in Android Studio's Device Manager first.

## What is explicitly deferred

- Full mobile cash-session management (open/operate/close/review), and
  refund/reversal corrections — the backend implements both; only the
  per-branch cash *policy* is read from Android, to gate the payment
  form.
- Commission-rule management and commission payout.
- Schedule exceptions, booking policy, staff availability rules/
  exceptions — all backend-ready, none built into an Android screen
  this stage.
- Full branch CRUD (only the onboarding-created primary branch exists
  per organization; the branches-list endpoint is read-only) and a real
  multi-branch switcher (every screen uses the workspace's first
  branch).
- Invitation resend/reissue (the backend does not support it either)
  and custom-role creation.
- A verified HTTPS Android App Link for the invitation deep link
  (currently a development-only custom scheme) and automated
  invitation-email delivery (currently Copy/Share only).
- Compose UI and Roborazzi screenshot tests for the queue/checkout/
  payments/verification/resolution/transactions/receipts/earnings/
  reports screens, and for the onboarding/business-management/
  invitation screens from the previous stage (ViewModel-level tests
  exist for all of them; screen-level tests do not yet).
- A full multi-role, real-money, end-to-end journey (walk-in through
  posted Transaction/Receipt/CommissionAccrual, staff earnings, and
  owner reports) has not been run with direct PostgreSQL cross-checks;
  only individual screens have been spot-verified against a live
  backend on an existing emulator.
- iOS (a future stage, sharing the same backend contracts).
- Push notifications and offline/background synchronization.
- Voice/AI-assisted discovery (no fake or placeholder UI exists for
  this today).
- Play Store signing and release; production deployment; subscription
  checkout; payment gateways.

See docs/ROADMAP.md for sequencing.
