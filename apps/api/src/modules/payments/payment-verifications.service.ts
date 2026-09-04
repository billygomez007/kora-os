import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { PrismaService } from '../../database/prisma.service.js';
import { PaymentDisputeStatus, PaymentRecordStatus, PaymentVerificationAction } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { CheckoutSettlementService } from './checkout-settlement.service.js';
import type { ConfirmPaymentDto } from './dto/confirm-payment.dto.js';
import type { DisputePaymentDto } from './dto/dispute-payment.dto.js';
import { assertConfirmAuthorized } from './payment-confirmation-authorization.util.js';
import { toPaymentRecordView, type PaymentRecordView } from './payment-record-view.js';
import { PaymentsService } from './payments.service.js';

const VERIFY_OWN_PERMISSION = 'payments.verify_own';
const RESOLVE_PERMISSION = 'payments.resolve';

/**
 * Phase 3 of the financial-integrity stage: the assigned provider's
 * confirm/dispute step every recorded PaymentRecord must pass before it
 * can ever contribute toward a posted Transaction (docs/SECURITY.md
 * financial section — separation of duties). Dispute *resolution*
 * (owner/manager) lives in PaymentDisputesService; this service owns
 * only the provider-facing confirm/dispute actions and the provider's
 * own pending-verification queue.
 */
