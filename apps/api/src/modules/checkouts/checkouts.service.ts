import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import { assertBranchOwnedByOrganization } from '../../common/authorization/assert-branch-owned.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { isUniqueConstraintViolation } from '../../common/database/postgres-constraint-error.util.js';
import { generateReference } from '../../common/identity/generate-reference.util.js';
import type { PaginatedPayload } from '../../common/http/api-response.interceptor.js';
import {
  assertSafeMoneyAmount,
  sumMinorAmounts,
} from '../../common/money/assert-safe-money-amount.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CheckoutAdjustmentType,
  CheckoutStatus,
  CommerceLineItemKind,
  ServiceSessionStatus,
} from '../../generated/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import {
  checkoutViewInclude,
  toCheckoutView,
  type CheckoutView,
} from './checkout-view.js';
import type { CheckoutProductItemDto } from './dto/checkout-product-item.dto.js';
import type { CreateCheckoutAdjustmentDto } from './dto/create-checkout-adjustment.dto.js';
import type { CreateProductCheckoutDto } from './dto/create-product-checkout.dto.js';
import type { VoidCheckoutDto } from './dto/void-checkout.dto.js';

const REFERENCE_PREFIX = 'CHK';
const MAX_REFERENCE_ATTEMPTS = 5;
const CHECKOUT_ACTIVE_STATUSES: readonly CheckoutStatus[] = [
  CheckoutStatus.OPEN,
  CheckoutStatus.AWAITING_VERIFICATION,
  CheckoutStatus.DISPUTED,
];
const BROAD_BRANCH_ACCESS_PERMISSION = 'branches.manage';
const DEFAULT_PAGE_SIZE = 20;

type CheckoutWithRelations = Prisma.CheckoutGetPayload<{
  include: typeof checkoutViewInclude;
}>;

/**
 * Phase 1 of the financial-integrity stage (docs/PRODUCT_REQUIREMENTS.md
 * financial section): turns one COMPLETED ServiceSession into exactly
 * one Checkout, and manages append-only adjustments and voiding of that
 * Checkout before any payment settles it. Never creates a Payment or
 * Transaction — those are PaymentsModule's and TransactionsModule's own
 * concern (see CheckoutSettlementService for the boundary between them).
 */
