import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { isUniqueConstraintViolation } from '../../common/database/postgres-constraint-error.util.js';
import type { PaginatedPayload } from '../../common/http/api-response.interceptor.js';
import { assertSafeMoneyAmount } from '../../common/money/assert-safe-money-amount.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CashLedgerEntryType, CashPolicyMode, CashSessionStatus } from '../../generated/prisma/client.js';
import type { CashSession, Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { BranchCashPolicyService } from './branch-cash-policy.service.js';
import { calculateExpectedClosingCashMinor } from './cash-expected-balance.util.js';
import { cashSessionViewInclude, toCashSessionView, type CashSessionView } from './cash-session-view.js';

type CashSessionWithReview = Prisma.CashSessionGetPayload<{ include: typeof cashSessionViewInclude }>;
import type { CloseCashSessionDto } from './dto/close-cash-session.dto.js';
import type { OpenCashSessionDto } from './dto/open-cash-session.dto.js';
import type { RecordCashMovementDto } from './dto/record-cash-movement.dto.js';
import type { ReviewCashSessionDto } from './dto/review-cash-session.dto.js';

type TransactionClient = Prisma.TransactionClient;

const RECONCILE_PERMISSION = 'cash_sessions.reconcile';
const BROAD_BRANCH_ACCESS_PERMISSION = 'branches.manage';
const DEFAULT_PAGE_SIZE = 20;
const OPEN_SESSION_UNIQUE_CONSTRAINT = 'cash_sessions_one_open_per_register_currency';

export interface CashActor {
  organizationId: string;
  userId: string;
  membershipId: string;
  requestId: string;
}

/**
 * Branch cash-drawer custody: open with a float, record manual
 * movements and payments received, close with a physical count, then
 * review. `expectedClosingCashMinor`/`countedCashMinor`/`varianceMinor`
 * are a physical-custody calculation only — never revenue (docs task
 * Phase 1, docs/ARCHITECTURE.md). Every mutation locks the target
 * CashSession row first (`lockCashSession`, a `SELECT ... FOR UPDATE`),
 * the same aggregate-root-lock pattern `CheckoutSettlementService`
 * already established — a `cash_ledger_entries` INSERT trigger
 * (this migration) rejects any entry whose session is not OPEN as a
 * hard backstop behind that lock. `recordPaymentReceivedEntry` is the
 * one method called from outside this module (PaymentsService), always
 * from within a transaction that has already locked the Checkout first,
 * preserving a single global lock order (Checkout, then CashSession)
 * with no deadlock risk.
 */
@Injectable()
export class CashSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cashPolicyService: BranchCashPolicyService,
  ) {}

  async lockCashSession(tx: TransactionClient, cashSessionId: string): Promise<CashSession> {
    await tx.$queryRaw`SELECT id FROM cash_sessions WHERE id = ${cashSessionId}::uuid FOR UPDATE`;
    return tx.cashSession.findUniqueOrThrow({ where: { id: cashSessionId } });
  }

  async open(tenant: TenantContext, dto: OpenCashSessionDto, actor: CashActor): Promise<CashSessionView> {
    const register = await this.prisma.cashRegister.findFirst({
      where: { id: dto.registerId, organizationId: tenant.organizationId },
    });
    if (!register) {
      throw new NotFoundException('Cash register not found');
    }
    if (register.archivedAt) {
      throw new ConflictException({ code: 'CASH_REGISTER_ARCHIVED', message: 'This cash register is archived.' });
    }
    assertMembershipHasBranchAccess(tenant, register.branchId);
    assertSafeMoneyAmount(dto.openingFloatMinor, 'openingFloatMinor');

    try {
      const session = await this.prisma.$transaction(async (tx) => {
        const created = await tx.cashSession.create({
          data: {
            organizationId: tenant.organizationId,
            branchId: register.branchId,
            registerId: register.id,
            currency: dto.currency,
            openedByMembershipId: tenant.membershipId,
            openingFloatMinor: dto.openingFloatMinor,
          },
        });
        // Every CashLedgerEntry carries a strictly positive amount
        // (CHECK constraint, this migration) — a session opened with no
        // float at all simply gets no OPENING_FLOAT row, which sums to
        // the same zero contribution calculateExpectedClosingCashMinor
        // would derive from a zero-amount entry anyway.
        if (dto.openingFloatMinor > 0) {
          await tx.cashLedgerEntry.create({
            data: {
              organizationId: tenant.organizationId,
              branchId: register.branchId,
              registerId: register.id,
              cashSessionId: created.id,
              currency: dto.currency,
              type: CashLedgerEntryType.OPENING_FLOAT,
              amountMinor: dto.openingFloatMinor,
              actorMembershipId: tenant.membershipId,
            },
          });
        }
        return tx.cashSession.findUniqueOrThrow({ where: { id: created.id }, include: cashSessionViewInclude });
      });

      await this.auditService.record({
        organizationId: tenant.organizationId,
        branchId: register.branchId,
        actorUserId: actor.userId,
        actorMembershipId: tenant.membershipId,
        action: 'cash_session.opened',
        entityType: 'cash_session',
        entityId: session.id,
        requestId: actor.requestId,
        source: 'cash',
        newState: { registerId: register.id, currency: dto.currency, openingFloatMinor: dto.openingFloatMinor },
      });

      return toCashSessionView(session);
    } catch (error) {
      if (isUniqueConstraintViolation(error, OPEN_SESSION_UNIQUE_CONSTRAINT)) {
        throw new ConflictException({
          code: 'CASH_SESSION_ALREADY_OPEN',
          message: 'This register already has an open session in this currency.',
        });
      }
      throw error;
    }
  }

  async list(
    tenant: TenantContext,
    options: {
      branchId?: string;
      registerId?: string;
      openedByMembershipId?: string;
      currency?: string;
      status?: CashSessionStatus;
      cursor?: string;
      limit?: number;
    },
  ): Promise<PaginatedPayload<CashSessionView>> {
    if (options.branchId) {
      assertMembershipHasBranchAccess(tenant, options.branchId);
    }
    const hasBroadBranchAccess = tenant.permissionCodes.has(BROAD_BRANCH_ACCESS_PERMISSION);
    const branchFilter = options.branchId
      ? { branchId: options.branchId }
      : hasBroadBranchAccess
        ? {}
        : { branchId: { in: tenant.branchIds } };

    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const cursorId = decodeCursor(options.cursor);

    const rows = await this.prisma.cashSession.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...branchFilter,
        ...(options.registerId ? { registerId: options.registerId } : {}),
        ...(options.openedByMembershipId ? { openedByMembershipId: options.openedByMembershipId } : {}),
        ...(options.currency ? { currency: options.currency } : {}),
        ...(options.status ? { status: options.status } : {}),
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      include: cashSessionViewInclude,
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      data: page.map(toCashSessionView),
      page: { hasMore, nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null },
    };
  }

  async get(tenant: TenantContext, cashSessionId: string): Promise<CashSessionView> {
    const session = await this.loadOwnedSession(tenant, cashSessionId);
    return toCashSessionView(session);
  }

  async recordMovement(
    tenant: TenantContext,
    cashSessionId: string,
    dto: RecordCashMovementDto,
    actor: CashActor,
  ): Promise<CashSessionView> {
    const session = await this.loadOwnedSession(tenant, cashSessionId);
    this.assertCanOperate(tenant, session);
    assertSafeMoneyAmount(dto.amountMinor, 'amountMinor', { min: 1 });

    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockCashSession(tx, cashSessionId);
      if (locked.status !== CashSessionStatus.OPEN) {
        throw new ConflictException({ code: 'CASH_SESSION_NOT_OPEN', message: 'This cash session is not open.' });
      }
      await tx.cashLedgerEntry.create({
        data: {
          organizationId: tenant.organizationId,
          branchId: locked.branchId,
          registerId: locked.registerId,
          cashSessionId,
          currency: locked.currency,
          type: dto.type,
          amountMinor: dto.amountMinor,
          reason: dto.reason,
          actorMembershipId: tenant.membershipId,
        },
      });
      return tx.cashSession.findUniqueOrThrow({ where: { id: cashSessionId }, include: cashSessionViewInclude });
    });

    await this.auditService.record({
      organizationId: tenant.organizationId,
      branchId: session.branchId,
      actorUserId: actor.userId,
      actorMembershipId: tenant.membershipId,
      action: 'cash_movement.recorded',
      entityType: 'cash_session',
      entityId: cashSessionId,
      requestId: actor.requestId,
      source: 'cash',
      newState: { type: dto.type, amountMinor: dto.amountMinor, reason: dto.reason },
    });

    return toCashSessionView(updated);
  }

  async close(tenant: TenantContext, cashSessionId: string, dto: CloseCashSessionDto, actor: CashActor): Promise<CashSessionView> {
    const session = await this.loadOwnedSession(tenant, cashSessionId);
    this.assertCanOperate(tenant, session);
    assertSafeMoneyAmount(dto.countedCashMinor, 'countedCashMinor');

    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockCashSession(tx, cashSessionId);
      if (locked.status !== CashSessionStatus.OPEN) {
        throw new ConflictException({ code: 'CASH_SESSION_NOT_OPEN', message: 'This cash session is not open.' });
      }

      const entries = await tx.cashLedgerEntry.findMany({ where: { cashSessionId }, select: { type: true, amountMinor: true } });
      const expectedClosingCashMinor = calculateExpectedClosingCashMinor(entries);
      const varianceMinor = dto.countedCashMinor - expectedClosingCashMinor;

      const result = await tx.cashSession.updateMany({
        where: { id: cashSessionId, version: locked.version },
        data: {
          status: CashSessionStatus.CLOSED,
          closedAt: new Date(),
          closedByMembershipId: tenant.membershipId,
          expectedClosingCashMinor,
          countedCashMinor: dto.countedCashMinor,
          varianceMinor,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException('This cash session was already updated by someone else');
      }
      return tx.cashSession.findUniqueOrThrow({ where: { id: cashSessionId }, include: cashSessionViewInclude });
    });

    await this.auditService.record({
      organizationId: tenant.organizationId,
      branchId: session.branchId,
      actorUserId: actor.userId,
      actorMembershipId: tenant.membershipId,
      action: 'cash_session.closed',
      entityType: 'cash_session',
      entityId: cashSessionId,
      requestId: actor.requestId,
      source: 'cash',
      newState: {
        expectedClosingCashMinor: updated.expectedClosingCashMinor,
        countedCashMinor: updated.countedCashMinor,
        varianceMinor: updated.varianceMinor,
      },
    });

    return toCashSessionView(updated);
  }

  async review(tenant: TenantContext, cashSessionId: string, dto: ReviewCashSessionDto, actor: CashActor): Promise<CashSessionView> {
    const session = await this.loadOwnedSession(tenant, cashSessionId);
    if (session.status !== CashSessionStatus.CLOSED) {
      throw new ConflictException({ code: 'CASH_SESSION_NOT_CLOSED', message: 'Only a closed cash session can be reviewed.' });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.cashSession.updateMany({
        where: { id: cashSessionId, status: CashSessionStatus.CLOSED, version: session.version },
        data: { status: CashSessionStatus.REVIEWED, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException('This cash session was already updated by someone else');
      }
      await tx.cashSessionReview.create({
        data: {
          organizationId: tenant.organizationId,
          cashSessionId,
          outcome: dto.outcome,
          reason: dto.reason,
          reviewedByMembershipId: tenant.membershipId,
        },
      });
      return tx.cashSession.findUniqueOrThrow({ where: { id: cashSessionId }, include: cashSessionViewInclude });
    });

    await this.auditService.record({
      organizationId: tenant.organizationId,
      branchId: session.branchId,
      actorUserId: actor.userId,
      actorMembershipId: tenant.membershipId,
      action: 'cash_session.reviewed',
      entityType: 'cash_session',
      entityId: cashSessionId,
      requestId: actor.requestId,
      source: 'cash',
      newState: { outcome: dto.outcome, reason: dto.reason },
    });

    return toCashSessionView(updated);
  }

  /**
   * Called only from PaymentsService.record, inside the transaction that
   * already holds the Checkout lock — this method takes the CashSession
   * lock second, preserving one global lock order everywhere in the
   * codebase and ruling out deadlock between the two. Validates that the
   * session actually belongs to the same organization/branch/currency as
   * the payment being recorded, and that the actor may use it (their own
   * session, or `cash_sessions.reconcile`). Idempotent payment retries
   * never call this twice for the same PaymentRecord — PaymentsService's
   * own idempotency check short-circuits before this is ever reached.
   */
  async recordPaymentReceivedEntry(
    tx: TransactionClient,
    tenant: Pick<TenantContext, 'organizationId' | 'membershipId' | 'permissionCodes'>,
    cashSessionId: string,
    params: { branchId: string; currency: string; paymentRecordId: string; appliedAmountMinor: number },
  ): Promise<void> {
    const locked = await this.lockCashSession(tx, cashSessionId);
    if (locked.organizationId !== tenant.organizationId || locked.branchId !== params.branchId) {
      throw new BadRequestException('This cash session does not belong to this branch');
    }
    if (locked.currency !== params.currency) {
      throw new BadRequestException('This cash session is not in the checkout currency');
    }
    if (locked.status !== CashSessionStatus.OPEN) {
      throw new ConflictException({ code: 'CASH_SESSION_NOT_OPEN', message: 'This cash session is not open.' });
    }
    const isOwnSession = locked.openedByMembershipId === tenant.membershipId;
    const canOverride = tenant.permissionCodes.has(RECONCILE_PERMISSION);
    if (!isOwnSession && !canOverride) {
      throw new ForbiddenException('You can only record cash payments into a session you opened');
    }

    await tx.cashLedgerEntry.create({
      data: {
        organizationId: tenant.organizationId,
        branchId: params.branchId,
        registerId: locked.registerId,
        cashSessionId,
        currency: params.currency,
        type: CashLedgerEntryType.PAYMENT_RECEIVED,
        amountMinor: params.appliedAmountMinor,
        paymentRecordId: params.paymentRecordId,
        actorMembershipId: tenant.membershipId,
      },
    });
  }

  /**
   * Called only from TransactionCorrectionExecutionService, inside the
   * transaction that posts a CASH-returned corrective Transaction — the
   * exact mirror of `recordPaymentReceivedEntry` for the opposite cash
   * direction (docs task Phase 3: "Create a REFUND_PAID CashLedgerEntry
   * when the method is CASH"). Same lock-order guarantee: the original
   * sale Transaction row is already locked by the caller before this is
   * reached, and this method takes the CashSession lock second.
   */
  async recordRefundPaidEntry(
    tx: TransactionClient,
    tenant: Pick<TenantContext, 'organizationId' | 'membershipId' | 'permissionCodes'>,
    cashSessionId: string,
    params: { branchId: string; currency: string; correctiveTransactionId: string; amountMinor: number },
  ): Promise<void> {
    const locked = await this.lockCashSession(tx, cashSessionId);
    if (locked.organizationId !== tenant.organizationId || locked.branchId !== params.branchId) {
      throw new BadRequestException('This cash session does not belong to this branch');
    }
    if (locked.currency !== params.currency) {
      throw new BadRequestException('This cash session is not in the transaction currency');
    }
    if (locked.status !== CashSessionStatus.OPEN) {
      throw new ConflictException({ code: 'CASH_SESSION_NOT_OPEN', message: 'This cash session is not open.' });
    }
    const isOwnSession = locked.openedByMembershipId === tenant.membershipId;
    const canOverride = tenant.permissionCodes.has(RECONCILE_PERMISSION);
    if (!isOwnSession && !canOverride) {
      throw new ForbiddenException('You can only record a cash refund into a session you opened');
    }

    await tx.cashLedgerEntry.create({
      data: {
        organizationId: tenant.organizationId,
        branchId: params.branchId,
        registerId: locked.registerId,
        cashSessionId,
        currency: params.currency,
        type: CashLedgerEntryType.REFUND_PAID,
        amountMinor: params.amountMinor,
        correctiveTransactionId: params.correctiveTransactionId,
        actorMembershipId: tenant.membershipId,
      },
    });
  }

  async resolveCashPolicyMode(organizationId: string, branchId: string): Promise<CashPolicyMode> {
    return this.cashPolicyService.resolveMode(organizationId, branchId);
  }

  private assertCanOperate(tenant: TenantContext, session: Pick<CashSession, 'openedByMembershipId'>): void {
    const isOwnSession = session.openedByMembershipId === tenant.membershipId;
    const canOverride = tenant.permissionCodes.has(RECONCILE_PERMISSION);
    if (!isOwnSession && !canOverride) {
      throw new ForbiddenException('You can only operate a cash session you opened');
    }
  }

  private async loadOwnedSession(tenant: TenantContext, cashSessionId: string): Promise<CashSessionWithReview> {
    const session = await this.prisma.cashSession.findFirst({
      where: { id: cashSessionId, organizationId: tenant.organizationId },
      include: cashSessionViewInclude,
    });
    if (!session) {
      throw new NotFoundException('Cash session not found');
    }
    assertMembershipHasBranchAccess(tenant, session.branchId);
    return session;
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
