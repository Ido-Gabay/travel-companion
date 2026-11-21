import { describe, expect, it, vi } from 'vitest';
import { tripAssistantResponseSchema, type TripAssistantRequest } from '@travel-companion/shared';
import type { AppConfig } from '../config/app-config.js';
import type { UsageGuardService } from '../usage/usage-guard.service.js';
import { AiService } from './ai.service.js';
import { buildTripAssistantUserMessage, TRIP_ASSISTANT_OUTPUT_SCHEMA } from './trip-assistant-prompt.js';
import { parseTripAssistantOutput } from './trip-assistant-result.js';
import { rateLimitClass } from '../rate-limit/rate-limiter.js';

const request: TripAssistantRequest = {
  message: 'Make Wednesday less busy and start every day at 10',
  locale: 'en',
  context: {
    today: '2026-11-23',
    days: [
      { day: '2026-11-24', visits: [{ ref: 'v1', category: 'sights', label: null, start: null, starred: true, status: 'planned' }] },
      { day: '2026-11-25', visits: [{ ref: 'v2', category: 'shopping', label: 'Sneakers', start: '15:00', starred: false, status: 'planned' }] },
    ],
    wishlist: [{ ref: 'w1', category: 'food', label: null, start: null, starred: false, status: null }],
  },
};

const flat = {
  kind: 'lighten',
  day: '',
  days: [],
  time: '',
  maxHours: -1,
  category: 'none',
  extraMinutes: -1,
  what: 'none',
  ref: '',
  text: '',
  toDay: '',
  query: '',
  near: 'none',
  area: '',
  nearPlanned: false,
  nearHere: false,
  intent: 'none',
};
const output = (instructions: object[], extra: object = {}) =>
  JSON.stringify({ action: 'plan', summary: 'Lighter Wednesday', instructions, question: '', options: [], ...extra });

