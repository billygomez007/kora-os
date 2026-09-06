# Kora OS Mobile Authentication Design Batch 01

This package contains the approved visual references for the Kora OS
passwordless authentication and first-time identity journey.

## Authoritative files

1. `kora-auth-splash-reference.png`
   - Cold start, session restoration, and initial route resolution.
2. `kora-auth-email-reference.png`
   - Shared passwordless sign-in/sign-up entry using an email address.
3. `kora-auth-otp-reference.png`
   - Six-digit email OTP verification. This screen was implemented in Android
     at commit `ce5646f`.
4. `kora-auth-account-type-reference.png`
   - First-time choice between the customer experience and a business
     workspace.
5. `kora-auth-workspace-selection-reference.png`
   - Selection for a user with customer access and one or more business
     memberships.
6. `kora-auth-customer-profile-reference.png`
   - Minimal customer-profile setup after the first successful sign-in.

## Implementation rules

- Recreate each screen natively with Jetpack Compose. Do not ship these PNGs as
  full-screen backgrounds.
- Reuse the existing Kora theme, official logo, navigation, authentication,
  session, repository, and API architecture.
- Kora OS is passwordless. Never add passwords, password reset, stored OTPs,
  hard-coded OTPs, or OTP logging.
- Treat these references as layout and visual-direction sources. Dynamic data,
  accessibility, safe areas, keyboard behavior, loading, error, and responsive
  behavior must be implemented natively.
- The backend intentionally returns one generic `OTP_INVALID` result for an
  incorrect, expired, consumed, invalidated, or locked challenge. The Android
  UI must not claim it can distinguish those causes.
- Do not infer or reference design filenames that are not listed in this file.

## Suggested implementation order

1. Splash and session routing
2. Email entry and OTP request
3. Account-type selection
4. Workspace selection
5. Customer-profile setup

