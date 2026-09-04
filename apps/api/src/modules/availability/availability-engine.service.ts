import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  intersectLocalIntervals,
  mergeLocalIntervals,
  subtractLocalIntervals,
  type LocalTimeInterval,
} from '../../common/scheduling/interval-math.util.js';
import {
  addDaysToLocalDate,
  dayOfWeekForLocalDate,
  localToUtc,
  localTimeToMinutes,
  minutesToLocalTime,
} from '../../common/scheduling/local-time.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  AppointmentStatus,
  BranchScheduleExceptionType,
  MembershipStatus,
  StaffAvailabilityExceptionType,
  StaffEmploymentStatus,
} from '../../generated/prisma/client.js';
import { BranchScheduleService, type ResolvedBookingPolicy } from '../scheduling/branch-schedule.service.js';
import { MAX_AVAILABILITY_QUERY_DAYS } from '../scheduling/booking-policy.defaults.js';

export interface EffectiveServiceItem {
  serviceId: string;
  name: string;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  isBookableByCustomer: boolean;
}

export interface AvailabilitySlot {
  startAt: string;
  endAt: string;
  staffProfileId: string;
}

export interface DayAvailability {
  date: string;
  slots: AvailabilitySlot[];
}

export interface ComputeAvailabilityParams {
  organizationId: string;
  branchId: string;
  serviceIds: string[];
  staffProfileId?: string;
  fromLocalDate: string;
  toLocalDate: string;
}

export interface AvailabilityResult {
  branchTimeZone: string;
  currency: string;
  totalPriceMinor: number;
  items: EffectiveServiceItem[];
  eligibleProviderIds: string[];
  days: DayAvailability[];
}

/**
 * The deterministic server-side availability engine (docs task Phase 15).
 * Every step below is numbered to match that phase's own step list.
 * Nothing here is cached or persisted — every call recomputes from
 * current catalogue, schedule, and appointment state. Results are
 * advisory only: AppointmentBookingService revalidates atomically at
 * booking time rather than trusting a prior computeAvailability call
 * (docs task Phase 15: "Availability results are advisory; final booking
 * creation must revalidate atomically").
 */
