import type { LatLng, PlaceCategory } from '@travel-companion/shared';
import { describe, expect, it } from 'vitest';
import { OVERLOADED_MIN, toMinutes, type PlanStop } from '../planning/day-planner';
import { completePlan } from '../planning/complete-plan';
import { planTrip, type TripPlanDay, type TripPlanInput } from '../planning/trip-plan';
import { durationKey, resolveRequest, type AssistantItem } from './request';

const HOTEL: LatLng = { latitude: 40.7577, longitude: -73.9857 };
const MOMA: LatLng = { latitude: 40.7614, longitude: -73.9776 };
const MET: LatLng = { latitude: 40.7794, longitude: -73.9632 };
const SOHO: LatLng = { latitude: 40.7233, longitude: -74.003 };
const D1 = '2026-11-24';
const D2 = '2026-11-25';
const D3 = '2026-11-26';

const stop = (id: string, location: LatLng, extra: Partial<PlanStop> = {}): PlanStop => ({
  id,
  startTime: null,
  durationMinutes: 120,
  location,
  visited: false,
  ...extra,
});
const day = (id: string, stops: PlanStop[] = []): TripPlanDay => ({
  day: id,
  start: HOTEL,
  stops,
  capacityMinutes: OVERLOADED_MIN,
  available: true,
  dayStart: toMinutes('09:30'),
});
const item = (id: string, name: string, category: PlaceCategory, onDay: string | null): AssistantItem => ({
  id,
  visit: onDay !== null,
  category,
  name,
  day: onDay,
  done: false,
});

// Wednesday (D2) is busy; the Met is starred; dinner has a time.
const base: TripPlanInput = {
  days: [
    day(D1, [stop('moma', MOMA)]),
    day(D2, [
      stop('met', MET, { priority: true, durationMinutes: 240 }),
      stop('mall', SOHO, { durationMinutes: 180 }),
      stop('gallery', SOHO, { durationMinutes: 120 }),
      stop('dinner', MOMA, { startTime: '19:00', durationMinutes: 90 }),
    ]),
    day(D3),
  ],
  wishlist: [stop('shop2', SOHO, { durationMinutes: 60 })],
  windowsOn: () => undefined,
};
const items: AssistantItem[] = [
  item('moma', 'Museum of Modern Art', 'sights', D1),
  item('met', 'The Metropolitan Museum of Art', 'sights', D2),
  item('mall', 'SoHo shops', 'shopping', D2),
  item('gallery', 'Leo Castelli Gallery', 'sights', D2),
  item('dinner', 'Carbone', 'food', D2),
  item('shop2', 'Nike SoHo', 'shopping', null),
];
const proposal = (input: TripPlanInput, choice: Record<string, boolean> = {}) => completePlan(input, planTrip(input), choice);

