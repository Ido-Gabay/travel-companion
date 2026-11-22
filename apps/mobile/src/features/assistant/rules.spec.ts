import { describe, expect, it } from 'vitest';
import { readRequest } from './rules';

// Mon Nov 23 … Sun Nov 29, and a two-week trip for ambiguous weekdays.
const WEEK = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
const TODAY = '2026-11-23';
const read = (message: string, days = WEEK) => readRequest(message, days, TODAY);
const plan = (message: string, days = WEEK) => {
  const result = read(message, days);
  return result?.kind === 'plan' ? result.instructions : null;
};

describe('trip assistant rules: English', () => {
  it('reads the six example requests', () => {
    expect(plan('Make Wednesday less busy.')).toEqual([{ kind: 'lighten', day: '2026-11-25', maxHours: null }]);
    expect(plan('Start every day at 10:00.')).toEqual([{ kind: 'dayStart', time: '10:00', days: [] }]);
    expect(plan('Give me more time for shopping.')).toEqual([{ kind: 'moreTime', category: 'shopping', extraMinutes: null }]);
    expect(plan('Keep all my starred places fixed.')).toEqual([{ kind: 'keepFixed', what: 'starred' }]);
    expect(plan('Move the museum visit to another day.')).toEqual([
      { kind: 'moveVisit', target: { ref: null, category: 'sights', text: 'museum', day: null }, toDay: null },
    ]);
    expect(plan("Find a dinner place near where I'll finish the day.")).toEqual([
      { kind: 'findNearby', category: 'food', query: 'dinner restaurant', day: null, near: 'dayEnd' },
    ]);
  });

  it('reads several requests in one message, amounts and named days', () => {
    expect(plan('Make Friday lighter, 6 hours max and finish by 9')).toBeNull(); // "6 hours max" alone isn't a request: AI reads it
    expect(plan('Keep Saturday free and start at 9:30 am')).toEqual([
      { kind: 'lighten', day: '2026-11-28', maxHours: 0 },
      { kind: 'dayStart', time: '09:30', days: [] },
    ]);
    expect(plan('Finish by 9 on Thursday')).toEqual([{ kind: 'dayEnd', time: '21:00', days: ['2026-11-26'] }]);
    expect(plan('Move MoMA to Friday')).toEqual([
      { kind: 'moveVisit', target: { ref: null, category: null, text: 'MoMA', day: null }, toDay: '2026-11-27' },
    ]);
  });

  it('day one and the rest get their own start (and end) times', () => {
    const rest = WEEK.slice(1);
    const split = [
      { kind: 'dayStart', time: '16:00', days: ['2026-11-23'] },
      { kind: 'dayStart', time: '08:00', days: rest },
    ];
    expect(plan('Start day one at 16:00 and the rest at 8:00')).toEqual(split);
    expect(plan('Start the first day at 4pm, the other days at 8am')).toEqual(split);
    expect(plan('Start at 16:00 on day 1 and the rest at 8')).toEqual(split);
    expect(plan('להתחיל את היום הראשון ב-16:00 ואת שאר הימים ב-8')).toEqual(split);
    expect(plan('Start day one at 16:00')).toEqual([{ kind: 'dayStart', time: '16:00', days: ['2026-11-23'] }]);
    expect(plan('Finish day one by 9 and the rest by 10')).toEqual([
      { kind: 'dayEnd', time: '21:00', days: ['2026-11-23'] },
      { kind: 'dayEnd', time: '22:00', days: rest },
    ]);
    // A time it can't read goes to the AI instead of being guessed.
    expect(plan('Start day one at 16:00 and the rest early')).toBeNull();
    // Unchanged: no first day named.
    expect(plan('Start every day at 8')).toEqual([{ kind: 'dayStart', time: '08:00', days: [] }]);
  });

  it('asks which day when a weekday is in the trip twice, and uses the answer', () => {
    const twoWeeks = [...WEEK, '2026-11-30', '2026-12-01', '2026-12-02'];
    expect(read('Make Wednesday less busy', twoWeeks)).toEqual({ kind: 'pickDay', weekday: 3, days: ['2026-11-25', '2026-12-02'] });
    const picked = readRequest('Make Wednesday less busy', twoWeeks, TODAY, { 3: '2026-12-02' });
    expect(picked).toEqual({ kind: 'plan', instructions: [{ kind: 'lighten', day: '2026-12-02', maxHours: null }] });
  });

  it("leaves what it can't read to the AI", () => {
    expect(read('Can we see more of Brooklyn?')).toBeNull();
    expect(read('Make it less busy')).toBeNull(); // which day?
  });

  it('running late: catch up from now, also with another request', () => {
    expect(plan("I'm running late")).toEqual([{ kind: 'catchUp' }]);
    expect(plan('We overslept')).toEqual([{ kind: 'catchUp' }]);
    expect(plan('Replan the rest of today')).toEqual([{ kind: 'catchUp' }]);
    expect(plan("We're late, finish by 6")).toEqual([{ kind: 'catchUp' }, { kind: 'dayEnd', time: '18:00', days: [] }]);
    expect(plan('Finish late on Friday')).toBeNull();
  });
});

