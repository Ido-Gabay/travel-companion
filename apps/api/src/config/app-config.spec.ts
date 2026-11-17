import { describe, expect, it } from 'vitest';
import { parseAppConfig } from './app-config.js';

const validEnv = {
  SUPABASE_URL: 'https://abcd1234.supabase.co/',
  DATABASE_URL: 'postgresql://postgres.abcd1234:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
};

describe('parseAppConfig', () => {
  it('applies defaults and derives the JWT issuer and JWKS URL', () => {
    const config = parseAppConfig(validEnv);
    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.databaseSsl).toBe('require');
    expect(config.jwtAudience).toBe('authenticated');
    expect(config.jwtIssuer).toBe('https://abcd1234.supabase.co/auth/v1');
    expect(config.jwksUrl).toBe('https://abcd1234.supabase.co/auth/v1/.well-known/jwks.json');
    expect(config.rateLimit).toEqual({ perMinute: 240, paidPerMinute: 60 });
  });

  it('coerces PORT from a string', () => {
    expect(parseAppConfig({ ...validEnv, PORT: '8080' }).port).toBe(8080);
  });

  it('lists every invalid variable without leaking values', () => {
    let message = '';
    try {
      parseAppConfig({ DATABASE_URL: 'mysql://user:topsecret@host/db' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('SUPABASE_URL');
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('topsecret');
  });
});
