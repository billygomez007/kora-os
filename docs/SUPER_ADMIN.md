# Kora Platform Super Admin

## Purpose

The platform Super Admin is an internal Kora operations identity. It is not a
business Owner and does not receive membership, tenant, branch, or financial
permissions in customer organizations.

## Authorization model

Platform authorization is stored separately from organization roles:

- `PlatformRole` defines extensible platform roles such as `SUPER_ADMIN`.
- `PlatformPermission` defines platform capabilities.
- `PlatformRolePermission` grants capabilities to a platform role.
- `PlatformRoleAssignment` persistently assigns a role to a User and can be
  revoked without changing any business membership.

Platform API routes use `PlatformAccessGuard` and
`RequirePlatformPermissions(...)`. The server resolves active assignments from
the authenticated User and never trusts an email, local storage, frontend
flags, or an organization ID as authorization evidence.

## Initial bootstrap

The approved initial account is `info@koraafric.com`.

Run the normal Kora email-OTP account flow first if that User does not yet
exist. Then run the existing idempotent Prisma seed/bootstrap command in the
API environment. The seed creates the platform role and permissions and, when
the approved User exists, upserts one active `SUPER_ADMIN` assignment. It does
not create a User, set a password, or store credentials.

Rerunning the seed is safe. It does not create duplicate roles, permissions,
or assignments. Revoking an assignment is a database/admin operation and must
be performed deliberately; rerunning the bootstrap reactivates the approved
initial assignment by design.

## Routes

The platform API namespace is `/v1/platform` (subject to the configured API
prefix):

- `GET /overview`
- `GET /businesses`
- `GET /businesses/:organizationId`
- `GET /users`
- `GET /subscriptions`
- `GET /activity`

The web console is `/en/super-admin` or `/fr/super-admin`. It is separate from
the normal `/app` business workspace.

## Data handling and audit

The initial console is read-only. It shows operational metadata and aggregate
counts, not OTP codes, access tokens, refresh tokens, password hashes, SMTP
credentials, database URLs, or private tenant customer/payment records.

No impersonation is implemented. Any future impersonation must require a
dedicated platform permission, a reason, append-only audit logging, a visible
banner, an easy exit, and restrictions around financial or sensitive actions.

If platform mutations are added later, they must use `AuditService` with the
platform actor, target, request ID, action, and safe before/after metadata.

## Future roles and recovery

The separate role/permission tables support delegated roles such as
`SUPPORT_ADMIN`, `FINANCE_ADMIN`, `OPERATIONS_ADMIN`, `COMPLIANCE_ADMIN`, and
`READ_ONLY_ADMIN` without turning them into business roles. Emergency access
should be provisioned through a reviewed, auditable database/bootstrap process
and never through a hard-coded email check or a shared password.
