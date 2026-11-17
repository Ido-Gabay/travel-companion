import type { Trip } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import { upcomingTrips } from '../features/trips/upcoming';
import { ApiClientError, errorFromResponse, isRetryable } from './api-error';
import { formatTripDates, fromIsoDate, toIsoDate } from './dates';
import { mapsSearchQuery, mapsSearchUrl } from './maps';

function trip(id: string, startDate: string | null, endDate: string | null, createdAt = '2026-11-01T00:00:00.000Z'): Trip {
  return {
    id,
    title: id,
    destination: null,
    startDate,
    endDate,
    baseLocation: null,
    basePlaceId: null,
    placeCount: 0,
    createdAt,
    updatedAt: createdAt,
    version: 1,
  };
}

describe('dates', () => {
  it('round-trips a calendar date through a local Date', () => {
    expect(toIsoDate(fromIsoDate('2026-11-23'))).toBe('2026-11-23');
  });

  it('formats a range without shifting days', () => {
    const text = formatTripDates('2026-11-23', '2026-11-29', 'en-US');
    expect(text).toContain('23');
    expect(text).toContain('29');
    expect(text).toContain('2026');
  });

  it('formats a single date and returns null without dates', () => {
    expect(formatTripDates('2026-11-23', null, 'en-US')).toContain('23');
    expect(formatTripDates(null, null, 'en-US')).toBeNull();
  });

  it('formats in Hebrew', () => {
    expect(formatTripDates('2026-11-23', null, 'he')).toContain('2026');
  });
});

describe('upcomingTrips', () => {
  const today = '2026-11-16';

  it('drops trips that have ended and keeps ones in progress', () => {
    const result = upcomingTrips(
      [trip('past', '2026-10-01', '2026-10-05'), trip('now', '2026-11-10', '2026-11-20')],
      today,
    );
    expect(result.map((t) => t.id)).toEqual(['now']);
  });

  it('sorts by start date with undated trips last', () => {
    const result = upcomingTrips(
      [trip('undated', null, null), trip('dec', '2026-12-01', null), trip('ny', '2026-11-23', '2026-11-29')],
      today,
    );
    expect(result.map((t) => t.id)).toEqual(['ny', 'dec', 'undated']);
  });
});

describe('api errors', () => {
  it('reads the documented error body', () => {
    const error = errorFromResponse(400, {
      error: { code: 'VALIDATION_FAILED', message: 'bad', details: [{ path: 'title', message: 'x' }] },
    });
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details[0]?.path).toBe('title');
  });

  it('falls back by status when the body is not JSON', () => {
    expect(errorFromResponse(502, null).code).toBe('INTERNAL');
    expect(errorFromResponse(401, 'oops').code).toBe('UNAUTHENTICATED');
  });

  it('retries network and server errors only', () => {
    expect(isRetryable(new ApiClientError('NETWORK', null, ''))).toBe(true);
    expect(isRetryable(new ApiClientError('INTERNAL', 500, ''))).toBe(true);
    expect(isRetryable(new ApiClientError('VALIDATION_FAILED', 400, ''))).toBe(false);
    expect(isRetryable(new ApiClientError('UNAUTHENTICATED', 401, ''))).toBe(false);
    expect(isRetryable(new ApiClientError('DAILY_LIMIT_REACHED', 429, ''))).toBe(false);
    expect(isRetryable(new ApiClientError('NOT_CONFIGURED', 503, ''))).toBe(false);
  });
});

describe('maps links', () => {
  it('searches by name and address, encoded', () => {
    const query = mapsSearchQuery("Katz's Deli", '205 E Houston St');
    expect(query).toBe("Katz's Deli, 205 E Houston St");
    expect(mapsSearchUrl(query, 'ios')).toBe(
      "https://maps.apple.com/?q=Katz's%20Deli%2C%20205%20E%20Houston%20St",
    );
    expect(mapsSearchUrl('מוזיאון', 'android')).toMatch(
      /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=%D7/,
    );
  });

  it('uses the name alone without an address', () => {
    expect(mapsSearchQuery('MoMA', null)).toBe('MoMA');
  });
});

describe('groupByCategory', () => {
  it('groups in the fixed order and skips empty categories', async () => {
    const { groupByCategory } = await import('../features/places/categories');
    const groups = groupByCategory([
      { id: 'a', category: 'sights' as const },
      { id: 'b', category: 'food' as const },
      { id: 'c', category: 'food' as const },
    ]);
    expect(groups.map((g) => [g.category, g.items.length])).toEqual([
      ['food', 2],
      ['sights', 1],
    ]);
  });
});
