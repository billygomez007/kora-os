import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PaginatedPayload } from '../../common/http/api-response.interceptor.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  APPOINTMENT_VIEW_INCLUDE,
  toAppointmentView,
  toBusinessAppointmentView,
  type AppointmentView,
  type BusinessAppointmentView,
} from './appointment-view.js';

const DEFAULT_PAGE_SIZE = 20;
/** A branch-appointments listing must specify a bounded window — never
 * an unbounded scan (docs task Phase 20: "bounded date range"). */
const MAX_LIST_RANGE_DAYS = 92;

@Injectable()
export class AppointmentQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveStaffProfileForMembership(
    organizationId: string,
    membershipId: string,
  ): Promise<{ id: string }> {
    const staffProfile = await this.prisma.staffProfile.findFirst({
      where: {
        organizationId,
        membershipId,
      },
      select: {
        id: true,
      },
    });

    if (!staffProfile) {
      throw new NotFoundException(
        'Staff profile not found for this membership',
      );
    }

    return staffProfile;
  }

  async listForCustomer(
    customerProfileId: string,
    options: { cursor?: string; limit?: number },
  ): Promise<PaginatedPayload<AppointmentView>> {
    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const cursorId = decodeCursor(options.cursor);

    const rows = await this.prisma.appointment.findMany({
      where: { customerProfileId, ...(cursorId ? { id: { gt: cursorId } } : {}) },
      include: APPOINTMENT_VIEW_INCLUDE,
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      data: page.map(toAppointmentView),
      page: { hasMore, nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null },
    };
  }

  async getForCustomer(customerProfileId: string, appointmentId: string): Promise<AppointmentView> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: APPOINTMENT_VIEW_INCLUDE,
    });
    // A different customer's appointment is a 404, not a 403 — its
    // existence is never confirmed to a caller who does not own it
    // (docs task Phase 20: "Customers must never see or modify another
    // customer's appointment").
    if (!appointment || appointment.customerProfileId !== customerProfileId) {
      throw new NotFoundException('Appointment not found');
    }
    return toAppointmentView(appointment);
  }

  async listForOrganizationBranch(
    organizationId: string,
    branchId: string,
    options: {
      from: string;
      to: string;
      cursor?: string;
      limit?: number;
      assignedStaffProfileId?: string;
    },
  ): Promise<PaginatedPayload<BusinessAppointmentView>> {
    const from = new Date(options.from);
    const to = new Date(options.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new BadRequestException('from and to must be a valid ISO 8601 range with from <= to');
    }
    const rangeDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    if (rangeDays > MAX_LIST_RANGE_DAYS) {
      throw new BadRequestException(`Date range must not exceed ${MAX_LIST_RANGE_DAYS} days`);
    }

    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const cursorId = decodeCursor(options.cursor);

    const rows = await this.prisma.appointment.findMany({
      where: {
        organizationId,
        branchId,
        ...(options.assignedStaffProfileId
          ? { assignedStaffProfileId: options.assignedStaffProfileId }
          : {}),
        startAt: { gte: from, lte: to },
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      include: APPOINTMENT_VIEW_INCLUDE,
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      data: page.map(toBusinessAppointmentView),
      page: { hasMore, nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null },
    };
  }

  async getForOrganization(
    organizationId: string,
    branchId: string,
    appointmentId: string,
    assignedStaffProfileId?: string,
  ): Promise<BusinessAppointmentView> {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        organizationId,
        branchId,
        ...(assignedStaffProfileId
          ? { assignedStaffProfileId }
          : {}),
      },
      include: APPOINTMENT_VIEW_INCLUDE,
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return toBusinessAppointmentView(appointment);
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
