import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produces an Argon2id hash', async () => {
    const hash = await service.hash('a-safe-long-password');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('salts each hash differently even for the same password', async () => {
    const [first, second] = await Promise.all([
      service.hash('a-safe-long-password'),
      service.hash('a-safe-long-password'),
    ]);
    expect(first).not.toBe(second);
  });

  it('verifies a matching password', async () => {
    const hash = await service.hash('a-safe-long-password');
    await expect(service.verify(hash, 'a-safe-long-password')).resolves.toBe(true);
  });

  it('rejects a non-matching password', async () => {
    const hash = await service.hash('a-safe-long-password');
    await expect(service.verify(hash, 'a-different-password')).resolves.toBe(false);
  });

  it('never stores the plaintext password in the hash output', async () => {
    const plainPassword = 'a-safe-long-password';
    const hash = await service.hash(plainPassword);
    expect(hash).not.toContain(plainPassword);
  });

  it('treats a malformed stored hash as a verification failure rather than throwing', async () => {
    await expect(
      service.verify('not-a-real-argon2-hash', 'anything'),
    ).resolves.toBe(false);
  });
});
