# Kora API

The Kora OS backend: a modular NestJS monolith serving the Android app
(and, later, iOS) over a versioned REST API under `/v1`. See
`../../docs/` for the full product, architecture, data model, API, and
security specifications — this file only covers running and testing this
package.

## Setup

Requires Node 24.19+, pnpm 11.21+, and Docker (for local PostgreSQL).

```bash
# from the repository root
pnpm install
pnpm db:up          # starts PostgreSQL 18.6 in Docker on port 5433
```

Copy `.env.example` (repository root) to `.env` and fill in the two
signing secrets, which are never committed and have no default value:

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # REFRESH_TOKEN_PEPPER
openssl rand -base64 48   # OTP_PEPPER
```

Then apply the schema and seed reference data (permissions, system roles,
plan shells, discovery categories):

```bash
pnpm prisma:migrate:deploy
pnpm prisma:seed
```

## Running

```bash
pnpm api:dev     # watch mode, from the repository root
# or, from apps/api:
pnpm start:dev
```

The API listens on `PORT` (default 3000) under the `API_PREFIX` (default
`v1`), so `GET http://localhost:3000/v1/health` should return `200`.

## Testing

```bash
pnpm --dir apps/api test        # unit tests (mocked dependencies)
pnpm --dir apps/api test:e2e    # integration tests against the real
                                 # local PostgreSQL container
```

E2E tests boot a real Nest application per test file (some boot one per
test) against the same database `pnpm db:up` starts — no mocking of
Prisma. Each spec file tracks and deletes the rows it creates.

## Authentication in one paragraph

Kora OS uses passwordless email OTP authentication for customers,
owners, managers and staff. Kora does not store or support user
passwords. `POST /v1/auth/email-otp/request` emails a one-time code;
`POST /v1/auth/email-otp/verify` (challenge ID + code) is both sign-up
and sign-in — it creates the account on first use and signs the same
account in every time after — and returns a short-lived signed access
token plus a long-lived opaque refresh token. A Kora account (`User`) is
global: the same account can hold business memberships
(`OrganizationMembership`, one business workspace per organization) and
a customer profile (`CustomerProfile`, the single customer workspace) at
once. The refresh token rotates on every use, and reusing an
already-rotated one revokes the whole session. Send the access token as
`Authorization: Bearer <token>`. Organization-scoped requests
additionally need either an `X-Kora-Organization-Id` header or an
`:organizationId` route param — that ID only *selects* which membership
to check, it never grants access by itself. See `docs/API_SPEC.md` and
`docs/SECURITY.md` for the full model. There is no real email provider
wired in yet — locally, a sign-in code is printed to the terminal
running `pnpm api:dev` (clearly labeled, development-only, never enabled
in production; see `EmailOtpModule`).

## Useful root-level scripts

Run from the repository root (see the root `package.json` for the full
list):

- `pnpm db:up` / `db:down` / `db:status` / `db:logs` — local PostgreSQL container
- `pnpm prisma:format` / `prisma:validate` / `prisma:generate`
- `pnpm prisma:migrate:dev` / `prisma:migrate:deploy` / `prisma:migrate:status`
- `pnpm prisma:studio` / `prisma:seed`
- `pnpm api:build` / `api:dev` / `api:lint` / `api:test` / `api:test:e2e`