describe('trip assistant rules: places to find', () => {
  const place = (extra: object) => ({ kind: 'findPlace', query: null, category: null, area: null, nearPlanned: false, nearHere: false, day: null, intent: 'add', ...extra });

  it('a named place, with "where is it" and "which day" as follow-ups', () => {
    expect(plan('I also want to visit SUMMIT One Vanderbilt. Where is it, and which day would be best to add it?')).toEqual([
      place({ query: 'SUMMIT One Vanderbilt' }),
    ]);
    expect(plan('I also want to visit SUMMIT One Vanderbilt. Where is it?')).toEqual([place({ query: 'SUMMIT One Vanderbilt' })]);
    expect(plan('Where is the Frick?')).toEqual([place({ query: 'the Frick', intent: 'locate' })]);
    expect(plan('Where is the Frick? Can we add it on Friday?')).toEqual([place({ query: 'the Frick', day: '2026-11-27' })]);
    expect(plan('We’d like to visit Carbone')).toEqual([place({ query: 'Carbone', category: null })]);
  });

  it('a kind of place, an area, a day, or near what is planned', () => {
    expect(plan('Add another shopping stop near SoHo')).toEqual([place({ query: 'shopping', category: 'shopping', area: 'SoHo' })]);
    expect(plan('I want to visit a museum. Which day makes the most sense?')).toEqual([place({ query: 'museum', category: 'sights' })]);
    expect(plan('Can we fit this restaurant into Thursday?')).toEqual([place({ category: 'food', day: '2026-11-26' })]);
    expect(plan("Find something interesting near the places we're already visiting")).toEqual([
      place({ query: 'tourist attractions', category: 'sights', nearPlanned: true }),
    ]);
  });

  it('in Hebrew', () => {
    expect(plan('אני רוצה גם לבקר ב-SUMMIT One Vanderbilt')).toEqual([place({ query: 'SUMMIT One Vanderbilt' })]);
    expect(plan('איפה נמצא המוזיאון של פריק?')).toEqual([place({ query: 'המוזיאון של פריק', category: 'sights', intent: 'locate' })]);
    expect(plan('תוסיף עוד מסעדה ליד סוהו ביום חמישי')).toEqual([
      place({ query: 'מסעדה', category: 'food', area: 'סוהו', day: '2026-11-26' }),
    ]);
  });

  it('keeps the older requests as they were', () => {
    expect(plan("Find a dinner place near where I'll finish the day.")).toEqual([
      { kind: 'findNearby', category: 'food', query: 'dinner restaurant', day: null, near: 'dayEnd' },
    ]);
    expect(read('Can we see more of Brooklyn?')).toBeNull();
    expect(read('Where is it?')).toBeNull();
  });
});

