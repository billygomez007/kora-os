import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BusinessProfileVisibility,
  QrCodeType,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { CreateQrCodeDto } from './dto/create-qr-code.dto.js';

export interface PublicQrResolution {
  code: string;
  type: QrCodeType;
  organizationId: string;
  businessName: string;
  storefrontSlug: string;
  branchId: string | null;
  branchName: string | null;
  label: string | null;
  resourceKey: string | null;
  destination: string;
}

@Injectable()
export class QrService {
  constructor(private readonly prisma: PrismaService) {}

  async listForOrganization(organizationId: string) {
    const qrCodes = await this.prisma.businessQrCode.findMany({
      where: {
        organizationId,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        {
          type: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });

    return qrCodes.map((qr) => this.toMerchantView(qr));
  }

  async createForOrganization(
    actor: {
      organizationId: string;
      actorUserId: string;
      actorMembershipId: string;
      requestId: string;
    },
    dto: CreateQrCodeDto,
  ) {
    if (dto.type === QrCodeType.BUSINESS) {
      throw new BadRequestException(
        'The permanent Business QR is created automatically.',
      );
    }

    const branchRequiredTypes = new Set<QrCodeType>([
      QrCodeType.BRANCH,
      QrCodeType.TABLE,
      QrCodeType.COUNTER,
      QrCodeType.ROOM,
    ]);

    if (branchRequiredTypes.has(dto.type) && !dto.branchId) {
      throw new BadRequestException(
        `${dto.type} QR codes require a branch.`,
      );
    }

    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: dto.branchId,
          organizationId: actor.organizationId,
        },
        select: {
          id: true,
        },
      });

      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
    }

    const label = dto.label.trim();

    if (!label) {
      throw new BadRequestException('QR label is required');
    }

    const resourceKey = dto.resourceKey?.trim() || null;

    const created = await this.prisma.businessQrCode.create({
      data: {
        organizationId: actor.organizationId,
        branchId: dto.branchId ?? null,
        code: `kora_${randomUUID().replaceAll('-', '')}`,
        type: dto.type,
        label,
        resourceKey,
        isActive: true,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return this.toMerchantView(created);
  }

  async updateStatus(
    organizationId: string,
    qrCodeId: string,
    isActive: boolean,
  ) {
    const qr = await this.prisma.businessQrCode.findFirst({
      where: {
        id: qrCodeId,
        organizationId,
      },
      select: {
        id: true,
        type: true,
      },
    });

    if (!qr) {
      throw new NotFoundException('QR code not found');
    }

    if (qr.type === QrCodeType.BUSINESS && !isActive) {
      throw new BadRequestException(
        'The permanent Business QR cannot be deactivated.',
      );
    }

    const updated = await this.prisma.businessQrCode.update({
      where: {
        id: qr.id,
      },
      data: {
        isActive,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return this.toMerchantView(updated);
  }

  async getForOrganization(organizationId: string, qrCodeId: string) {
    const qr = await this.prisma.businessQrCode.findFirst({
      where: {
        id: qrCodeId,
        organizationId,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!qr) {
      throw new NotFoundException('QR code not found');
    }

    return this.toMerchantView(qr);
  }

  async getBusinessQr(organizationId: string) {
    const qr = await this.prisma.businessQrCode.findFirst({
      where: {
        organizationId,
        type: QrCodeType.BUSINESS,
        branchId: null,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!qr) {
      throw new NotFoundException('Business QR code not found');
    }

    return this.toMerchantView(qr);
  }

  async getOrCreateBusinessQr(organizationId: string) {
    try {
      return await this.getBusinessQr(organizationId);
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
    }

    return this.createBusinessQr(organizationId);
  }

  async ensureBusinessQr(actor: {
    organizationId: string;
    actorUserId: string;
    actorMembershipId: string;
    requestId: string;
  }) {
    return this.getOrCreateBusinessQr(actor.organizationId);
  }

  private async createBusinessQr(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: {
        id: organizationId,
      },
      select: {
        id: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const existing = await this.prisma.businessQrCode.findFirst({
      where: {
        organizationId,
        type: QrCodeType.BUSINESS,
        branchId: null,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (existing) {
      return this.toMerchantView(existing);
    }

    const created = await this.prisma.businessQrCode.create({
      data: {
        organizationId,
        branchId: null,
        code: `kora_${randomUUID().replaceAll('-', '')}`,
        type: QrCodeType.BUSINESS,
        label: 'Business storefront',
        isActive: true,
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return this.toMerchantView(created);
  }

  private toMerchantView(qr: {
    id: string;
    code: string;
    type: QrCodeType;
    branchId: string | null;
    label: string | null;
    resourceKey: string | null;
    isActive: boolean;
    scanCount: bigint;
    lastScannedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    branch: {
      id: string;
      name: string;
    } | null;
  }) {
    return {
      id: qr.id,
      code: qr.code,
      type: qr.type,
      branchId: qr.branchId,
      branchName: qr.branch?.name ?? null,
      label: qr.label,
      resourceKey: qr.resourceKey,
      isActive: qr.isActive,
      scanCount: qr.scanCount.toString(),
      lastScannedAt: qr.lastScannedAt,
      createdAt: qr.createdAt,
      updatedAt: qr.updatedAt,
      publicPath: `/q/${encodeURIComponent(qr.code)}`,
    };
  }

  async resolvePublic(code: string): Promise<PublicQrResolution> {
    const normalizedCode = code.trim();

    if (!normalizedCode) {
      throw new NotFoundException('QR code not found');
    }

    const qr = await this.prisma.businessQrCode.findUnique({
      where: {
        code: normalizedCode,
      },
      select: {
        id: true,
        code: true,
        type: true,
        organizationId: true,
        branchId: true,
        label: true,
        resourceKey: true,
        isActive: true,
        organization: {
          select: {
            name: true,
            publicProfile: {
              select: {
                slug: true,
                visibility: true,
                publishedAt: true,
              },
            },
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            isDiscoverable: true,
          },
        },
      },
    });

    if (!qr || !qr.isActive) {
      throw new NotFoundException('QR code not found');
    }

    const profile = qr.organization.publicProfile;

    if (
      !profile ||
      profile.visibility === BusinessProfileVisibility.PRIVATE ||
      !profile.publishedAt
    ) {
      throw new NotFoundException('Business not found');
    }

    if (
      qr.branch &&
      qr.type !== QrCodeType.BUSINESS &&
      !qr.branch.isDiscoverable
    ) {
      throw new NotFoundException('Business location not found');
    }

    await this.prisma.businessQrCode.update({
      where: {
        id: qr.id,
      },
      data: {
        scanCount: {
          increment: 1,
        },
        lastScannedAt: new Date(),
      },
    });

    const params = new URLSearchParams();

    params.set('sourceQr', qr.code);

    if (qr.branchId) {
      params.set('branch', qr.branchId);
    }

    if (qr.type !== QrCodeType.BUSINESS) {
      params.set('qrType', qr.type.toLowerCase());
    }

    if (qr.resourceKey) {
      params.set('resource', qr.resourceKey);
    }

    const query = params.toString();

    return {
      code: qr.code,
      type: qr.type,
      organizationId: qr.organizationId,
      businessName: qr.organization.name,
      storefrontSlug: profile.slug,
      branchId: qr.branch?.id ?? null,
      branchName: qr.branch?.name ?? null,
      label: qr.label,
      resourceKey: qr.resourceKey,
      destination: `/marketplace/${profile.slug}${query ? `?${query}` : ''}`,
    };
  }
}
