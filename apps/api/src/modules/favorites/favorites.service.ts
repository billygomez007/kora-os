import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { BusinessProfileVisibility } from '../../generated/prisma/client.js';
import { CustomerProfileService } from '../customer-profile/customer-profile.service.js';
import { toSummary, type DiscoveryBusinessSummary } from '../discovery/discovery.service.js';

/**
 * A customer's saved businesses (docs task Phase 8) — favoriting is
 * per-organization, never per-branch or per-service, matching the
 * `CustomerFavorite` model's own `(customerProfileId, organizationId)`
 * uniqueness. Every method resolves the caller's own CustomerProfile
 * fresh via `CustomerProfileService.getOrCreateId`, the same pattern
 * `AppointmentsController` already establishes — a client-supplied
 * customer id is never accepted.
 */
@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerProfileService: CustomerProfileService,
  ) {}

  /**
   * Re-checks visibility on every read, not only at add time — a
   * business that has since been unpublished or turned PRIVATE simply
   * disappears from this list, the same "never confirm what a caller
   * cannot see" rule discovery itself applies (docs/SECURITY.md section
   * 29), without ever needing a cleanup job to remove the stale
   * CustomerFavorite row.
   */
  async list(userId: string): Promise<DiscoveryBusinessSummary[]> {
    const customerProfileId = await this.customerProfileService.getOrCreateId(userId);
    const favorites = await this.prisma.customerFavorite.findMany({
      where: { customerProfileId },
      orderBy: { createdAt: 'desc' },
      include: {
        organization: {
          include: {
            publicProfile: true,
            categoryAssignments: { include: { category: true } },
          },
        },
      },
    });

    return favorites
      .filter(
        (favorite) =>
          favorite.organization.publicProfile &&
          favorite.organization.publicProfile.visibility !== BusinessProfileVisibility.PRIVATE &&
          favorite.organization.publicProfile.publishedAt,
      )
      .map((favorite) =>
        toSummary({
          ...favorite.organization.publicProfile!,
          organization: favorite.organization,
        }),
      );
  }

  /** Idempotent: favoriting an already-favorited business is a no-op
   * success, never a conflict. Rejects (404, never confirming which
   * reason) a business that is not currently PUBLIC/LINK_ONLY and
   * published — the same visibility a customer could reach via
   * discovery in the first place, so a favorite can never reference
   * something the customer was never allowed to see. */
  async add(userId: string, organizationId: string): Promise<void> {
    const customerProfileId = await this.customerProfileService.getOrCreateId(userId);

    const profile = await this.prisma.publicBusinessProfile.findUnique({
      where: { organizationId },
      select: { visibility: true, publishedAt: true },
    });
    if (!profile || profile.visibility === BusinessProfileVisibility.PRIVATE || !profile.publishedAt) {
      throw new NotFoundException('Business not found');
    }

    await this.prisma.customerFavorite.upsert({
      where: { customerProfileId_organizationId: { customerProfileId, organizationId } },
      update: {},
      create: { customerProfileId, organizationId },
    });
  }

  /** Idempotent: removing a favorite that does not exist is a no-op
   * success, never a 404 — matching the general "delete is idempotent"
   * convention the rest of this API follows for user-owned toggles. */
  async remove(userId: string, organizationId: string): Promise<void> {
    const customerProfileId = await this.customerProfileService.getOrCreateId(userId);
    await this.prisma.customerFavorite.deleteMany({ where: { customerProfileId, organizationId } });
  }
}