@Injectable()
export class CheckoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * `Checkout.serviceSessionId` is unique at the database level, so
   * exactly one Checkout can ever exist per ServiceSession. The two ways
   * a second creation attempt can arrive are handled differently on
   * purpose (docs task Phase 1: "Concurrent duplicate creation returns
   * the existing checkout"): a request that lands *after* the first one
   * has already fully committed (the pre-check below finds it) is a
   * genuine repeat action and gets a clear `CHECKOUT_ALREADY_EXISTS`
   * conflict; a request that races the first one so closely that the
   * pre-check still sees nothing (only the reactive unique-constraint
   * catch further down finds it) is treated as the same double-submit
   * and transparently handed back the winner's checkout instead of an
   * error — the caller experiences it as the one click they made.
   */
  async create(
    tenant: TenantContext,
    serviceSessionId: string,
    requestId: string,
    productItems?: readonly CheckoutProductItemDto[],
  ): Promise<CheckoutView> {
    const session = await this.prisma.serviceSession.findFirst({
      where: { id: serviceSessionId, organizationId: tenant.organizationId },
      include: { items: true },
    });
    if (!session) {
      throw new NotFoundException('Service session not found');
    }
    assertMembershipHasBranchAccess(tenant, session.branchId);

    const existing = await this.prisma.checkout.findUnique({
      where: { serviceSessionId },
      include: checkoutViewInclude,
    });
    if (existing) {
      throw new ConflictException({
        code: 'CHECKOUT_ALREADY_EXISTS',
        message: 'A checkout already exists for this service session.',
      });
    }

    if (session.status !== ServiceSessionStatus.COMPLETED) {
      throw new ConflictException({
        code: 'SERVICE_SESSION_NOT_COMPLETED',
        message:
          'A checkout can only be created for a completed service session.',
      });
    }
    if (session.items.length === 0) {
      throw new BadRequestException(
        'This service session has no items to check out',
      );
    }

    const currency = session.items[0].currencySnapshot;
    if (session.items.some((item) => item.currencySnapshot !== currency)) {
      throw new ConflictException({
        code: 'CHECKOUT_TOTAL_INVALID',
        message: 'A checkout cannot mix line items in different currencies.',
      });
    }
    for (const item of session.items) {
      assertSafeMoneyAmount(item.priceMinorSnapshot, 'Line item price');
    }

    // Mixed checkout (docs task: "adding product items to a service
    // checkout" — retail add-ons rung up alongside the session's own
    // service lines, e.g. a haircut plus a bottle of beard oil). Product
    // lines are snapshotted server-side exactly like a product-only
    // checkout's own lines, and must share the session's currency.
    const productLines = productItems?.length
      ? await this.validateAndSnapshotProductItems(
          tenant.organizationId,
          session.branchId,
          productItems,
        )
      : [];
    if (productLines.some((line) => line.currencySnapshot !== currency)) {
      throw new ConflictException({
        code: 'CHECKOUT_TOTAL_INVALID',
        message: 'A checkout cannot mix line items in different currencies.',
      });
    }

    const subtotalMinor = sumMinorAmounts(
      [...session.items.map((item) => item.priceMinorSnapshot), ...productLines.map((line) => line.priceMinorSnapshot)],
      'Checkout subtotal',
    );

    // Zero-value handling (docs task Phase 1): a checkout worth nothing
    // must never silently settle as if it were paid. No NO_CHARGE
    // workflow exists yet in this phase, so it is rejected outright
    // rather than created into a state nothing can ever legitimately
    // pay off (docs/PRODUCT_REQUIREMENTS.md financial section, deferred
    // functionality).
    if (subtotalMinor === 0) {
      throw new ConflictException({
        code: 'CHECKOUT_TOTAL_INVALID',
        message:
          'This service session has no billable value. A zero-value checkout requires a dedicated NO_CHARGE workflow, which does not exist yet.',
      });
    }

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
      const reference = generateReference(REFERENCE_PREFIX);
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          return tx.checkout.create({
            data: {
              organizationId: tenant.organizationId,
              branchId: session.branchId,
              serviceSessionId: session.id,
              customerRecordId: session.customerRecordId,
              assignedStaffProfileId: session.assignedStaffProfileId,
              reference,
              currency,
              subtotalMinor,
              adjustmentTotalMinor: 0,
              totalMinor: subtotalMinor,
              createdByMembershipId: tenant.membershipId,
              items: {
                createMany: {
                  data: [
                    ...session.items.map((item, index) => ({
                      organizationId: tenant.organizationId,
                      kind: CommerceLineItemKind.SERVICE,
                      serviceSessionItemId: item.id,
                      serviceId: item.serviceId,
                      staffProfileId: item.staffProfileId,
                      serviceNameSnapshot: item.serviceNameSnapshot,
                      durationMinutesSnapshot: item.durationMinutesSnapshot,
                      quantity: 1,
                      unitPriceMinorSnapshot: item.priceMinorSnapshot,
                      priceMinorSnapshot: item.priceMinorSnapshot,
                      currencySnapshot: item.currencySnapshot,
                      displayOrder: index,
                    })),
                    ...productLines.map((line, index) => ({
                      organizationId: tenant.organizationId,
                      ...line,
                      displayOrder: session.items.length + index,
                    })),
                  ],
                },
              },
            },
            include: checkoutViewInclude,
          });
        });

        await this.auditService.record({
          organizationId: tenant.organizationId,
          branchId: session.branchId,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          action: 'checkout.created',
          entityType: 'checkout',
          entityId: created.id,
          requestId,
          source: 'checkouts',
          newState: {
            status: CheckoutStatus.OPEN,
            totalMinor: created.totalMinor,
            serviceSessionId,
          },
        });

        return toCheckoutView(created);
      } catch (error) {
        if (
          isUniqueConstraintViolation(error, 'checkouts_service_session_id_key')
        ) {
          const raced = await this.prisma.checkout.findUnique({
            where: { serviceSessionId },
            include: checkoutViewInclude,
          });
          if (raced) {
            return toCheckoutView(raced);
          }
        }
        if (isUniqueConstraintViolation(error, 'checkouts_reference_key')) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException(
      'Could not allocate a unique checkout reference. Please try again.',
    );
  }

  async list(
    tenant: TenantContext,
    options: {
      branchId?: string;
      status?: CheckoutStatus;
      assignedStaffProfileId?: string;
      customerRecordId?: string;
      serviceSessionId?: string;
      cursor?: string;
      limit?: number;
    },
  ): Promise<PaginatedPayload<CheckoutView>> {
    if (options.branchId) {
      assertMembershipHasBranchAccess(tenant, options.branchId);
    }
    const hasBroadBranchAccess = tenant.permissionCodes.has(
      BROAD_BRANCH_ACCESS_PERMISSION,
    );
    const branchFilter = options.branchId
      ? { branchId: options.branchId }
      : hasBroadBranchAccess
        ? {}
        : { branchId: { in: tenant.branchIds } };

    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const cursorId = decodeCursor(options.cursor);

    const rows = await this.prisma.checkout.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...branchFilter,
        ...(options.status ? { status: options.status } : {}),
        ...(options.assignedStaffProfileId
          ? { assignedStaffProfileId: options.assignedStaffProfileId }
          : {}),
        ...(options.customerRecordId
          ? { customerRecordId: options.customerRecordId }
          : {}),
        ...(options.serviceSessionId
          ? { serviceSessionId: options.serviceSessionId }
          : {}),
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      include: checkoutViewInclude,
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      data: page.map(toCheckoutView),
      page: {
        hasMore,
        nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null,
      },
    };
  }

  async get(tenant: TenantContext, checkoutId: string): Promise<CheckoutView> {
    const checkout = await this.loadOwnedCheckout(tenant, checkoutId);
    return toCheckoutView(checkout);
  }

  async addAdjustment(
    tenant: TenantContext,
    checkoutId: string,
    dto: CreateCheckoutAdjustmentDto,
    requestId: string,
  ): Promise<CheckoutView> {
    const checkout = await this.loadOwnedCheckout(tenant, checkoutId);

    if (checkout.status !== CheckoutStatus.OPEN) {
      throw new ConflictException({
        code: 'CHECKOUT_STATE_INVALID',
        message:
          'Adjustments can only be added to an open checkout with no payments recorded yet.',
      });
    }
    const paymentCount = await this.prisma.paymentRecord.count({
      where: { checkoutId },
    });
    if (paymentCount > 0) {
      throw new ConflictException({
        code: 'CHECKOUT_STATE_INVALID',
        message:
          'This checkout already has a payment recorded against it; adjustments are locked.',
      });
    }

    assertSafeMoneyAmount(dto.amountMinor, 'amountMinor', { min: 1 });
    const signedDelta =
      dto.type === CheckoutAdjustmentType.DISCOUNT
        ? -dto.amountMinor
        : dto.amountMinor;
    const newAdjustmentTotalMinor = checkout.adjustmentTotalMinor + signedDelta;
    const newTotalMinor = checkout.subtotalMinor + newAdjustmentTotalMinor;
    if (newTotalMinor < 0) {
      throw new ConflictException({
        code: 'CHECKOUT_TOTAL_INVALID',
        message: 'This discount would reduce the checkout total below zero.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.checkout.updateMany({
        where: { id: checkoutId, version: checkout.version },
        data: {
          adjustmentTotalMinor: newAdjustmentTotalMinor,
          totalMinor: newTotalMinor,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException(
          'This checkout was already updated by someone else',
        );
      }
      await tx.checkoutAdjustment.create({
        data: {
          organizationId: tenant.organizationId,
          checkoutId,
          type: dto.type,
          amountMinor: dto.amountMinor,
          reason: dto.reason,
          createdByMembershipId: tenant.membershipId,
        },
      });
      return tx.checkout.findUniqueOrThrow({
        where: { id: checkoutId },
        include: checkoutViewInclude,
      });
    });

    await this.auditService.record({
      organizationId: tenant.organizationId,
      branchId: checkout.branchId,
      actorUserId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      action: 'checkout.adjustment_added',
      entityType: 'checkout',
      entityId: checkoutId,
      requestId,
      source: 'checkouts',
      previousState: { totalMinor: checkout.totalMinor },
      newState: {
        totalMinor: newTotalMinor,
        adjustmentType: dto.type,
        amountMinor: dto.amountMinor,
      },
    });

    return toCheckoutView(updated);
  }

  async void(
    tenant: TenantContext,
    checkoutId: string,
    dto: VoidCheckoutDto,
    requestId: string,
  ): Promise<CheckoutView> {
    const checkout = await this.loadOwnedCheckout(tenant, checkoutId);

    if (!CHECKOUT_ACTIVE_STATUSES.includes(checkout.status)) {
      throw new ConflictException({
        code:
          checkout.status === CheckoutStatus.SETTLED
            ? 'CHECKOUT_ALREADY_SETTLED'
            : 'CHECKOUT_STATE_INVALID',
        message:
          'Only an open, awaiting-verification, or disputed checkout can be voided.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.checkout.updateMany({
        where: { id: checkoutId, version: checkout.version },
        data: {
          status: CheckoutStatus.VOIDED,
          voidedAt: new Date(),
          voidedByMembershipId: tenant.membershipId,
          voidReason: dto.reason,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException(
          'This checkout was already updated by someone else',
        );
      }
      return tx.checkout.findUniqueOrThrow({
        where: { id: checkoutId },
        include: checkoutViewInclude,
      });
    });

    await this.auditService.record({
      organizationId: tenant.organizationId,
      branchId: checkout.branchId,
      actorUserId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      action: 'checkout.voided',
      entityType: 'checkout',
      entityId: checkoutId,
      requestId,
      source: 'checkouts',
      previousState: { status: checkout.status },
      newState: { status: CheckoutStatus.VOIDED, reason: dto.reason },
    });

    return toCheckoutView(updated);
  }

  /**
   * Product-only checkout — a retail sale with no ServiceSession to
   * anchor it (docs task: "If product-only checkout requires a new
   * command, implement it cleanly"). Reuses the exact same reference-
   * allocation/idempotency pattern as `create` above; the only real
   * difference is where the line items and the operator come from.
   * `assignedStaffProfileId` is still always populated here (defaulting
   * to the caller's own StaffProfile) so this checkout can settle
   * through the same cash-confirmation flow as a service checkout —
   * see TransactionPostingService's own guard for why that column stays
   * required all the way through to Transaction.
   */
  async createForProductSale(
    tenant: TenantContext,
    dto: CreateProductCheckoutDto,
    requestId: string,
  ): Promise<CheckoutView> {
    assertMembershipHasBranchAccess(tenant, dto.branchId);
    await assertBranchOwnedByOrganization(this.prisma, tenant.organizationId, dto.branchId);

    let customerRecordId: string | null = null;
    if (dto.customerRecordId) {
      const customer = await this.prisma.customerRecord.findFirst({
        where: { id: dto.customerRecordId, organizationId: tenant.organizationId, archivedAt: null },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      customerRecordId = customer.id;
    }

    const assignedStaffProfileId = await this.resolveOperatorStaffProfileId(
      tenant,
      dto.operatorStaffProfileId,
    );

    const productLines = await this.validateAndSnapshotProductItems(
      tenant.organizationId,
      dto.branchId,
      dto.items,
    );
    const currency = productLines[0].currencySnapshot;
    if (productLines.some((line) => line.currencySnapshot !== currency)) {
      throw new ConflictException({
        code: 'CHECKOUT_TOTAL_INVALID',
        message: 'A checkout cannot mix line items in different currencies.',
      });
    }
    const subtotalMinor = sumMinorAmounts(
      productLines.map((line) => line.priceMinorSnapshot),
      'Checkout subtotal',
    );
    if (subtotalMinor === 0) {
      throw new ConflictException({
        code: 'CHECKOUT_TOTAL_INVALID',
        message: 'This checkout has no billable value.',
      });
    }

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
      const reference = generateReference(REFERENCE_PREFIX);
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          return tx.checkout.create({
            data: {
              organizationId: tenant.organizationId,
              branchId: dto.branchId,
              serviceSessionId: null,
              customerRecordId,
              assignedStaffProfileId,
              reference,
              currency,
              subtotalMinor,
              adjustmentTotalMinor: 0,
              totalMinor: subtotalMinor,
              createdByMembershipId: tenant.membershipId,
              items: {
                createMany: {
                  data: productLines.map((line, index) => ({
                    organizationId: tenant.organizationId,
                    ...line,
                    displayOrder: index,
                  })),
                },
              },
            },
            include: checkoutViewInclude,
          });
        });

        await this.auditService.record({
          organizationId: tenant.organizationId,
          branchId: dto.branchId,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          action: 'checkout.created',
          entityType: 'checkout',
          entityId: created.id,
          requestId,
          source: 'checkouts',
          newState: {
            status: CheckoutStatus.OPEN,
            totalMinor: created.totalMinor,
            productOnly: true,
          },
        });

        return toCheckoutView(created);
      } catch (error) {
        if (isUniqueConstraintViolation(error, 'checkouts_reference_key')) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException(
      'Could not allocate a unique checkout reference. Please try again.',
    );
  }

  /**
   * Server-side price/name/SKU/barcode snapshot for a set of requested
   * product items — never trusts a client-supplied price (docs task:
   * "Product checkout must ... snapshot current server-side selling
   * price"). The branch stock check here is a best-effort, non-locking
   * early rejection for obviously-oversold requests; it is not the
   * authoritative guard (that is BranchInventoryService.applySaleMovement
   * at settlement time, which alone can actually prevent overselling
   * under concurrency, since stock can still move between checkout
   * creation and settlement).
   */
  private async validateAndSnapshotProductItems(
    organizationId: string,
    branchId: string,
    items: readonly CheckoutProductItemDto[],
  ) {
    const variantIds = items.map((item) => item.productVariantId);
    if (new Set(variantIds).size !== variantIds.length) {
      throw new BadRequestException(
        'Duplicate productVariantId in checkout items; combine quantities into a single line instead',
      );
    }

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, organizationId },
      include: {
        product: true,
        branchInventory: { where: { branchId }, take: 1 },
      },
    });
    const variantsById = new Map(variants.map((variant) => [variant.id, variant]));

    return items.map((item) => {
      const variant = variantsById.get(item.productVariantId);
      if (!variant || variant.archivedAt !== null || variant.product.archivedAt !== null) {
        throw new NotFoundException(`Product variant ${item.productVariantId} not found`);
      }
      if (variant.product.trackInventory) {
        const onHand = variant.branchInventory[0]?.quantityOnHand ?? 0;
        if (onHand < item.quantity) {
          throw new ConflictException({
            code: 'INSUFFICIENT_STOCK',
            message: `Insufficient stock for ${variant.product.name} (${variant.name}). Available: ${onHand}, requested: ${item.quantity}.`,
          });
        }
      }
      assertSafeMoneyAmount(variant.sellingPriceMinor, 'Product selling price');
      const priceMinorSnapshot = variant.sellingPriceMinor * item.quantity;
      assertSafeMoneyAmount(priceMinorSnapshot, 'Product line total');

      return {
        kind: CommerceLineItemKind.PRODUCT,
        productId: variant.productId,
        productVariantId: variant.id,
        productNameSnapshot: variant.product.name,
        variantNameSnapshot: variant.name,
        skuSnapshot: variant.sku,
        barcodeSnapshot: variant.barcode,
        quantity: item.quantity,
        unitPriceMinorSnapshot: variant.sellingPriceMinor,
        priceMinorSnapshot,
        currencySnapshot: variant.product.currency,
      };
    });
  }

  /** The MVP cash-confirmation flow requires an operator StaffProfile on
   * every checkout (see TransactionPostingService's own guard) — a
   * service checkout always inherits one from its ServiceSession, so
   * only the product paths need to resolve one explicitly: an
   * explicitly supplied `operatorStaffProfileId` (any active staff
   * member, e.g. a cashier ringing up a sale for a colleague), or the
   * caller's own StaffProfile when they have one. */
  private async resolveOperatorStaffProfileId(
    tenant: TenantContext,
    explicitStaffProfileId: string | undefined,
  ): Promise<string> {
    if (explicitStaffProfileId) {
      const staff = await this.prisma.staffProfile.findFirst({
        where: { id: explicitStaffProfileId, organizationId: tenant.organizationId, archivedAt: null },
      });
      if (!staff) {
        throw new NotFoundException('Staff profile not found');
      }
      return staff.id;
    }
    const own = await this.prisma.staffProfile.findUnique({
      where: { organizationId_membershipId: { organizationId: tenant.organizationId, membershipId: tenant.membershipId } },
    });
    if (!own || own.archivedAt !== null) {
      throw new BadRequestException(
        'An operatorStaffProfileId is required: your account has no staff profile of its own.',
      );
    }
    return own.id;
  }

  private async loadOwnedCheckout(
    tenant: TenantContext,
    checkoutId: string,
  ): Promise<CheckoutWithRelations> {
    const checkout = await this.prisma.checkout.findFirst({
      where: { id: checkoutId, organizationId: tenant.organizationId },
      include: checkoutViewInclude,
    });
    if (!checkout) {
      throw new NotFoundException('Checkout not found');
    }
    assertMembershipHasBranchAccess(tenant, checkout.branchId);
    return checkout;
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): string | undefined {
  if (!cursor) {
    return undefined;
  }
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
}
