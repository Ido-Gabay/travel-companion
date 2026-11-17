import { describe, expect, it } from 'vitest';
import {
  addTripPlaceSchema,
  createPlaceSchema,
  createTripSchema,
  updatePlaceSchema,
  isRtlLocale,
  tripSchema,
  updatePreferencesSchema,
  updateProfileSchema,
} from './index.js';

describe('updateProfileSchema', () => {
  it('trims the display name', () => {
    expect(updateProfileSchema.parse({ displayName: '  Ido  ' })).toEqual({ displayName: 'Ido' });
  });

  it('accepts null to clear the name', () => {
    expect(updateProfileSchema.parse({ displayName: null })).toEqual({ displayName: null });
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(updateProfileSchema.safeParse({ displayName: '   ' }).success).toBe(false);
  });

  it('rejects names over 80 characters', () => {
    expect(updateProfileSchema.safeParse({ displayName: 'a'.repeat(81) }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(updateProfileSchema.safeParse({ displayName: 'Ido', role: 'admin' }).success).toBe(
      false,
    );
  });
});

describe('updatePreferencesSchema', () => {
  it('accepts a single field', () => {
    expect(updatePreferencesSchema.parse({ locale: 'he' })).toEqual({ locale: 'he' });
  });

  it('rejects an empty body', () => {
    expect(updatePreferencesSchema.safeParse({}).success).toBe(false);
  });

  it('rejects unsupported locales', () => {
    expect(updatePreferencesSchema.safeParse({ locale: 'fr' }).success).toBe(false);
  });
});

describe('tripSchema', () => {
  it('accepts calendar dates and nulls', () => {
    const trip = {
      id: '6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e',
      title: 'New York',
      destination: 'New York, USA',
      startDate: '2026-11-23',
      endDate: null,
      placeCount: 0,
      createdAt: '2026-11-16T10:00:00.000Z',
      updatedAt: '2026-11-16T10:00:00.000Z',
      version: 1,
    };
    expect(tripSchema.parse(trip)).toEqual(trip);
  });
});

describe('isRtlLocale', () => {
  it('marks Hebrew as RTL and English as LTR', () => {
    expect(isRtlLocale('he')).toBe(true);
    expect(isRtlLocale('en')).toBe(false);
  });
});

describe('createTripSchema', () => {
  it('normalizes optional fields to null', () => {
    expect(createTripSchema.parse({ title: ' New York ' })).toEqual({
      title: 'New York',
      destination: null,
      startDate: null,
      endDate: null,
    });
  });

  it('turns a blank destination into null', () => {
    expect(createTripSchema.parse({ title: 'NY', destination: '   ' }).destination).toBeNull();
  });

  it('rejects an end date before the start date', () => {
    const result = createTripSchema.safeParse({
      title: 'NY',
      startDate: '2026-11-29',
      endDate: '2026-11-23',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty title and bad dates', () => {
    expect(createTripSchema.safeParse({ title: '  ' }).success).toBe(false);
    expect(createTripSchema.safeParse({ title: 'NY', startDate: '2026-13-01' }).success).toBe(false);
  });
});

describe('createPlaceSchema', () => {
  it('trims and turns blank optional fields into null', () => {
    expect(createPlaceSchema.parse({ name: ' Katz\'s Deli ', address: '  ', notes: '' })).toEqual({
      name: "Katz's Deli",
      address: null,
      notes: null,
    });
  });

  it('keeps line breaks inside notes', () => {
    expect(createPlaceSchema.parse({ name: 'MoMA', notes: 'Fri free\nafter 4pm' }).notes).toBe(
      'Fri free\nafter 4pm',
    );
  });

  it('rejects a missing name and long notes', () => {
    expect(createPlaceSchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(createPlaceSchema.safeParse({ name: 'x', notes: 'a'.repeat(2001) }).success).toBe(false);
  });
});

describe('updatePlaceSchema', () => {
  it('keeps undefined (unchanged) apart from null (clear)', () => {
    expect(updatePlaceSchema.parse({ notes: null })).toEqual({ notes: null });
    expect(updatePlaceSchema.parse({ address: '' })).toEqual({ address: null });
  });

  it('rejects an empty body and unknown keys', () => {
    expect(updatePlaceSchema.safeParse({}).success).toBe(false);
    expect(updatePlaceSchema.safeParse({ name: 'x', rating: 5 }).success).toBe(false);
  });
});

describe('addTripPlaceSchema', () => {
  it('requires a UUID', () => {
    expect(addTripPlaceSchema.safeParse({ placeId: 'nope' }).success).toBe(false);
    expect(
      addTripPlaceSchema.safeParse({ placeId: '6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e' }).success,
    ).toBe(true);
  });
});