describe('trip assistant → planner input', () => {
  it('"Make Wednesday less busy": a lower limit for that day, moves say "you asked", starred and timed visits stay', () => {
    const effect = resolveRequest([{ kind: 'lighten', day: D2, maxHours: null }], base, items);
    const wednesday = effect.input.days[1];
    expect(wednesday?.capacityMinutes).toBeLessThan(OVERLOADED_MIN);
    expect(wednesday?.limitedByRequest).toBe(true);
    const plan = proposal(effect.input);
    const moves = plan.chosen.filter((change) => change.fromDay === D2);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((change) => change.why[0]?.kind === 'youAsked')).toBe(true);
    expect(moves.map((change) => change.itemId)).not.toContain('met');
    expect(moves.map((change) => change.itemId)).not.toContain('dinner');
    // Nothing new is added to the day the user wanted lighter.
    expect(plan.chosen.some((change) => change.toDay === D2)).toBe(false);
    expect(effect.notes[0]).toMatchObject({ kind: 'lighten', day: D2, already: false });
  });

  it('"Start every day at 10": suggested times start at 10, your own times never change', () => {
    const effect = resolveRequest([{ kind: 'dayStart', time: '10:00', days: [] }], base, items);
    const plan = proposal(effect.input);
    for (const draft of plan.days) {
      for (const visit of draft.visits) if (visit.time === 'suggested') expect(visit.start).toBeGreaterThanOrEqual(toMinutes('10:00'));
    }
    expect(plan.apply.times.map((time) => time.stopId)).not.toContain('dinner');
    // Days with flexible visits get no "move every time" offer: the dinner keeps its own time.
    expect(effect.shifts).toEqual([]);
  });

  it('"Start every day at 8": earlier than the usual 9:30 works too', () => {
    const effect = resolveRequest([{ kind: 'dayStart', time: '08:00', days: [] }], base, items);
    expect(effect.input.days[0]?.dayStart).toBe(toMinutes('08:00'));
    const first = proposal(effect.input).days[0]?.visits[0];
    expect(first?.time).toBe('suggested');
    expect(first!.start).toBeLessThan(toMinutes('09:30'));
    expect(effect.notes[0]).toMatchObject({ kind: 'dayStart', flexible: 4, shiftDays: 0 });
  });

  it('"Start day one at 16:00 and the rest at 8": 16:00 on the first day, 08:00 on every other day', () => {
    const effect = resolveRequest(
      [
        { kind: 'dayStart', time: '16:00', days: [D1] },
        { kind: 'dayStart', time: '08:00', days: [D2, D3] },
      ],
      base,
      items,
    );
    expect(effect.input.days.map((item) => item.dayStart)).toEqual([toMinutes('16:00'), toMinutes('08:00'), toMinutes('08:00')]);
    const plan = proposal(effect.input);
    expect(plan.days[0]?.visits[0]?.start).toBeGreaterThanOrEqual(toMinutes('16:00'));
    // The free day picks up the moved visits and starts at 08:00, not 16:00.
    expect(plan.days[2]?.visits[0]?.start).toBe(toMinutes('08:00'));
  });

  it('every visit already has a time: says so, and offers to move the whole day (off until chosen, gaps kept)', () => {
    const timed: TripPlanInput = {
      ...base,
      days: [day(D1, [stop('a', MOMA, { startTime: '09:30', durationMinutes: 60 }), stop('b', MET, { startTime: '11:00', durationMinutes: 60 })]), day(D2), day(D3)],
    };
    const effect = resolveRequest([{ kind: 'dayStart', time: '08:00', days: [] }], timed, items);
    expect(effect.notes[0]).toMatchObject({ kind: 'dayStart', flexible: 0, timed: 2, shiftDays: 1 });
    expect(effect.shifts).toEqual([
      { day: D1, minutes: -90, from: '09:30', to: '08:00', stops: [{ id: 'a', from: '09:30', to: '08:00' }, { id: 'b', from: '11:00', to: '09:30' }] },
    ]);
    // Off by default: nothing moves.
    expect(effect.input.days[0]?.stops.map((item) => item.startTime)).toEqual(['09:30', '11:00']);
    const on = resolveRequest([{ kind: 'dayStart', time: '08:00', days: [] }], timed, items, { shiftOn: () => true });
    expect(on.input.days[0]?.stops.map((item) => item.startTime)).toEqual(['08:00', '09:30']);
  });

  it('today, a day is never moved to before now', () => {
    const timed: TripPlanInput = { ...base, days: [day(D1, [stop('a', MOMA, { startTime: '09:30' })]), day(D2), day(D3)] };
    const effect = resolveRequest([{ kind: 'dayStart', time: '06:00', days: [] }], timed, items, { today: D1, nowMinutes: toMinutes('07:00') });
    expect(effect.shifts).toEqual([]);
    expect(effect.input.days[0]?.dayStart).toBe(toMinutes('07:15'));
    expect(effect.notes[0]).toMatchObject({ kind: 'dayStart', flexible: 0, timed: 1, shiftDays: 0 });
  });

  it('"More time for shopping": longer shopping visits and wishlist places, each its own choice', () => {
    const effect = resolveRequest([{ kind: 'moreTime', category: 'shopping', extraMinutes: null }], base, items);
    expect(effect.durations).toEqual([
      { id: 'mall', from: 180, to: 270 },
      { id: 'shop2', from: 60, to: 90 },
    ]);
    expect(effect.input.days[1]?.stops.find((item) => item.id === 'mall')?.durationMinutes).toBe(270);
    const off = resolveRequest([{ kind: 'moreTime', category: 'shopping', extraMinutes: null }], base, items, {
      durationOn: (id) => id !== 'mall',
    });
    expect(off.input.days[1]?.stops.find((item) => item.id === 'mall')?.durationMinutes).toBe(180);
    expect(durationKey('mall')).toBe('duration:mall');
  });

  it('"Keep my starred places fixed": starred visits get no new time, place or order; "keep everything" freezes every visit', () => {
    const starred = resolveRequest([{ kind: 'keepFixed', what: 'starred' }], base, items);
    expect(starred.input.days[1]?.stops.find((item) => item.id === 'met')?.pinned).toBe(true);
    expect(proposal(starred.input).apply.times.map((time) => time.stopId)).not.toContain('met');
    const all = resolveRequest(
      [
        { kind: 'keepFixed', what: 'all' },
        { kind: 'lighten', day: D2, maxHours: 2 },
      ],
      base,
      items,
    );
    const plan = proposal(all.input);
    expect(plan.chosen.filter((change) => change.kind === 'move')).toEqual([]);
    expect(plan.apply.times.filter((time) => ['moma', 'met', 'mall', 'gallery'].includes(time.stopId))).toEqual([]);
  });

  it('"Move the museum visit to another day": asks which museum, then moves the one picked', () => {
    const move = { kind: 'moveVisit' as const, target: { ref: null, category: 'sights' as const, text: 'museum', day: null }, toDay: null };
    const ask = resolveRequest([move], base, items);
    expect(ask.pick).toEqual({ index: 0, options: ['moma', 'met'] });
    expect(ask.input.moveRequests).toEqual([]);
    const picked = resolveRequest([move], base, items, { picks: { 0: 'met' } });
    expect(picked.input.moveRequests).toEqual([{ stopId: 'met', toDay: null }]);
    const plan = proposal(picked.input);
    // The user asked, so even the starred Met moves, to a day with room.
    expect(plan.chosen.find((change) => change.itemId === 'met')).toMatchObject({ cause: 'request', fromDay: D2, defaultOn: true });
  });

  it('a named day and a missing match', () => {
    const named = resolveRequest(
      [{ kind: 'moveVisit', target: { ref: null, category: null, text: 'Carbone', day: null }, toDay: D3 }],
      base,
      items,
    );
    expect(proposal(named.input).chosen.find((change) => change.itemId === 'dinner')).toMatchObject({ toDay: D3, cause: 'request' });
    const none = resolveRequest([{ kind: 'moveVisit', target: { ref: null, category: null, text: 'zoo', day: null }, toDay: null }], base, items);
    expect(none.notes).toEqual([{ kind: 'moveNotFound', text: 'zoo' }]);
  });

  it('AI refs point at visits without names leaving the phone', () => {
    const effect = resolveRequest(
      [{ kind: 'moveVisit', target: { ref: 'v3', category: null, text: null, day: null }, toDay: D1 }],
      base,
      items,
      { refs: new Map([['v3', 'gallery']]) },
    );
    expect(effect.input.moveRequests).toEqual([{ stopId: 'gallery', toDay: D1 }]);
  });

  it('"Finish by 6pm" shortens the day and "find dinner nearby" is only a note (no search runs)', () => {
    const effect = resolveRequest(
      [
        { kind: 'dayEnd', time: '18:00', days: [D2] },
        { kind: 'findNearby', category: 'food', query: 'dinner restaurant', day: D2, near: 'dayEnd' },
      ],
      base,
      items,
    );
    expect(effect.input.days[1]?.capacityMinutes).toBe(toMinutes('18:00') - toMinutes('09:30'));
    expect(effect.notes[1]).toEqual({ kind: 'findNearby', category: 'food', query: 'dinner restaurant', day: D2, near: 'dayEnd' });
  });

  describe('running late (catch-up)', () => {
    // Today is D1 at 11:00: the Met (10:00) is behind, lunch (13:00) is still ahead, the shop is done.
    const late: TripPlanInput = {
      ...base,
      days: [
        {
          ...day(D1, [
            stop('shop', SOHO, { startTime: '09:00', visited: true, durationMinutes: 60 }),
            stop('met', MET, { startTime: '10:00', durationMinutes: 120 }),
            stop('lunch', MOMA, { startTime: '13:00', durationMinutes: 60 }),
            stop('walk', MOMA, { durationMinutes: 60 }),
          ]),
          dayStart: toMinutes('11:15'),
        },
        day(D2),
      ],
    };
    const run = (options: Parameters<typeof resolveRequest>[3] = {}) =>
      resolveRequest([{ kind: 'catchUp' }], late, items, { today: D1, nowMinutes: toMinutes('11:00'), ...options });

    it('only visits whose time has passed lose it, stay on today and get a new time from now', () => {
      const effect = run();
      expect(effect.notes).toEqual([{ kind: 'catchUp', day: D1, late: [{ id: 'met', from: '10:00' }] }]);
      const today = effect.input.days[0]?.stops ?? [];
      expect(today.find((item) => item.id === 'met')).toMatchObject({ startTime: null, keepDay: true });
      expect(today.find((item) => item.id === 'lunch')?.startTime).toBe('13:00');
      expect(today.find((item) => item.id === 'shop')?.startTime).toBe('09:00');

      const plan = proposal(effect.input);
      expect(plan.chosen.some((change) => change.itemId === 'met')).toBe(false);
      const met = plan.apply.times.find((time) => time.stopId === 'met');
      expect(met && toMinutes(met.startTime)).toBeGreaterThanOrEqual(toMinutes('11:15'));
      expect(plan.apply.times.some((time) => time.stopId === 'lunch' || time.stopId === 'shop')).toBe(false);
    });

    it('a late visit switched off keeps its time; other days and other times are untouched', () => {
      const effect = run({ catchUpOn: (id) => id !== 'met' });
      expect(effect.input.days[0]?.stops.find((item) => item.id === 'met')?.startTime).toBe('10:00');
      expect(effect.notes[0]).toMatchObject({ kind: 'catchUp', late: [{ id: 'met', from: '10:00' }] });
      expect(proposal(effect.input).apply.times.some((time) => time.stopId === 'met')).toBe(false);
    });

    it('outside a trip day (or without the time now) it only says so', () => {
      expect(run({ today: '2026-12-01' }).notes).toEqual([{ kind: 'catchUpNotToday' }]);
      expect(run({ nowMinutes: null }).notes).toEqual([{ kind: 'catchUpNotToday' }]);
      expect(run({ today: '2026-12-01' }).input.days[0]?.stops.find((item) => item.id === 'met')?.startTime).toBe('10:00');
    });
  });

  describe('live changes', () => {
    // Today is D1 at 11:00: at MoMA since 10:00 (2 h), then the Met at 13:00, a flexible gallery, dinner at 19:00.
    const live: TripPlanInput = {
      ...base,
      days: [
        {
          ...day(D1, [
            stop('moma', MOMA, { startTime: '10:00', durationMinutes: 120, pinned: true }),
            stop('met', MET, { startTime: '13:00', durationMinutes: 180 }),
            stop('gallery', SOHO, { durationMinutes: 120 }),
            stop('dinner', MOMA, { startTime: '19:00', durationMinutes: 90 }),
          ]),
          dayStart: toMinutes('11:15'),
        },
        day(D2),
      ],
    };
    const liveItems: AssistantItem[] = [
      item('moma', 'Museum of Modern Art', 'sights', D1),
      item('met', 'The Metropolitan Museum of Art', 'sights', D1),
      item('gallery', 'Leo Castelli Gallery', 'sights', D1),
      item('dinner', 'Carbone', 'food', D1),
    ];
    const options = { today: D1, nowMinutes: toMinutes('11:00') };
    const stopsOf = (input: TripPlanInput) => input.days[0]?.stops ?? [];

    it('skip: proposed on its own switch; off keeps it', () => {
      const effect = resolveRequest([{ kind: 'skipVisit', target: { ref: null, category: null, text: 'Met', day: null } }], live, liveItems, options);
      expect(effect.skips).toEqual(['met']);
      expect(effect.notes).toEqual([{ kind: 'skip', id: 'met' }]);
      expect(stopsOf(effect.input).some((item) => item.id === 'met')).toBe(false);
      const kept = resolveRequest([{ kind: 'skipVisit', target: { ref: null, category: null, text: 'Met', day: null } }], live, liveItems, { ...options, skipOn: () => false });
      expect(stopsOf(kept.input).some((item) => item.id === 'met')).toBe(true);
    });

    it('closed (no name = the next one): skip it, with where and what kind for an alternative', () => {
      const effect = resolveRequest([{ kind: 'closedVisit', target: null }], live, liveItems, options);
      expect(effect.notes).toEqual([{ kind: 'closed', id: 'met', day: D1, category: 'sights', location: MET }]);
      expect(effect.skips).toEqual(['met']);
    });

    it('staying longer (no name = the one happening now): longer, and later timed visits it now overlaps get new times', () => {
      const effect = resolveRequest([{ kind: 'extendVisit', target: null, extraMinutes: 90 }], live, liveItems, options);
      expect(effect.durations).toEqual([{ id: 'moma', from: 120, to: 210 }]);
      expect(effect.notes[0]).toEqual({ kind: 'longer', id: 'moma', extra: 90, until: toMinutes('13:30') });
      expect(effect.notes[1]).toEqual({ kind: 'catchUp', day: D1, late: [{ id: 'met', from: '13:00' }] });
      const met = stopsOf(effect.input).find((item) => item.id === 'met');
      expect(met).toMatchObject({ startTime: null, keepDay: true });
      // Dinner at 19:00 is still reachable: its time stays.
      expect(stopsOf(effect.input).find((item) => item.id === 'dinner')?.startTime).toBe('19:00');
      // Never moved or removed; the plan only re-times what's left.
      const plan = proposal(effect.input);
      expect(plan.chosen.some((change) => change.itemId === 'moma' || change.itemId === 'met')).toBe(false);
    });

    it('still too full after a live change: long flexible visits could be shorter (off unless chosen)', () => {
      const full: TripPlanInput = { ...live, days: [{ ...(live.days[0] as TripPlanDay), capacityMinutes: 300 }, day(D2)] };
      const effect = resolveRequest([{ kind: 'extendVisit', target: null, extraMinutes: 60 }], full, liveItems, options);
      expect(effect.shorten).toEqual([{ id: 'gallery', from: 120, to: 90 }]);
      expect(stopsOf(effect.input).find((item) => item.id === 'gallery')?.durationMinutes).toBe(120);
      const chosen = resolveRequest([{ kind: 'extendVisit', target: null, extraMinutes: 60 }], full, liveItems, { ...options, shortenOn: () => true });
      expect(stopsOf(chosen.input).find((item) => item.id === 'gallery')?.durationMinutes).toBe(90);
    });

    it('without today, "the one happening now" says it only works on a trip day', () => {
      expect(resolveRequest([{ kind: 'closedVisit', target: null }], live, liveItems, { today: null, nowMinutes: null }).notes).toEqual([{ kind: 'liveNotToday' }]);
    });
  });
});