@Injectable()
export class AvailabilityEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchSchedule: BranchScheduleService,
  ) {}

  /** Steps 5-6: resolve effective (branch-overridden) duration/price for
   * every requested service, in order, and validate they share one
   * currency (docs task Phase 17: "All items ... must ... Use one
   * currency"). */
  async resolveEffectiveServiceItems(
    organizationId: string,
    branchId: string,
    serviceIds: string[],
  ): Promise<EffectiveServiceItem[]> {
    if (serviceIds.length === 0) {
      throw new BadRequestException('At least one service is required');
    }

    const items: EffectiveServiceItem[] = [];
    for (const serviceId of serviceIds) {
      const service = await this.prisma.service.findFirst({
        where: { id: serviceId, organizationId, archivedAt: null },
      });
      if (!service) {
        throw new BadRequestException(`Service ${serviceId} is not available`);
      }
      const branchService = await this.prisma.branchService.findUnique({
        where: { branchId_serviceId: { branchId, serviceId } },
      });
      if (!branchService || !branchService.isEnabled) {
        throw new BadRequestException(`Service ${serviceId} is not offered at this branch`);
      }
      items.push({
        serviceId,
        name: service.name,
        durationMinutes: branchService.durationOverrideMinutes ?? service.durationMinutes,
        priceMinor: branchService.priceOverrideMinor ?? service.priceMinor,
        currency: service.currency,
        isBookableByCustomer:
          branchService.isBookableByCustomerOverride ?? service.isBookableByCustomer,
      });
    }

    const currencies = new Set(items.map((item) => item.currency));
    if (currencies.size > 1) {
      throw new BadRequestException('All services in one appointment must use the same currency');
    }

    return items;
  }

  /** Step 6: providers eligible for the *entire* sequential chain — a
   * staff member must be individually assigned (and bookable) for every
   * requested service at this branch, and must be an active worker of
   * this organization right now. */
  async resolveEligibleProviders(
    organizationId: string,
    branchId: string,
    serviceIds: string[],
    requestedStaffProfileId?: string,
  ): Promise<string[]> {
    const assignments = await this.prisma.staffServiceAssignment.findMany({
      where: { organizationId, branchId, serviceId: { in: serviceIds }, isBookable: true },
    });

    const servicesByStaff = new Map<string, Set<string>>();
    for (const assignment of assignments) {
      const services = servicesByStaff.get(assignment.staffProfileId) ?? new Set<string>();
      services.add(assignment.serviceId);
      servicesByStaff.set(assignment.staffProfileId, services);
    }

    let eligible = [...servicesByStaff.entries()]
      .filter(([, services]) => serviceIds.every((id) => services.has(id)))
      .map(([staffProfileId]) => staffProfileId);

    if (eligible.length > 0) {
      const activeStaff = await this.prisma.staffProfile.findMany({
        where: {
          id: { in: eligible },
          organizationId,
          employmentStatus: StaffEmploymentStatus.ACTIVE,
          membership: { status: MembershipStatus.ACTIVE },
        },
        select: { id: true },
      });
      const activeIds = new Set(activeStaff.map((staff) => staff.id));
      eligible = eligible.filter((id) => activeIds.has(id));
    }

    if (requestedStaffProfileId) {
      return eligible.includes(requestedStaffProfileId) ? [requestedStaffProfileId] : [];
    }
    return eligible;
  }

  async computeAvailability(params: ComputeAvailabilityParams): Promise<AvailabilityResult> {
    const dateSpanDays =
      dateDiffDays(params.fromLocalDate, params.toLocalDate) + 1;
    if (dateSpanDays < 1 || dateSpanDays > MAX_AVAILABILITY_QUERY_DAYS) {
      throw new BadRequestException(
        `Date range must be between 1 and ${MAX_AVAILABILITY_QUERY_DAYS} days`,
      );
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: params.branchId, organizationId: params.organizationId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const items = await this.resolveEffectiveServiceItems(
      params.organizationId,
      params.branchId,
      params.serviceIds,
    );
    const currency = items[0].currency;
    const totalPriceMinor = items.reduce((sum, item) => sum + item.priceMinor, 0);

    const eligibleProviderIds = await this.resolveEligibleProviders(
      params.organizationId,
      params.branchId,
      params.serviceIds,
      params.staffProfileId,
    );
    if (eligibleProviderIds.length === 0) {
      return { branchTimeZone: branch.timeZone, currency, totalPriceMinor, items, eligibleProviderIds, days: [] };
    }

    const staffDurationOverrides = await this.loadStaffDurationOverrides(
      params.organizationId,
      params.branchId,
      params.serviceIds,
      eligibleProviderIds,
    );
    const policy = await this.branchSchedule.getBookingPolicy(params.organizationId, params.branchId);

    const days: DayAvailability[] = [];
    const now = new Date();
    let cursor = params.fromLocalDate;
    for (let i = 0; i < dateSpanDays; i += 1) {
      const slots = await this.computeDaySlots({
        organizationId: params.organizationId,
        branch,
        items,
        eligibleProviderIds,
        staffDurationOverrides,
        policy,
        date: cursor,
        now,
      });
      days.push({ date: cursor, slots });
      cursor = addDaysToLocalDate(cursor, 1);
    }

    return { branchTimeZone: branch.timeZone, currency, totalPriceMinor, items, eligibleProviderIds, days };
  }

  private async loadStaffDurationOverrides(
    organizationId: string,
    branchId: string,
    serviceIds: string[],
    staffProfileIds: string[],
  ): Promise<Map<string, Map<string, number>>> {
    const assignments = await this.prisma.staffServiceAssignment.findMany({
      where: {
        organizationId,
        branchId,
        serviceId: { in: serviceIds },
        staffProfileId: { in: staffProfileIds },
        durationOverrideMinutes: { not: null },
      },
    });
    const byStaff = new Map<string, Map<string, number>>();
    for (const assignment of assignments) {
      const forStaff = byStaff.get(assignment.staffProfileId) ?? new Map<string, number>();
      forStaff.set(assignment.serviceId, assignment.durationOverrideMinutes!);
      byStaff.set(assignment.staffProfileId, forStaff);
    }
    return byStaff;
  }

  private async computeDaySlots(input: {
    organizationId: string;
    branch: { id: string; timeZone: string };
    items: EffectiveServiceItem[];
    eligibleProviderIds: string[];
    staffDurationOverrides: Map<string, Map<string, number>>;
    policy: ResolvedBookingPolicy;
    date: string;
    now: Date;
  }): Promise<AvailabilitySlot[]> {
    const { organizationId, branch, items, eligibleProviderIds, staffDurationOverrides, policy, date, now } = input;

    const branchIntervals = await this.resolveBranchOpenIntervals(organizationId, branch, date, branch.timeZone);
    if (branchIntervals.length === 0) {
      return [];
    }

    const nextDate = addDaysToLocalDate(date, 1);
    const dayStartUtc = localToUtc(date, '00:00', branch.timeZone);
    const dayEndUtc = localToUtc(nextDate, '00:00', branch.timeZone);

    const results: AvailabilitySlot[] = [];
    for (const staffProfileId of eligibleProviderIds) {
      const staffIntervals = await this.resolveStaffAvailableIntervals(
        organizationId,
        branch.id,
        staffProfileId,
        date,
        branch.timeZone,
      );
      const openIntervals = intersectLocalIntervals(branchIntervals, staffIntervals);
      if (openIntervals.length === 0) {
        continue;
      }

      const overrides = staffDurationOverrides.get(staffProfileId);
      const totalDurationMinutes = items.reduce(
        (sum, item) => sum + (overrides?.get(item.serviceId) ?? item.durationMinutes),
        0,
      );

      const existingAppointments = await this.prisma.appointment.findMany({
        where: {
          organizationId,
          assignedStaffProfileId: staffProfileId,
          status: AppointmentStatus.CONFIRMED,
          occupiedStartAt: { lt: dayEndUtc },
          occupiedEndAt: { gt: dayStartUtc },
        },
        select: { occupiedStartAt: true, occupiedEndAt: true },
      });

      for (const interval of openIntervals) {
        const startMinute = localTimeToMinutes(interval.startLocalTime);
        const endMinute = localTimeToMinutes(interval.endLocalTime);
        for (
          let minute = startMinute;
          minute + totalDurationMinutes <= endMinute;
          minute += policy.slotIntervalMinutes
        ) {
          const slotStartLocal = minutesToLocalTime(minute);
          const slotStartUtc = localToUtc(date, slotStartLocal, branch.timeZone);
          const slotEndUtc = new Date(slotStartUtc.getTime() + totalDurationMinutes * 60_000);

          if (slotStartUtc.getTime() < now.getTime() + policy.minBookingLeadTimeMinutes * 60_000) {
            continue;
          }

          const occupiedStartUtc = new Date(
            slotStartUtc.getTime() - policy.bufferBeforeMinutes * 60_000,
          );
          const occupiedEndUtc = new Date(slotEndUtc.getTime() + policy.bufferAfterMinutes * 60_000);

          const conflicts = existingAppointments.some(
            (appointment) =>
              occupiedStartUtc.getTime() < appointment.occupiedEndAt.getTime() &&
              occupiedEndUtc.getTime() > appointment.occupiedStartAt.getTime(),
          );
          if (conflicts) {
            continue;
          }

          results.push({
            startAt: slotStartUtc.toISOString(),
            endAt: slotEndUtc.toISOString(),
            staffProfileId,
          });
        }
      }
    }

    return results.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  /** Step 7 (branch side) + step 8 (branch exceptions): a specific-date
   * exception always wins over the recurring weekly rule. */
  private async resolveBranchOpenIntervals(
    organizationId: string,
    branch: { id: string },
    date: string,
    timeZone: string,
  ): Promise<LocalTimeInterval[]> {
    const exception = await this.prisma.branchScheduleException.findUnique({
      where: { branchId_date: { branchId: branch.id, date: new Date(date) } },
    });
    if (exception) {
      if (exception.type === BranchScheduleExceptionType.SPECIAL_HOURS) {
        return exception.intervals as unknown as LocalTimeInterval[];
      }
      return [];
    }

    const dayOfWeek = dayOfWeekForLocalDate(date, timeZone);
    const rows = await this.prisma.branchBusinessHours.findMany({
      where: { organizationId, branchId: branch.id, dayOfWeek },
    });
    return rows.map((row) => ({ startLocalTime: row.startLocalTime, endLocalTime: row.endLocalTime }));
  }

  /** Step 7 (staff side) + step 8 (staff exceptions): the recurring rule
   * for this day of week (within its effective range), then
   * TIME_OFF/SICK_LEAVE/HOLIDAY subtract and SPECIAL_AVAILABILITY adds. */
  private async resolveStaffAvailableIntervals(
    organizationId: string,
    branchId: string,
    staffProfileId: string,
    date: string,
    timeZone: string,
  ): Promise<LocalTimeInterval[]> {
    const dayOfWeek = dayOfWeekForLocalDate(date, timeZone);
    const dateObj = new Date(date);

    const rules = await this.prisma.staffAvailabilityRule.findMany({
      where: { organizationId, branchId, staffProfileId, dayOfWeek, isActive: true },
    });
    let intervals: LocalTimeInterval[] = rules
      .filter(
        (rule) =>
          (!rule.effectiveFrom || rule.effectiveFrom <= dateObj) &&
          (!rule.effectiveUntil || rule.effectiveUntil >= dateObj),
      )
      .map((rule) => ({ startLocalTime: rule.startLocalTime, endLocalTime: rule.endLocalTime }));

    const exceptions = await this.prisma.staffAvailabilityException.findMany({
      where: { organizationId, branchId, staffProfileId, date: dateObj },
    });
    for (const exception of exceptions) {
      if (exception.type === StaffAvailabilityExceptionType.SPECIAL_AVAILABILITY) {
        const addedWindow: LocalTimeInterval[] = exception.isFullDay
          ? [{ startLocalTime: '00:00', endLocalTime: '23:59' }]
          : [{ startLocalTime: exception.startLocalTime!, endLocalTime: exception.endLocalTime! }];
        intervals = mergeLocalIntervals(intervals, addedWindow);
      } else {
        const removedWindow: LocalTimeInterval[] = exception.isFullDay
          ? [{ startLocalTime: '00:00', endLocalTime: '23:59' }]
          : [{ startLocalTime: exception.startLocalTime!, endLocalTime: exception.endLocalTime! }];
        intervals = subtractLocalIntervals(intervals, removedWindow);
      }
    }

    return intervals;
  }
}

function dateDiffDays(fromLocalDate: string, toLocalDate: string): number {
  const from = new Date(`${fromLocalDate}T00:00:00Z`);
  const to = new Date(`${toLocalDate}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}
