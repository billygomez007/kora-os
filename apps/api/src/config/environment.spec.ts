import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  it('provides safe development defaults', () => {
    expect(validateEnvironment({})).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      API_PREFIX: '/v1',
    });
  });

  it('normalizes a configured API prefix', () => {
    expect(validateEnvironment({ API_PREFIX: '/v2/' }).API_PREFIX).toBe('/v2');
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnvironment({ PORT: '70000' })).toThrow(
      'PORT must be an integer between 1 and 65535',
    );
  });

  it('rejects an invalid environment name', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'preview' })).toThrow(
      'NODE_ENV must be one of',
    );
  });
});
