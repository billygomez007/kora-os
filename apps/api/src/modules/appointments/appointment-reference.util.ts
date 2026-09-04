import { randomInt } from 'node:crypto';

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const REFERENCE_LENGTH = 8;

/** A short, human-readable, cryptographically-random reference a customer
 * or staff member can read over the phone (docs task Phase 17: "Public
 * human-readable reference"). Not a security token — `appointments.id`
 * (a UUID) is the actual primary key; this exists purely for humans. */
export function generateAppointmentReference(): string {
  let value = '';
  for (let i = 0; i < REFERENCE_LENGTH; i += 1) {
    value += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return `KRA-${value}`;
}