@Injectable()
export class PaymentVerificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly checkoutSettlement: CheckoutSettlementService,
    private readonly paymentsService: PaymentsService,
  ) {}

  /** Never every branch payment — only records this specific provider
   * must act on (docs task Phase 3: "never expose every branch payment
   * to ordinary service providers"). A membership with no StaffProfile
   * at all (e.g. a pure manager) simply has nothing pending here. */
  async listPendingForProvider(tenant: TenantContext): Promise<PaymentRecordView[]> {
    const ownStaffProfileId = await this.resolveOwnStaffProfileId(tenant.organizationId, tenant.membershipId);
    if (!ownStaffProfileId) {
      return [];
    }
    const payments = await this.prisma.paymentRecord.findMany({
      where: {
        organizationId: tenant.organizationId,
        confirmationRequiredByStaffProfileId: ownStaffProfileId,
        status: PaymentRecordStatus.RECORDED,
      },
      orderBy: { recordedAt: 'asc' },
    });
    return payments.map(toPaymentRecordView);
  }

  async confirm(
    tenant: TenantContext,
    paymentId: string,
    dto: ConfirmPaymentDto,
    requestId: string,
  ): Promise<PaymentRecordView> {
    const payment = await this.paymentsService.loadOwnedPayment(tenant, paymentId);

    const hasVerifyOwn = tenant.permissionCodes.has(VERIFY_OWN_PERMISSION);
    const hasResolve = tenant.permissionCodes.has(RESOLVE_PERMISSION);
    const ownStaffProfileId = await this.resolveOwnStaffProfileId(tenant.organizationId, tenant.membershipId);
    const authorization = assertConfirmAuthorized({
      hasVerifyOwn,
      hasResolve,
      isAssignedProvider: ownStaffProfileId !== null && ownStaffProfileId === payment.confirmationRequiredByStaffProfileId,
      isSelfRecorded: payment.recordedByMembershipId === tenant.membershipId,
      overrideReason: dto.reason,
    });

    if (payment.status !== PaymentRecordStatus.RECORDED) {
      throw new ConflictException({
        code: 'PAYMENT_STATE_INVALID',
        message: 'This payment is no longer awaiting confirmation.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const lockedCheckout = await this.checkoutSettlement.lockCheckout(tx, payment.checkoutId);
      const fresh = await tx.paymentRecord.findUniqueOrThrow({ where: { id: paymentId } });
      if (fresh.status !== PaymentRecordStatus.RECORDED) {
        throw new ConflictException({
          code: 'PAYMENT_STATE_INVALID',
          message: 'This payment is no longer awaiting confirmation.',
        });
      }

      const result = await tx.paymentRecord.updateMany({
        where: { id: paymentId, version: fresh.version },
        data: {
          status: PaymentRecordStatus.CONFIRMED,
          confirmedByMembershipId: tenant.membershipId,
          confirmedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new ConflictException('This payment was already updated by someone else');
      }

      await tx.paymentVerificationEvent.create({
        data: {
          organizationId: tenant.organizationId,
          paymentRecordId: paymentId,
          action: PaymentVerificationAction.CONFIRMED,
          previousStatus: PaymentRecordStatus.RECORDED,
          newStatus: PaymentRecordStatus.CONFIRMED,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          reason: authorization.isManagementOverride ? dto.reason : undefined,
        },
      });

      await this.auditService.record(
        {
          organizationId: tenant.organizationId,
          branchId: payment.branchId,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          action: 'payment.confirmed',
          entityType: 'payment_record',
          entityId: paymentId,
          requestId,
          source: 'payments',
          previousState: { status: PaymentRecordStatus.RECORDED },
          newState: { status: PaymentRecordStatus.CONFIRMED },
        },
        tx,
      );
      if (authorization.isManagementOverride) {
        await this.auditService.record(
          {
            organizationId: tenant.organizationId,
            branchId: payment.branchId,
            actorUserId: tenant.userId,
            actorMembershipId: tenant.membershipId,
            action: 'payment.management_override',
            entityType: 'payment_record',
            entityId: paymentId,
            requestId,
            source: 'payments',
            metadata: { reason: dto.reason },
          },
          tx,
        );
      }

      await this.checkoutSettlement.recalculate(tx, lockedCheckout, {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        membershipId: tenant.membershipId,
        requestId,
      });

      return tx.paymentRecord.findUniqueOrThrow({ where: { id: paymentId } });
    });

    return toPaymentRecordView(updated);
  }

  async dispute(
    tenant: TenantContext,
    paymentId: string,
    dto: DisputePaymentDto,
    requestId: string,
  ): Promise<PaymentRecordView> {
    const payment = await this.paymentsService.loadOwnedPayment(tenant, paymentId);

    const ownStaffProfileId = await this.resolveOwnStaffProfileId(tenant.organizationId, tenant.membershipId);
    if (!tenant.permissionCodes.has(VERIFY_OWN_PERMISSION) || ownStaffProfileId !== payment.confirmationRequiredByStaffProfileId) {
      throw new ForbiddenException({
        code: 'PAYMENT_CONFIRMATION_FORBIDDEN',
        message: 'You can only dispute your own assigned payments',
      });
    }
    if (payment.status !== PaymentRecordStatus.RECORDED) {
      throw new ConflictException({
        code: 'PAYMENT_STATE_INVALID',
        message: 'This payment is no longer awaiting confirmation.',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const lockedCheckout = await this.checkoutSettlement.lockCheckout(tx, payment.checkoutId);
      const fresh = await tx.paymentRecord.findUniqueOrThrow({ where: { id: paymentId } });
      if (fresh.status !== PaymentRecordStatus.RECORDED) {
        throw new ConflictException({
          code: 'PAYMENT_STATE_INVALID',
          message: 'This payment is no longer awaiting confirmation.',
        });
      }

      const result = await tx.paymentRecord.updateMany({
        where: { id: paymentId, version: fresh.version },
        data: { status: PaymentRecordStatus.DISPUTED, disputedAt: new Date(), version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw new ConflictException('This payment was already updated by someone else');
      }

      await tx.paymentDispute.create({
        data: {
          organizationId: tenant.organizationId,
          paymentRecordId: paymentId,
          status: PaymentDisputeStatus.OPEN,
          reason: dto.reason,
          openedByMembershipId: tenant.membershipId,
        },
      });

      await tx.paymentVerificationEvent.create({
        data: {
          organizationId: tenant.organizationId,
          paymentRecordId: paymentId,
          action: PaymentVerificationAction.DISPUTED,
          previousStatus: PaymentRecordStatus.RECORDED,
          newStatus: PaymentRecordStatus.DISPUTED,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          reason: dto.reason,
        },
      });

      await this.auditService.record(
        {
          organizationId: tenant.organizationId,
          branchId: payment.branchId,
          actorUserId: tenant.userId,
          actorMembershipId: tenant.membershipId,
          action: 'payment.disputed',
          entityType: 'payment_record',
          entityId: paymentId,
          requestId,
          source: 'payments',
          previousState: { status: PaymentRecordStatus.RECORDED },
          newState: { status: PaymentRecordStatus.DISPUTED, reason: dto.reason },
        },
        tx,
      );

      await this.checkoutSettlement.recalculate(tx, lockedCheckout, {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        membershipId: tenant.membershipId,
        requestId,
      });

      return tx.paymentRecord.findUniqueOrThrow({ where: { id: paymentId } });
    });

    return toPaymentRecordView(updated);
  }

  private async resolveOwnStaffProfileId(organizationId: string, membershipId: string): Promise<string | null> {
    const profile = await this.prisma.staffProfile.findUnique({
      where: { organizationId_membershipId: { organizationId, membershipId } },
    });
    return profile?.id ?? null;
  }
}
