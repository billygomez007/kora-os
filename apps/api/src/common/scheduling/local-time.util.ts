import { DateTime } from 'luxon';
import { registerDecorator, type ValidationOptions } from 'class-validator';

const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidLocalTime(value: unknown): value is string {
  return typeof value === 'string' && HHMM_PATTERN.test(value);
}

export function isValidLocalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !LOCAL_DATE_PATTERN.test(value)) {
    return false;
  }
  return DateTime.fromISO(value).isValid;
}

/** "HH:mm" strings compare correctly with plain string ordering because
 * they are always zero-padded to a fixed width. */
export function compareLocalTimes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function localTimeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToLocalTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Converts a wall-clock local date + time under a specific IANA zone into
 * the UTC instant it represents (docs task Phase 13: "local dates and
 * recurring schedules must be interpreted using the branch timezone").
 * Throws if the zone or the resulting local time is invalid (e.g. a
 * skipped DST-transition time) rather than silently guessing.
 */
export function localToUtc(
  localDate: string,
  localTime: string,
  timeZone: string,
): Date {
  const dt = DateTime.fromISO(`${localDate}T${localTime}:00`, { zone: timeZone });
  if (!dt.isValid) {
    throw new Error(
      `Cannot resolve ${localDate} ${localTime} in zone ${timeZone}: ${dt.invalidReason ?? 'invalid'}`,
    );
  }
  return dt.toJSDate();
}

/** The local calendar date (YYYY-MM-DD) a UTC instant falls on, under the
 * given zone. */
export function utcToLocalDate(instant: Date, timeZone: string): string {
  return DateTime.fromJSDate(instant, { zone: 'utc' }).setZone(timeZone).toISODate()!;
}

/** ISO weekday is 1 (Monday) .. 7 (Sunday); the schema's `dayOfWeek`
 * columns use 0 (Sunday) .. 6 (Saturday), matching JS `Date#getDay()`. */
export function dayOfWeekForLocalDate(localDate: string, timeZone: string): number {
  const weekday = DateTime.fromISO(localDate, { zone: timeZone }).weekday;
  return weekday % 7;
}

export function addDaysToLocalDate(localDate: string, days: number): string {
  return DateTime.fromISO(localDate).plus({ days }).toISODate()!;
}

export function todayInZone(timeZone: string): string {
  return DateTime.now().setZone(timeZone).toISODate()!;
}

/** class-validator decorator wrapping isValidLocalTime ("HH:mm"). */
export function IsLocalTime(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isLocalTime',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a 24-hour "HH:mm" local time`,
        ...validationOptions,
      },
      validator: { validate: (value: unknown) => isValidLocalTime(value) },
    });
  };
}

/** class-validator decorator wrapping isValidLocalDate ("YYYY-MM-DD"). */
export function IsLocalDate(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isLocalDate',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a "YYYY-MM-DD" local date`,
        ...validationOptions,
      },
      validator: { validate: (value: unknown) => isValidLocalDate(value) },
    });
  };
}
