import { describe, expect, it } from 'vitest';
import type { CompletePlan } from './complete-plan';
import { loadState, planOutcome } from './plan-summary';

describe('loadState', () => {
    it('shows free time on a day with room', () => {
        expect(loadState(60, 660)).toEqual({ share: 60 / 660, freeMinutes: 600, overMinutes: 0 });
    });

    it('caps the bar and reports how far over a full day is', () => {
        expect(loadState(780, 660)).toEqual({ share: 1, freeMinutes: 0, overMinutes: 120 });
    });

    it('handles a day without capacity (already over)', () => {
        expect(loadState(0, 0)).toEqual({ share: 0, freeMinutes: 0, overMinutes: 0 });
        expect(loadState(30, 0).share).toBe(1);
    });
});

describe('planOutcome', () => {
    const plan = (count: number, adds: number, moves: number) =>
        ({
            count,
            apply: {
                adds: Array.from({ length: adds }, (_, i) => ({ tripPlaceId: `a${i}`, day: 'd', startTime: null })),
                moves: Array.from({ length: moves }, (_, i) => ({ stopId: `m${i}`, day: 'd' })),
                times: [],
                orders: [],
            },
        }) as unknown as CompletePlan;

    it('groups adds, moves and the rest (times, orders, lengths), matching the total Apply makes', () => {
        expect(planOutcome(plan(7, 2, 1), { durations: 1, skips: 1 })).toEqual({ added: 2, moved: 1, updated: 5, skipped: 1, total: 9 });
    });

    it('nothing to do', () => {
        expect(planOutcome(plan(0, 0, 0), { durations: 0, skips: 0 }).total).toBe(0);
    });
});
