import { allowedCorsOrigins } from './configure-application.js';

describe('allowedCorsOrigins', () => {
  it('excludes localhost from production CORS', () => {
    expect(allowedCorsOrigins('production')).toEqual([
      'https://koraafric.com',
      'https://www.koraafric.com',
    ]);
  });

  it('keeps localhost available outside production', () => {
    expect(allowedCorsOrigins('development')).toContain('http://localhost:3001');
  });
});
