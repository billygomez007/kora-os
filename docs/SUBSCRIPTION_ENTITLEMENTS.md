# Kora subscription entitlement architecture

Kora uses one cumulative entitlement catalogue for the public Starter, Business,
Pro, and Enterprise plans. The canonical definition is
`apps/api/src/modules/subscriptions/plan-entitlements.ts`; the Prisma seed
imports it rather than maintaining a second plan matrix.

## Public plan limits

| Plan | Branches | Staff |
| --- | ---: | ---: |
| Starter | 1 | 5 |
| Business | 3 | 20 |
| Pro | 10 | 75 |
| Enterprise | Custom/contract-defined | Custom/contract-defined |

Business inherits Starter capabilities, Pro inherits Business, and Enterprise
inherits Pro. `Growth` remains an internal legacy plan for existing records and
is excluded from the public catalogue.

Plan entitlements and RBAC permissions are separate checks. For example, cash
reconciliation requires both the `reports.read` permission and the
`cash.reconciliation` plan entitlement. Reporting and commission permissions are
never granted by a plan entitlement alone.

Commission reporting is a separate capability from basic accrual tracking:
`commissions.basic` remains enabled for every plan, while
`commissions.reporting` is disabled for Starter (including its TRIALING
period) and enabled for Growth, Business, Pro, and Enterprise. The dedicated
owner/manager commission report therefore requires both `reports.read` and
`commissions.reporting`. Mixed reports such as the overview remain available
to lower-tier readers, but withhold only the premium commission field and
return `commissionReportingAvailable: false` so the UI can show a localized
plan-unavailable state. Staff self-earnings and operational accrual reads keep
their existing `commissions.read_own`/`commissions.read_all` permission gates.

Inventory uses the same cumulative model. `products.basic` is enabled for
every plan and covers the product catalogue, variants, categories, supplier
metadata, quantity-on-hand visibility, receiving stock, manual stock
adjustments, product checkout, automatic sale decrement, and existing return
or restock flows. `inventory.expanded` is disabled for Starter (including its
TRIALING period) and enabled for Growth, Business, Pro, and Enterprise. It is
reserved for advanced inventory controls only: movement-history reads and
reorder-level configuration (including any future dedicated low-stock or
reorder endpoint). Basic inventory operations must not be hidden behind this
entitlement. These routes still require their normal `inventory.read` or
`inventory.manage` permission, tenant access, and branch scope checks.

Staff invitations enforce `staff.max` server-side. The current API has no branch
creation endpoint beyond onboarding's first branch; onboarding still validates
the branch entitlement, and future branch-write endpoints must call the same
`EntitlementsService.assertWithinLimit` helper. Existing over-limit data is
grandfathered and is not deleted by a plan change.

The authenticated subscription catalogue, Settings page, and read-only Super
Admin subscription view read the same plan records, prices, and entitlement
values. Enterprise custom limits are represented as `null`, never as a
fabricated numeric ceiling.

## New-business trial policy

Fresh business onboarding creates a Starter subscription with `TRIALING`
status and a 30-day trial. The single source of truth for that policy is
`apps/api/src/modules/subscriptions/trial-policy.ts`; it is deliberately kept
separate from pricing and entitlement definitions. Trial access is resolved by
the existing subscription access service, so a trial does not bypass
authentication, membership, branch, permission, or tenant checks.

The authenticated subscription detail response exposes both `trialStartedAt`
and `trialEndsAt`. The workspace Settings subscription view uses those fields
to show the active trial and a locale-aware remaining-day count without
changing currency or inventing billing behavior.

## Reference-data synchronization

`pnpm prisma:sync-reference-data` runs the same verified platform-reference-only
seed as `pnpm prisma:seed`. It upserts permissions, roles, entitlement
definitions, subscription plans/prices, and discovery categories; it does not
create organizations, users, memberships, branches, or marketplace fixtures.
Run it only after the production schema is up to date and after reviewing a
read-only production reference-data comparison. It is safe to repeat and is
not invoked automatically during application startup. Never use the separate
`prisma:seed:marketplace-demo` fixture command for production reference repair.
