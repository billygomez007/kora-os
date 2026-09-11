import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaginatedPayload } from '../../common/http/api-response.interceptor.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  BusinessProfileVisibility,
  BusinessVerificationStatus,
} from '../../generated/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { SearchBusinessesDto } from './dto/search-businesses.dto.js';

const DEFAULT_PAGE_SIZE = 20;

export interface DiscoveryBusinessSummary {
  organizationId: string;
  slug: string;
  displayName: string;
  description: string | null;
  logoImageUrl: string | null;
  coverImageUrl: string | null;
  verificationStatus: BusinessVerificationStatus;
  categories: string[];
}

export interface DiscoveryProductVariantSummary {
  variantId: string;
  name: string;
  sellingPriceMinor: number;
}

export interface DiscoveryProductBranchAvailability {
  branchId: string;
  branchName: string;
  variants: Array<{
    variantId: string;
    available: boolean;
  }>;
}

export interface DiscoveryProductSummary {
  productId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  currency: string;
  trackInventory: boolean;
  category: {
    id: string;
    name: string;
  } | null;
  variants: DiscoveryProductVariantSummary[];
  branchAvailability: DiscoveryProductBranchAvailability[];
}

export interface DiscoveryBranchSummary {
  branchId: string;
  name: string;
  city: string | null;
  region: string | null;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
  publicPhone: string | null;
  publicEmail: string | null;
  openingHoursNote: string | null;
}

/**
 * Every method here reads only what is safe for an anonymous visitor:
 * PUBLIC/LINK_ONLY published profiles, and only their curated public
 * fields. Subscription, staff, audit, and CustomerRecord data are never
 * reachable through this service — see the module header comment in
 * prisma/schema.prisma's discovery section.
 */
