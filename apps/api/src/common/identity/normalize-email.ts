/**
 * Normalizes an email address for lookup and uniqueness enforcement:
 * trims surrounding whitespace and lowercases it. Every place that looks a
 * user up by email (registration, login, staff invitations, customer
 * records) must normalize first, or the same address could collide with
 * itself under a different case.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
