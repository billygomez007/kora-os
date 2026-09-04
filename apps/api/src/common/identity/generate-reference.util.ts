import { randomInt } from 'node:crypto';

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const REFERENCE_LENGTH = 8;

/** A short, human-readable, cryptographically-random reference a staff
 * member can read over the phone or write on a receipt — not a security
 * token (the row's UUID `id` is the real primary key). Mirrors
 * `generateAppointmentReference` for the financial domain (Checkout,
 * PaymentRecord, Transaction), each with its own prefix. */
export function generateReference(prefix: string): string {
  let value = '';
  for (let i = 0; i < REFERENCE_LENGTH; i += 1) {
    value += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return `${prefix}-${value}`;
}