describe('trip assistant rules: live changes', () => {
  const target = (text: string, category: string | null = null) => ({ ref: null, category, text, day: null });

  it('closed, skip, staying longer and something nearby, in English', () => {
    expect(plan('The Frick is closed')).toEqual([{ kind: 'closedVisit', target: target('Frick') }]);
    expect(plan("It's closed")).toEqual([{ kind: 'closedVisit', target: null }]);
    expect(plan("Let's skip the Met")).toEqual([{ kind: 'skipVisit', target: target('Met') }]);
    expect(plan('Skip this one')).toEqual([{ kind: 'skipVisit', target: null }]);
    expect(plan('We’re staying another hour at MoMA')).toEqual([{ kind: 'extendVisit', target: target('MoMA'), extraMinutes: 60 }]);
    expect(plan('This is taking longer than expected')).toEqual([{ kind: 'extendVisit', target: null, extraMinutes: null }]);
    expect(plan('Anything interesting nearby?')).toEqual([
      { kind: 'findPlace', query: 'tourist attractions', category: 'sights', area: null, nearPlanned: false, nearHere: true, day: null, intent: 'add' },
    ]);
    expect(plan('Find a coffee place near me')?.[0]).toMatchObject({ kind: 'findPlace', category: 'coffee', nearHere: true, area: null });
  });

  it('in Hebrew', () => {
    expect(plan('המוזיאון סגור היום')).toEqual([{ kind: 'closedVisit', target: target('המוזיאון', 'sights') }]);
    expect(plan('בוא נדלג על המט')).toEqual([{ kind: 'skipVisit', target: target('המט') }]);
    expect(plan('נשארים עוד שעה במוזיאון')).toEqual([{ kind: 'extendVisit', target: target('מוזיאון', 'sights'), extraMinutes: 60 }]);
    expect(plan('משהו מעניין בסביבה?')?.[0]).toMatchObject({ kind: 'findPlace', nearHere: true });
  });

  it('"more time for shopping" is still about every shopping visit', () => {
    expect(plan('Give me more time for shopping')).toEqual([{ kind: 'moreTime', category: 'shopping', extraMinutes: null }]);
  });
});

describe('trip assistant rules: Hebrew', () => {
  it('reads the example requests in Hebrew', () => {
    expect(plan('תעשה את יום רביעי פחות עמוס')).toEqual([{ kind: 'lighten', day: '2026-11-25', maxHours: null }]);
    expect(plan('להתחיל כל יום ב-10:00')).toEqual([{ kind: 'dayStart', time: '10:00', days: [] }]);
    expect(plan('תן לי יותר זמן לקניות')).toEqual([{ kind: 'moreTime', category: 'shopping', extraMinutes: null }]);
    expect(plan('תשאיר את כל המקומות המסומנים בכוכב קבועים')).toEqual([{ kind: 'keepFixed', what: 'starred' }]);
    expect(plan('תעביר את המוזיאון ליום אחר')).toEqual([
      { kind: 'moveVisit', target: { ref: null, category: 'sights', text: 'מוזיאון', day: null }, toDay: null },
    ]);
    expect(plan('תמצא מקום לארוחת ערב ליד איפה שאני מסיים את היום')).toEqual([
      { kind: 'findNearby', category: 'food', query: 'dinner restaurant', day: null, near: 'dayEnd' },
    ]);
  });

  it('reads Hebrew day names and several requests', () => {
    expect(plan('שבת יום חופשי וגם להתחיל ב-9')).toEqual([
      { kind: 'lighten', day: '2026-11-28', maxHours: 0 },
      { kind: 'dayStart', time: '09:00', days: [] },
    ]);
    expect(plan('מחר פחות עמוס')).toEqual([{ kind: 'lighten', day: '2026-11-24', maxHours: null }]);
  });

  it('running late in Hebrew', () => {
    expect(plan('אני מאחר')).toEqual([{ kind: 'catchUp' }]);
    expect(plan('התעכבנו, לסיים עד 18:00')).toEqual([{ kind: 'catchUp' }, { kind: 'dayEnd', time: '18:00', days: [] }]);
    expect(plan('תתכנן מחדש את שאר היום')).toEqual([{ kind: 'catchUp' }]);
  });
});
