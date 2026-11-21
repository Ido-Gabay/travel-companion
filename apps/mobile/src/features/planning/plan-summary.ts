import type { CompletePlan } from './complete-plan';

/** A day's load against its capacity, for the load bar. */
export interface LoadState {
    /** Used share of the day, 0–1 (capped). */
    share: number;
    freeMinutes: number;
    overMinutes: number;
}

export function loadState(usedMinutes: number, capacityMinutes: number): LoadState {
    const used = Math.max(0, usedMinutes);
    const capacity = Math.max(0, capacityMinutes);
    return {
        share: capacity === 0 ? (used > 0 ? 1 : 0) : Math.min(1, used / capacity),
        freeMinutes: Math.max(0, capacity - used),
        overMinutes: Math.max(0, used - capacity),
    };
}

/** What Apply will do, grouped the way the footer says it. */
export interface PlanOutcome {
    added: number;
    moved: number;
    /** Times, day orders and visit lengths. */
    updated: number;
    skipped: number;
    total: number;
}

export function planOutcome(complete: CompletePlan, extra: { durations: number; skips: number }): PlanOutcome {
    const added = complete.apply.adds.length;
    const moved = complete.apply.moves.length;
    const updated = Math.max(0, complete.count - added - moved) + extra.durations;
    return { added, moved, updated, skipped: extra.skips, total: added + moved + updated + extra.skips };
}