describe('trip assistant: Claude output', () => {
  it('maps flat instructions to ours and checks them against the trip', () => {
    const result = parseTripAssistantOutput(
      output([
        { ...flat, kind: 'lighten', day: '2026-11-25' },
        { ...flat, kind: 'dayStart', time: '10:00', days: [] },
        { ...flat, kind: 'moreTime', category: 'shopping', extraMinutes: 30 },
        { ...flat, kind: 'keepFixed', what: 'starred' },
        { ...flat, kind: 'moveVisit', category: 'sights', text: 'museum', toDay: '' },
        { ...flat, kind: 'findNearby', category: 'food', query: 'dinner restaurant', near: 'dayEnd' },
      ]),
      request,
    );
    expect(tripAssistantResponseSchema.parse(result)).toEqual({
      action: 'plan',
      summary: 'Lighter Wednesday',
      instructions: [
        { kind: 'lighten', day: '2026-11-25', maxHours: null },
        { kind: 'dayStart', time: '10:00', days: [] },
        { kind: 'moreTime', category: 'shopping', extraMinutes: 30 },
        { kind: 'keepFixed', what: 'starred' },
        { kind: 'moveVisit', target: { ref: null, category: 'sights', text: 'museum', day: null }, toDay: null },
        { kind: 'findNearby', category: 'food', query: 'dinner restaurant', day: null, near: 'dayEnd' },
      ],
    });
  });

  it('drops days outside the trip, unknown refs and bad times', () => {
    expect(parseTripAssistantOutput(output([{ ...flat, kind: 'lighten', day: '2027-01-01' }]), request)).toBeNull();
    expect(parseTripAssistantOutput(output([{ ...flat, kind: 'dayStart', time: '25:00' }]), request)).toBeNull();
    const move = parseTripAssistantOutput(output([{ ...flat, kind: 'moveVisit', ref: 'v99', category: 'sights' }]), request);
    expect(move?.action === 'plan' && move.instructions[0]).toMatchObject({ target: { ref: null, category: 'sights' } });
    expect(parseTripAssistantOutput('not json', request)).toBeNull();
  });

  it('findPlace: the user\'s words, an area and a day; Claude never picks the place', () => {
    const named = parseTripAssistantOutput(
      output([{ ...flat, kind: 'findPlace', query: 'SUMMIT One Vanderbilt', day: '2026-11-25', intent: 'add' }]),
      request,
    );
    expect(named?.action === 'plan' && named.instructions[0]).toEqual({
      kind: 'findPlace', query: 'SUMMIT One Vanderbilt', category: null, area: null, nearPlanned: false, nearHere: false, day: '2026-11-25', intent: 'add',
    });
    const kind = parseTripAssistantOutput(output([{ ...flat, kind: 'findPlace', query: 'shops', category: 'shopping', area: 'SoHo', intent: 'none' }]), request);
    expect(kind?.action === 'plan' && kind.instructions[0]).toMatchObject({ area: 'SoHo', intent: 'add', day: null });
    const where = parseTripAssistantOutput(output([{ ...flat, kind: 'findPlace', query: 'The Frick', intent: 'locate' }]), request);
    expect(where?.action === 'plan' && where.instructions[0]).toMatchObject({ intent: 'locate' });
    expect(parseTripAssistantOutput(output([{ ...flat, kind: 'findPlace' }]), request)).toBeNull();
  });

  it('live changes: a named visit, or (empty) the one happening now / next', () => {
    const plan = (instructions: object[]) => {
      const result = parseTripAssistantOutput(output(instructions), request);
      return result?.action === 'plan' ? result.instructions : null;
    };
    expect(plan([{ ...flat, kind: 'skipVisit', ref: 'v1' }])).toEqual([{ kind: 'skipVisit', target: { ref: 'v1', category: null, text: null, day: null } }]);
    expect(plan([{ ...flat, kind: 'skipVisit' }])).toEqual([{ kind: 'skipVisit', target: null }]);
    expect(plan([{ ...flat, kind: 'extendVisit', extraMinutes: 60 }])).toEqual([{ kind: 'extendVisit', target: null, extraMinutes: 60 }]);
    expect(plan([{ ...flat, kind: 'closedVisit', text: 'Frick', category: 'sights' }])).toEqual([
      { kind: 'closedVisit', target: { ref: null, category: 'sights', text: 'Frick', day: null } },
    ]);
    expect(plan([{ ...flat, kind: 'findPlace', nearHere: true }])?.[0]).toMatchObject({ kind: 'findPlace', nearHere: true, query: null });
  });

  it('running late: catchUp carries no other fields', () => {
    const result = parseTripAssistantOutput(output([{ ...flat, kind: 'catchUp', day: '2026-11-25', query: 'x' }]), request);
    expect(result).toEqual({ action: 'plan', summary: 'Lighter Wednesday', instructions: [{ kind: 'catchUp' }] });
  });

  it('asks once; after an answer it must plan', () => {
    const clarify = output([], { action: 'clarify', summary: '', question: 'Which Wednesday?', options: ['Nov 25', 'Dec 2'] });
    expect(parseTripAssistantOutput(clarify, request)).toEqual({ action: 'clarify', question: 'Which Wednesday?', options: ['Nov 25', 'Dec 2'] });
    expect(parseTripAssistantOutput(clarify, { ...request, clarifications: [{ question: 'Which?', answer: 'Nov 25' }] })).toBeNull();
  });

  it('the prompt has the trip in the user\'s own words only, with weekdays', () => {
    const message = buildTripAssistantUserMessage(request);
    expect(message).toContain('2026-11-25 (Wednesday): v2 shopping "Sneakers" at 15:00');
    expect(message).toContain('v1 sights starred');
    expect(message).toContain('Wishlist (not on a day yet): w1 food');
    expect(TRIP_ASSISTANT_OUTPUT_SCHEMA.required).toContain('instructions');
  });
});

describe('trip assistant: without AI', () => {
  const service = (key: string | null, consume = vi.fn(async () => undefined)) =>
    new AiService({ anthropicApiKey: key, aiModel: 'm' } as AppConfig, { consume } as unknown as UsageGuardService);

  it('is "unavailable" with no key, without counting usage', async () => {
    const consume = vi.fn(async () => undefined);
    expect(await service(null, consume).tripAssistant(request)).toEqual({ action: 'unavailable' });
    expect(consume).not.toHaveBeenCalled();
  });

  it('is "unavailable" over the daily AI cap, without calling Claude', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await service('key', vi.fn(async () => Promise.reject(new Error('cap')))).tripAssistant(request);
    expect(result).toEqual({ action: 'unavailable' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('is rate-limited like other paid routes', () => {
    expect(rateLimitClass('/v1/assistant/trip')).toBe('paid');
  });
});
