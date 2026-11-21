import { describe, expect, it } from 'vitest';
import {
  addStopSchema,
  createPlaceSchema,
  createStaySchema,
  placeSchema,
  stopTransitionSchema,
  timeZoneSchema,
  tripAssistantRequestSchema,
  tripAssistantResponseSchema,
  tripPlaceSchema,
  updatePlaceSchema,
  updateStaySchema,
  updateStopSchema,
  updateTripV2Schema,
} from './index.js';

const id = '6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e';

describe('D1 schemas', () => {
  it('time zones: IANA names this runtime knows', () => {
    expect(timeZoneSchema.safeParse('America/New_York').success).toBe(true);
    expect(timeZoneSchema.safeParse('UTC').success).toBe(true);
    expect(timeZoneSchema.safeParse('Mars/Olympus').success).toBe(false);
    expect(timeZoneSchema.safeParse('EST; drop table').success).toBe(false);
  });

  it('visits: strict bodies, valid days and times', () => {
    expect(addStopSchema.parse({ tripPlaceId: id, day: '2026-11-24', startTime: '09:30' })).toMatchObject({ day: '2026-11-24' });
    expect(addStopSchema.safeParse({ tripPlaceId: id, day: '2026-11-24', status: 'completed' }).success).toBe(false);
    expect(updateStopSchema.safeParse({}).success).toBe(false);
    expect(updateStopSchema.safeParse({ location: { latitude: 1, longitude: 1 } }).success).toBe(false);
    expect(stopTransitionSchema.parse(undefined)).toEqual({});
    expect(stopTransitionSchema.safeParse({ at: 'yesterday' }).success).toBe(false);
  });

  it('stays: a place or the user\'s text; both dates or none; check-out after check-in', () => {
    expect(createStaySchema.parse({ label: '  Pod Times Square  ' })).toMatchObject({ label: 'Pod Times Square', checkIn: null, placeId: null });
    expect(createStaySchema.safeParse({ label: '   ' }).success).toBe(false);
    expect(createStaySchema.safeParse({ label: 'x', checkIn: '2026-11-23' }).success).toBe(false);
    expect(createStaySchema.safeParse({ label: 'x', checkIn: '2026-11-23', checkOut: '2026-11-23' }).success).toBe(false);
    expect(updateStaySchema.safeParse({ checkIn: '2026-11-24' }).success).toBe(false);
    expect(updateStaySchema.safeParse({ checkIn: null, checkOut: null }).success).toBe(true);
  });

  it('custom place pins: both coordinates, never 0,0; Google link by ID only', () => {
    expect(createPlaceSchema.safeParse({ name: 'Pin', latitude: 40.7, longitude: -73.9, linkedGooglePlaceId: 'ChIJN1t_tDeuEmsRUsoyG83frY4' }).success).toBe(true);
    expect(createPlaceSchema.safeParse({ name: 'Pin', latitude: 40.7 }).success).toBe(false);
    expect(createPlaceSchema.safeParse({ name: 'Pin', latitude: 0, longitude: 0 }).success).toBe(false);
    expect(updatePlaceSchema.safeParse({ latitude: null, longitude: null }).success).toBe(true);
    expect(updatePlaceSchema.safeParse({ latitude: null, longitude: 3 }).success).toBe(false);
  });

  it('older servers and v1 trip responses (no pin fields) still parse', () => {
    const place = {
      id, source: 'google', googlePlaceId: 'ChIJN1t_tDeuEmsRUsoyG83frY4', name: null, address: null, notes: null, myLabel: null,
      category: 'food', tags: [], visitedAt: null, tripCount: 1,
      createdAt: '2026-11-16T11:30:00.000Z', updatedAt: '2026-11-16T11:30:00.000Z', version: 1,
    };
    expect(placeSchema.parse(place).latitude).toBeUndefined();
    expect(tripPlaceSchema.safeParse({ ...place, addedAt: place.createdAt, day: null, startTime: null, position: 0, durationMinutes: null }).success).toBe(true);
  });

  it('v2 trip patch: no base fields (stays replace them)', () => {
    expect(updateTripV2Schema.safeParse({ baseLocation: 'x' }).success).toBe(false);
    expect(updateTripV2Schema.safeParse({ unscheduleOutside: true }).success).toBe(false);
    expect(updateTripV2Schema.parse({ endDate: '2026-11-26', unscheduleOutside: true })).toMatchObject({ unscheduleOutside: true });
  });

  it('trip assistant request: short message, compact context, no extra fields (e.g. Google names)', () => {
    const visit = { ref: 'v1', category: 'sights', label: 'The Met', start: null, starred: true, status: 'planned' };
    const body = { message: ' Make Wednesday less busy ', locale: 'en', context: { today: '2026-11-23', days: [{ day: '2026-11-25', visits: [visit] }], wishlist: [] } };
    expect(tripAssistantRequestSchema.parse(body).message).toBe('Make Wednesday less busy');
    expect(tripAssistantRequestSchema.safeParse({ ...body, message: 'x'.repeat(301) }).success).toBe(false);
    expect(tripAssistantRequestSchema.safeParse({ ...body, message: '   ' }).success).toBe(false);
    const withName = { ...body, context: { ...body.context, days: [{ day: '2026-11-25', visits: [{ ...visit, name: 'Google name' }] }] } };
    expect(tripAssistantRequestSchema.safeParse(withName).success).toBe(false);
    expect(tripAssistantRequestSchema.safeParse({ ...body, googlePlaceId: 'ChIJN1t_tDeuEmsRUsoyG83frY4' }).success).toBe(false);
  });

  it('trip assistant response: plan (1–6 valid instructions), clarify or unavailable', () => {
    const lighten = { kind: 'lighten', day: '2026-11-25', maxHours: null };
    expect(tripAssistantResponseSchema.safeParse({ action: 'plan', summary: 'Lighter Wednesday', instructions: [lighten] }).success).toBe(true);
    expect(tripAssistantResponseSchema.safeParse({ action: 'plan', summary: '', instructions: [] }).success).toBe(false);
    expect(tripAssistantResponseSchema.safeParse({ action: 'plan', summary: '', instructions: Array(7).fill(lighten) }).success).toBe(false);
    expect(tripAssistantResponseSchema.safeParse({ action: 'plan', summary: '', instructions: [{ ...lighten, maxHours: 20 }] }).success).toBe(false);
    expect(tripAssistantResponseSchema.safeParse({ action: 'plan', summary: '', instructions: [{ kind: 'deleteVisit', day: '2026-11-25' }] }).success).toBe(false);
    expect(tripAssistantResponseSchema.safeParse({ action: 'clarify', question: 'Which Wednesday?', options: ['Nov 25'] }).success).toBe(true);
    expect(tripAssistantResponseSchema.parse({ action: 'unavailable' })).toEqual({ action: 'unavailable' });
    const findPlace = { kind: 'findPlace', query: 'SUMMIT One Vanderbilt', category: null, area: null, nearPlanned: false, day: null, intent: 'add' };
    expect(tripAssistantResponseSchema.safeParse({ action: 'plan', summary: '', instructions: [findPlace] }).success).toBe(true);
    expect(tripAssistantResponseSchema.safeParse({ action: 'plan', summary: '', instructions: [{ ...findPlace, intent: 'book' }] }).success).toBe(false);
    expect(tripAssistantResponseSchema.safeParse({ action: 'plan', summary: '', instructions: [{ ...findPlace, placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4' }] }).success).toBe(false);
  });
});
