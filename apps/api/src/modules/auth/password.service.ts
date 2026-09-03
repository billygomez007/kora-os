import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Argon2id password hashing (docs/SECURITY.md section 6: "a modern
 * memory-hard password hashing function using reviewed parameters").
 * Isolated behind this service so AuthIdentity.passwordAlgorithm can
 * change in the future without touching callers.
 */
@Injectable()
export class PasswordService {
  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, { type: argon2.argon2id });
  }

  /**
   * argon2.verify performs a constant-time comparison internally, so no
   * additional timing-safe handling is needed here.
   */
  async verify(hash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainPassword);
    } catch {
      return false;
    }
  }
}
