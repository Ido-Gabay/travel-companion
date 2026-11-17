import { describe, expect, it } from 'vitest';
import { RateLimiter, rateLimitClass } from './rate-limiter.js';

describe('RateLimiter', () => {
  it('allows up to the limit per window, then refuses with a retry time', () => {
    let now = 0;
    const limiter = new RateLimiter(() => now);
    expect(limiter.take('u:default', 2, 60_000).allowed).toBe(true);
    expect(limiter.take('u:default', 2, 60_000).allowed).toBe(true);
    now = 15_000;
    expect(limiter.take('u:default', 2, 60_000)).toEqual({ allowed: false, retryAfterSeconds: 45 });
  });

  it('starts a new window after it expires and keeps keys apart', () => {
    let now = 0;
    const limiter = new RateLimiter(() => now);
    limiter.take('a', 1, 60_000);
    expect(limiter.take('a', 1, 60_000).allowed).toBe(false);
    expect(limiter.take('b', 1, 60_000).allowed).toBe(true);
    now = 60_000;
    expect(limiter.take('a', 1, 60_000).allowed).toBe(true);
  });

  it('treats a zero limit as closed', () => {
    expect(new RateLimiter(() => 0).take('x', 0, 60_000).allowed).toBe(false);
  });
});

describe('rateLimitClass', () => {
  it('puts Google and AI routes in the paid class', () => {
    expect(rateLimitClass('/v1/discover/search')).toBe('paid');
    expect(rateLimitClass('/v1/discover/interpret')).toBe('paid');
    expect(rateLimitClass('/v1/google/places/abc/preview?lang=en')).toBe('paid');
    expect(rateLimitClass('/v1/google/photos?name=x')).toBe('paid');
    expect(rateLimitClass('/v1/trips')).toBe('default');
    expect(rateLimitClass('/v1/places/google')).toBe('default');
    expect(rateLimitClass('/v1/discoveries')).toBe('default');
  });
});
