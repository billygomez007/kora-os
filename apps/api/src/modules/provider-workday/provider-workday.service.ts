import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class ProviderWorkdayService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkday(params: {
    organizationId: string;
    membershipId: string;
    date?: string;
  }) {
    const staffProfile = await this.prisma.staffProfile.findFirst({
      where: {
        organizationId: params.organizationId,
        membershipId: params.membershipId,
      },
      select: {
        id: true,
        membership: {
          select: {
            user: {
              select: {
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (!staffProfile) {
      throw new NotFoundException('Staff profile not found for this membership');
    }

    const selectedDate =
      params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
        ? params.date
        : new Date().toISOString().slice(0, 10);

    const from = new Date(`${selectedDate}T00:00:00.000Z`);
    const to = new Date(`${selectedDate}T23:59:59.999Z`);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        organizationId: params.organizationId,
        assignedStaffProfileId: staffProfile.id,
        startAt: {
          gte: from,
          lte: to,
        },
      },
      include: {
        items: true,
        customerRecord: {
          select: {
            id: true,
            name: true,
            phoneE164: true,
          },
        },
      },
      orderBy: {
        startAt: 'asc',
      },
    });

    const queueEntries = await this.prisma.queueEntry.findMany({
      where: {
        organizationId: params.organizationId,
        assignedStaffProfileId: staffProfile.id,
        createdAt: {
          gte: from,
          lte: to,
        },
      },
      include: {
        customerRecord: {
          select: {
            id: true,
            name: true,
            phoneE164: true,
          },
        },
        services: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const serviceSessions = await this.prisma.serviceSession.findMany({
      where: {
        organizationId: params.organizationId,
        assignedStaffProfileId: staffProfile.id,
        OR: [
          {
            startedAt: {
              gte: from,
              lte: to,
            },
          },
          {
            completedAt: {
              gte: from,
              lte: to,
            },
          },
        ],
      },
      orderBy: {
        startedAt: 'asc',
      },
    });

    return {
      date: selectedDate,
      provider: {
        staffProfileId: staffProfile.id,
        displayName: staffProfile.membership.user.displayName,
      },
      summary: {
        appointments: appointments.length,
        queueEntries: queueEntries.length,
        serviceSessions: serviceSessions.length,
      },
      appointments: appointments.map((appointment) => ({
        id: appointment.id,
        reference: appointment.reference,
        branchId: appointment.branchId,
        status: appointment.status,
        startAt: appointment.startAt.toISOString(),
        endAt: appointment.endAt.toISOString(),
        currency: appointment.currency,
        totalPriceMinor: appointment.totalPriceMinor,
        customer: {
          id: appointment.customerRecord.id,
          name: appointment.customerRecord.name,
          phoneE164: appointment.customerRecord.phoneE164,
        },
        services: appointment.items
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((item) => ({
            serviceId: item.serviceId,
            name: item.serviceNameSnapshot,
            durationMinutes: item.durationMinutesSnapshot,
            priceMinor: item.priceMinorSnapshot,
            currency: item.currencySnapshot,
          })),
      })),
      queue: queueEntries,
      serviceSessions,
    };
  }
}
