import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto.js';

export interface CustomerProfileView {
  id: string;
  displayName: string;
  email: string | null;
  phoneE164: string | null;
  city: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  locationConsentedAt: Date | null;
}

/**
 * The customer-workspace self-service boundary (docs task Phase 16). The
 * authenticated identity (email, verified status) always comes from the
 * Kora session — `JwtAuthGuard`/`CurrentUser` — never from anything in
 * the request body, matching the same rule the rest of the API already
 * follows for organization/customer identity.
 */
@Injectable()
export class CustomerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the CustomerProfile row on first access — a Kora user may
   * exist for a long time in only the business workspace before ever
   * touching the customer workspace. */
  /** Just the id — for callers (e.g. AppointmentsController) that need
   * to resolve/create the customer workspace without building the full
   * view. */
  async getOrCreateId(userId: string): Promise<string> {
    const profile = await this.prisma.customerProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
      select: { id: true },
    });
    return profile.id;
  }

  async getOrCreate(userId: string): Promise<CustomerProfileView> {
    const profile = await this.prisma.customerProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
      include: { user: true },
    });
    return toView(profile);
  }

  async update(userId: string, dto: UpdateCustomerProfileDto): Promise<CustomerProfileView> {
    const hasLatitude = dto.latitude !== undefined;
    const hasLongitude = dto.longitude !== undefined;
    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException('latitude and longitude must be provided together');
    }

    const existing = await this.prisma.customerProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    if (dto.displayName !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { displayName: dto.displayName },
      });
    }

    const locationProvided = hasLatitude && hasLongitude;
    const updated = await this.prisma.customerProfile.update({
      where: { id: existing.id },
      data: {
        phoneE164: dto.phoneE164,
        city: dto.city,
        area: dto.area,
        latitude: dto.latitude,
        longitude: dto.longitude,
        // Set only the moment location is newly (or again) provided —
        // never client-supplied (docs task Phase 16: "Relevant consent
        // timestamps where location is stored").
        locationConsentedAt: locationProvided ? new Date() : undefined,
      },
      include: { user: true },
    });

    return toView(updated);
  }
}

function toView(profile: {
  id: string;
  phoneE164: string | null;
  city: string | null;
  area: string | null;
  latitude: unknown;
  longitude: unknown;
  locationConsentedAt: Date | null;
  user: { displayName: string; emailNormalized: string | null };
}): CustomerProfileView {
  return {
    id: profile.id,
    displayName: profile.user.displayName,
    email: profile.user.emailNormalized,
    phoneE164: profile.phoneE164,
    city: profile.city,
    area: profile.area,
    latitude: profile.latitude !== null ? Number(profile.latitude) : null,
    longitude: profile.longitude !== null ? Number(profile.longitude) : null,
    locationConsentedAt: profile.locationConsentedAt,
  };
}
