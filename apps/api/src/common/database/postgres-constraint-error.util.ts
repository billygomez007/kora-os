import { Prisma } from '../../generated/prisma/client.js';

/** SQLSTATE for a PostgreSQL EXCLUDE constraint violation. */
const EXCLUSION_VIOLATION_SQLSTATE = '23P01';

interface DriverAdapterErrorMeta {
  driverAdapterError?: {
    cause?: {
      originalCode?: string;
      message?: string;
    };
  };
}

/**
 * Prisma 7's driver-adapter path (`@prisma/adapter-pg`) has no
 * first-class model for a PostgreSQL constraint kind it doesn't itself
 * understand — a CHECK or EXCLUDE constraint, unlike a plain unique or
 * foreign-key violation — so it reports it as a generic `P2039`
 * "database error" whose real Postgres SQLSTATE is nested at
 * `error.meta.driverAdapterError.cause.originalCode`. Verified
 * empirically against the `appointments_no_staff_double_booking`
 * exclusion constraint (see the
 * `add_service_catalogue_availability_appointments` migration) before
 * writing this, rather than assumed.
 *
 * Callers translate a `true` result into the safe, generic
 * `SLOT_UNAVAILABLE` / 409 response (see AppointmentBookingService) —
 * this function itself never leaks the underlying constraint name or
 * message to anything beyond an optional exact-match check.
 */
export function isExclusionConstraintViolation(
  error: unknown,
  constraintName?: string,
): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  const meta = error.meta as DriverAdapterErrorMeta | undefined;
  const cause = meta?.driverAdapterError?.cause;
  if (cause?.originalCode !== EXCLUSION_VIOLATION_SQLSTATE) {
    return false;
  }
  if (!constraintName) {
    return true;
  }
  return Boolean(cause.message?.includes(constraintName));
}

/**
 * A plain Prisma unique-constraint violation (`P2002`) — unlike the
 * exclusion-constraint case above, Prisma has recognized and stably
 * documented this error code across versions, so no nested
 * driver-adapter detail needs unwrapping.
 */
export function isUniqueConstraintViolation(
  error: unknown,
  target?: string,
): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  if (!target) {
    return true;
  }
  const meta = error.meta as
    | (DriverAdapterErrorMeta & { target?: string[] | string })
    | undefined;
  const targets = Array.isArray(meta?.target) ? meta.target : meta?.target ? [meta.target] : [];
  if (targets.some((entry) => entry.includes(target))) {
    return true;
  }
  // The query-engine path populates meta.target with column names; the
  // driver-adapter path (Prisma 7 + @prisma/adapter-pg, used throughout
  // this app) instead nests the real constraint name inside
  // driverAdapterError.cause — verified empirically the same way the
  // exclusion-constraint case above was, since a P2002 raised through
  // this adapter does not reliably populate meta.target at all.
  const adapterMessage = meta?.driverAdapterError?.cause?.message;
  if (adapterMessage?.includes(target)) {
    return true;
  }
  return error.message.includes(target);
}