@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: SearchBusinessesDto,
  ): Promise<PaginatedPayload<DiscoveryBusinessSummary>> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const cursorId = decodeCursor(query.cursor);

    const where: Prisma.PublicBusinessProfileWhereInput = {
      visibility: BusinessProfileVisibility.PUBLIC,
      publishedAt: { not: null },
      ...(cursorId ? { id: { gt: cursorId } } : {}),
    };

    if (query.text) {
      where.OR = [
        { displayName: { contains: query.text, mode: 'insensitive' } },
        { searchKeywords: { contains: query.text, mode: 'insensitive' } },
      ];
    }
    if (query.verificationStatus) {
      where.verificationStatus = query.verificationStatus;
    }

    const organizationFilter = buildOrganizationFilter(query);
    if (organizationFilter) {
      where.organization = organizationFilter;
    }

    // Fetch one extra row to know whether another page follows, without a
    // separate count query.
    const profiles = await this.prisma.publicBusinessProfile.findMany({
      where,
      orderBy: { id: 'asc' },
      take: limit + 1,
      include: {
        organization: {
          include: { categoryAssignments: { include: { category: true } } },
        },
      },
    });

    const hasMore = profiles.length > limit;
    const page = profiles.slice(0, limit);

    return {
      data: page.map(toSummary),
      page: {
        hasMore,
        nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null,
      },
    };
  }

  async getBySlug(slug: string): Promise<DiscoveryBusinessSummary> {
    const profile = await this.prisma.publicBusinessProfile.findUnique({
      where: { slug },
      include: {
        organization: {
          include: { categoryAssignments: { include: { category: true } } },
        },
      },
    });
    if (
      !profile ||
      profile.visibility === BusinessProfileVisibility.PRIVATE ||
      !profile.publishedAt
    ) {
      // LINK_ONLY is intentionally still resolvable here — only exact-slug
      // access is exempt from the PUBLIC-only rule that `search` enforces.
      throw new NotFoundException('Business not found');
    }
    return toSummary(profile);
  }

  async getBranches(slug: string): Promise<DiscoveryBranchSummary[]> {
    const profile = await this.prisma.publicBusinessProfile.findUnique({
      where: { slug },
      select: { organizationId: true, visibility: true, publishedAt: true },
    });
    if (
      !profile ||
      profile.visibility === BusinessProfileVisibility.PRIVATE ||
      !profile.publishedAt
    ) {
      throw new NotFoundException('Business not found');
    }

    const branches = await this.prisma.branch.findMany({
      where: { organizationId: profile.organizationId, isDiscoverable: true },
      orderBy: { name: 'asc' },
    });

    return branches.map((branch) => ({
      branchId: branch.id,
      name: branch.name,
      city: branch.city,
      region: branch.region,
      countryCode: branch.countryCode,
      latitude: branch.latitude ? Number(branch.latitude) : null,
      longitude: branch.longitude ? Number(branch.longitude) : null,
      publicPhone: branch.publicPhone,
      publicEmail: branch.publicEmail,
      openingHoursNote: branch.openingHoursNote,
    }));
  }

  /**
   * The same PUBLIC/LINK_ONLY-published visibility check `getBySlug` and
   * `getBranches` already apply, exposed for other modules (the
   * availability engine's public endpoints — docs task Phase 15 steps
   * 1-2: "Resolve the business through its published discovery profile
   * ... Verify the profile visibility allows direct access") that need
   * the underlying organizationId rather than the public-shaped summary
   * DTO those two methods return.
   */
  async resolveAccessibleOrganizationBySlug(
    slug: string,
  ): Promise<{ organizationId: string }> {
    const profile = await this.prisma.publicBusinessProfile.findUnique({
      where: { slug },
      select: { organizationId: true, visibility: true, publishedAt: true },
    });
    if (
      !profile ||
      profile.visibility === BusinessProfileVisibility.PRIVATE ||
      !profile.publishedAt
    ) {
      throw new NotFoundException('Business not found');
    }
    return { organizationId: profile.organizationId };
  }

  async listProductsByBusinessSlug(
    slug: string,
  ): Promise<DiscoveryProductSummary[]> {
    const { organizationId } =
      await this.resolveAccessibleOrganizationBySlug(slug);

    const branches = await this.prisma.branch.findMany({
      where: {
        organizationId,
        isDiscoverable: true,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });

    const branchIds = branches.map((branch) => branch.id);

    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        archivedAt: null,
        isVisibleOnMarketplace: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
        currency: true,
        trackInventory: true,
        productCategory: {
          select: {
            id: true,
            name: true,
          },
        },
        variants: {
          where: { archivedAt: null },
          select: {
            id: true,
            name: true,
            sellingPriceMinor: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        branchInventory: {
          where: {
            branchId: { in: branchIds },
          },
          select: {
            branchId: true,
            productVariantId: true,
            quantityOnHand: true,
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return products
      .filter((product) => product.variants.length > 0)
      .map((product) => {
        const inventoryByBranchVariant = new Map(
          product.branchInventory.map((row) => [
            `${row.branchId}:${row.productVariantId}`,
            row.quantityOnHand,
          ]),
        );

        return {
          productId: product.id,
          name: product.name,
          description: product.description,
          imageUrl: product.imageUrl,
          currency: product.currency,
          trackInventory: product.trackInventory,
          category: product.productCategory,
          variants: product.variants.map((variant) => ({
            variantId: variant.id,
            name: variant.name,
            sellingPriceMinor: variant.sellingPriceMinor,
          })),
          branchAvailability: branches.map((branch) => ({
            branchId: branch.id,
            branchName: branch.name,
            variants: product.variants.map((variant) => {
              const quantity = inventoryByBranchVariant.get(
                `${branch.id}:${variant.id}`,
              );

              return {
                variantId: variant.id,
                available: product.trackInventory ? (quantity ?? 0) > 0 : true,
              };
            }),
          })),
        };
      });
  }

  async getProductByBusinessSlug(
    slug: string,
    productId: string,
  ): Promise<DiscoveryProductSummary> {
    const products = await this.listProductsByBusinessSlug(slug);
    const product = products.find(
      (candidate) => candidate.productId === productId,
    );

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async listCategories() {
    const categories = await this.prisma.businessCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });
    return categories.map((category) => ({
      code: category.code,
      name: category.name,
    }));
  }
}

function buildOrganizationFilter(
  query: SearchBusinessesDto,
): Prisma.OrganizationWhereInput | undefined {
  const branchWhere: Prisma.BranchWhereInput = { isDiscoverable: true };
  let hasBranchFilter = false;

  if (query.city) {
    branchWhere.city = { equals: query.city, mode: 'insensitive' };
    hasBranchFilter = true;
  }
  if (query.region) {
    branchWhere.region = { equals: query.region, mode: 'insensitive' };
    hasBranchFilter = true;
  }
  if (query.country) {
    branchWhere.countryCode = query.country.toUpperCase();
    hasBranchFilter = true;
  }
  if (query.nearLat !== undefined && query.nearLng !== undefined) {
    // A deliberately approximate bounding box, not a distance calculation
    // or a distance-ranked sort (docs task Phase 9: "without pretending to
    // provide exact geospatial ranking" — this is a filter only, and the
    // API never returns a "distance" field).
    const radiusKm = query.radiusKm ?? 25;
    const latDeltaDegrees = radiusKm / 111;
    const lngDeltaDegrees =
      radiusKm / (111 * Math.cos((query.nearLat * Math.PI) / 180) || 1);
    branchWhere.latitude = {
      gte: query.nearLat - latDeltaDegrees,
      lte: query.nearLat + latDeltaDegrees,
    };
    branchWhere.longitude = {
      gte: query.nearLng - lngDeltaDegrees,
      lte: query.nearLng + lngDeltaDegrees,
    };
    hasBranchFilter = true;
  }

  const filters: Prisma.OrganizationWhereInput[] = [];
  if (hasBranchFilter) {
    filters.push({ branches: { some: branchWhere } });
  }
  if (query.category) {
    filters.push({
      categoryAssignments: { some: { category: { code: query.category } } },
    });
  }

  if (filters.length === 0) {
    return undefined;
  }
  return filters.length === 1 ? filters[0] : { AND: filters };
}

export function toSummary(profile: {
  organizationId: string;
  slug: string;
  displayName: string;
  description: string | null;
  logoImageUrl: string | null;
  coverImageUrl: string | null;
  verificationStatus: BusinessVerificationStatus;
  organization: { categoryAssignments: Array<{ category: { name: string } }> };
}): DiscoveryBusinessSummary {
  return {
    organizationId: profile.organizationId,
    slug: profile.slug,
    displayName: profile.displayName,
    description: profile.description,
    logoImageUrl: profile.logoImageUrl,
    coverImageUrl: profile.coverImageUrl,
    verificationStatus: profile.verificationStatus,
    categories: profile.organization.categoryAssignments.map(
      (a) => a.category.name,
    ),
  };
}

/** Opaque per docs/API_SPEC.md section 7 — a plain base64 id, not a
 * meaningful offset a client should construct itself. */
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
