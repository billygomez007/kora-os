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

Staff invitations enforce `staff.max` server-side. The current API has no branch
creation endpoint beyond onboarding's first branch; onboarding still validates
the branch entitlement, and future branch-write endpoints must call the same
`EntitlementsService.assertWithinLimit` helper. Existing over-limit data is
grandfathered and is not deleted by a plan change.

The authenticated subscription catalogue, Settings page, and read-only Super
Admin subscription view read the same plan records, prices, and entitlement
values. Enterprise custom limits are represented as `null`, never as a
fabricated numeric ceiling.
