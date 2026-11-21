import { describe, expect, it } from 'vitest';
import { addMonths, inRange, monthGrid, pickDay, tripLength } from './date-range';

describe('trip date range', () => {
    it('November 2026: starts on a Sunday, 30 days, whole weeks', () => {
        const weeks = monthGrid(2026, 10);
        expect(weeks[0]?.[0]).toBe('2026-11-01');
        expect(weeks.flat().filter(Boolean)).toHaveLength(30);
        expect(weeks.every((week) => week.length === 7)).toBe(true);
        // February 2027 starts on a Monday: one empty cell first.
        expect(monthGrid(2027, 1)[0]?.slice(0, 2)).toEqual([null, '2027-02-01']);
    });

    it('months roll over years both ways', () => {
        expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
        expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    });

    it('tap to start, tap to end; never an end before the start', () => {
        let range = pickDay({ start: null, end: null }, '2026-11-23');
        expect(range).toEqual({ start: '2026-11-23', end: null });
        range = pickDay(range, '2026-11-29');
        expect(range).toEqual({ start: '2026-11-23', end: '2026-11-29' });
        // A full range: the next tap starts over.
        expect(pickDay(range, '2026-12-01')).toEqual({ start: '2026-12-01', end: null });
        // Before the start: that becomes the start.
        expect(pickDay({ start: '2026-11-23', end: null }, '2026-11-20')).toEqual({ start: '2026-11-20', end: null });
        // The same day twice: a one-day trip.
        expect(pickDay({ start: '2026-11-23', end: null }, '2026-11-23')).toEqual({ start: '2026-11-23', end: '2026-11-23' });
    });

    it('length counts both ends; in-range excludes them', () => {
        expect(tripLength('2026-11-23', '2026-11-29')).toBe(7);
        expect(tripLength('2026-12-30', '2027-01-02')).toBe(4);
        expect(inRange('2026-11-25', { start: '2026-11-23', end: '2026-11-29' })).toBe(true);
        expect(inRange('2026-11-23', { start: '2026-11-23', end: '2026-11-29' })).toBe(false);
    });
});
