import type { AssistantInstruction, PlaceCategory } from '@travel-companion/shared';

/**
 * D1 trip assistant, first pass on the phone (free, offline, instant): the
 * common requests in English and Hebrew, by pattern. Anything it can't read
 * with confidence returns null and goes to the AI (when available). It never
 * guesses: a weekday that matches two trip days asks which one.
 */

export type RulesResult =
  | { kind: 'plan'; instructions: AssistantInstruction[] }
  | { kind: 'pickDay'; weekday: number; days: string[] }
  | null;

const WEEKDAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const addDays = (day: string, count: number) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};

const CATEGORY_WORDS: [PlaceCategory, RegExp][] = [
  ['shopping', /shop|store|mall|market|קניות|חנויות|חנות|קניון|שוק/i],
  ['sights', /museum|galler|sight|attraction|exhibit|מוזיאו|גלרי|אטרקצי|תערוכ|אתר/i],
  ['coffee', /coffee|cafe|café|קפה/i],
  ['nightlife', /\bbars?\b|nightlife|drinks|cocktail|ברים|\bבר\b|חיי לילה|קוקטייל/i],
  ['outdoors', /\bparks?\b|outdoor|nature|garden|פארק|טבע|גן/i],
  ['food', /food|restaurant|dinner|lunch|breakfast|brunch|eat|אוכל|מסעד|ארוחת|לאכול/i],
];

export function categoryIn(text: string): PlaceCategory | null {
  return CATEGORY_WORDS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

const NEARBY_QUERY: Record<PlaceCategory, string> = {
  food: 'restaurant',
  coffee: 'cafe',
  sights: 'attractions',
  shopping: 'shops',
  nightlife: 'bar',
  outdoors: 'park',
  stay: 'hotel',
  other: 'places',
};

/** "10", "10:30", "9pm", "21:00". `evening` reads a bare 1–11 as p.m. ("finish by 9"). */
function timeIn(text: string, evening: boolean): string | null {
  const match = /(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|בבוקר|בערב|אחה"צ)?/i.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const suffix = (match[3] ?? '').toLowerCase();
  if (/p|ערב|אחה/.test(suffix) && hour < 12) hour += 12;
  else if (/a|בוקר/.test(suffix) && hour === 12) hour = 0;
  else if (!suffix && evening && hour >= 1 && hour <= 11) hour += 12;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

interface DayRead {
  /** Days named in the clause (resolved to trip days). */
  days: string[];
  every: boolean;
  /** A weekday matching more than one trip day. */
  ambiguous: { weekday: number; days: string[] } | null;
  /** "another day" / "יום אחר". */
  other: boolean;
}

function daysIn(text: string, tripDays: readonly string[], today: string | null, picks: Picks): DayRead {
  const lower = text.toLowerCase();
  const read: DayRead = { days: [], every: false, ambiguous: null, other: false };
  if (/every ?day|each day|all (the )?days|every morning|daily|כל יום|כל הימים|כל בוקר|בכל יום/.test(lower)) read.every = true;
  if (/another day|other day|different day|later day|יום אחר|ליום אחר|יום אחֵר/.test(lower)) read.other = true;
  const push = (day: string | null) => {
    if (day && tripDays.includes(day) && !read.days.includes(day)) read.days.push(day);
  };
  // "היום" is also "the day" ("לסיים את היום"): only on its own.
  if (today && (/\btoday\b/.test(lower) || (/(^|\s)היום/.test(text) && !/(את|של|סוף|כל|במשך)\s+היום/.test(text)))) push(today);
  if (today && /tomorrow|מחר/.test(lower)) push(addDays(today, 1));
  for (const iso of lower.match(/\d{4}-\d{2}-\d{2}/g) ?? []) push(iso);
  const weekdays: number[] = [];
  WEEKDAYS_EN.forEach((name, index) => {
    if (new RegExp(`\\b${name}s?\\b`).test(lower)) weekdays.push(index);
  });
  WEEKDAYS_HE.forEach((name, index) => {
    // "שני" alone also means "second": only with יום / ביום / ב.
    const pattern = index === 1 ? `(?:יום|ביום|ליום)\\s*${name}` : `(?:יום\\s*|ביום\\s*|ליום\\s*|ב|ל)?${name}`;
    if (new RegExp(`(^|\\s)${pattern}(?=$|\\s|[.,?!])`).test(text)) weekdays.push(index);
  });
  for (const weekday of weekdays) {
    const matches = tripDays.filter((day) => weekdayOf(day) === weekday && (!today || day >= today));
    if (matches.length === 1) push(matches[0] ?? null);
    else if (picks[weekday]) push(picks[weekday] ?? null);
    else if (matches.length > 1) read.ambiguous = { weekday, days: matches };
  }
  return read;
}

/** The user's answer to "which Wednesday?": weekday to day. */
export type Picks = Readonly<Record<number, string>>;

type Clause =
  | { instruction: AssistantInstruction }
  /** One clause that sets several days differently ("day one at 16, the rest at 8"). */
  | { instructions: AssistantInstruction[] }
  | { pickDay: { weekday: number; days: string[] } }
  /** "Where is it?" / "which day is best?" about the place named just before. */
  | { followUp: 'locate' | 'add' }
  | null;

type FindPlace = Extract<AssistantInstruction, { kind: 'findPlace' }>;

const NEAR_HERE =
  /\b(?:nearby|near me|near here|around here|around me|close by|close to me|within walking distance)\b|בסביבה|לידי|קרוב אליי|קרוב לכאן|באזור שלי|פה ליד/i;
const CLOSED_EN =
  /^(?:(?:it|this|that|this place)(?:'s| is)|(?:the\s+)?(.+?)\s+(?:is|are|was|'s|seems|looks)(?: actually)?)\s+(?:closed|shut|not open|unavailable|sold out|fully booked)\b/i;
const CLOSED_HE = /^(?:(?:זה|המקום)\s+)?(.*?)\s*(?:סגור|סגורה|סגורים|לא פתוח|לא פתוחה|לא זמין|לא זמינה)(?:\s+(?:היום|עכשיו))?\s*[.!?]?$/;
const SKIP_EN =
  /^(?:let'?s |we(?:'ll| will| want to| wanna| should)? |i(?:'ll| will| want to| wanna)? |please |can we )?skip\s+(?:the\s+)?(.+?)(?:\s+(?:today|for now|this time))?\s*[.!?]?$/i;
const SKIP_HE = /(?:לדלג|נדלג|תדלג|דלג|מדלגים)\s+(?:על\s+)?(.+?)\s*[.!?]?$/;
const EXTEND_EN =
  /(?:staying|stay|stayed|spend(?:ing)?|need|want|take|taking)\s+(?:a bit |a little |much )?(?:longer|more time|extra time|another\s+(?:\d+\s*(?:min(?:ute)?s?|hours?)|hour|half(?: an)? hour))(?:\s+(?:at|in)\s+(?:the\s+)?(.+?))?\s*[.!?]?$|taking (?:much |a lot |way )?longer(?: than (?:expected|planned))?(?:\s+(?:at|in)\s+(?:the\s+)?(.+?))?\s*[.!?]?$|running over(?:\s+(?:at|in)\s+(?:the\s+)?(.+?))?\s*[.!?]?$/i;
const EXTEND_HE =
  /(?:נשאר|נשארים|נשארת|נישאר|להישאר|נשארנו)\s+(?:עוד|יותר זמן|יותר|קצת יותר)(?:\s+(?:זמן|שעה|חצי שעה|\d+\s*דקות))?(?:\s+ב-?(.+?))?\s*[.!?]?$|לוקח (?:לנו )?יותר זמן(?: ממה שחשבנו| מהמתוכנן)?(?:\s+ב-?(.+?))?\s*[.!?]?$/;
const HERE_WORDS = /^(?:it|this|that|here|this one|this place|זה|כאן|פה|המקום הזה)?$/i;

/** The visit a live request names ("the Met"), or null for the one happening now / next. */
function liveTarget(words: string | undefined): { ref: null; category: PlaceCategory | null; text: string | null; day: null } | null {
  const cleaned = (words ?? '').replace(/\s+(?:today|now|right now|היום|עכשיו)$/i, '').replace(/^(?:the|our|my)\s+/i, '').trim();
  if (HERE_WORDS.test(cleaned)) return null;
  return { ref: null, category: categoryIn(cleaned), text: cleaned.slice(0, 80), day: null };
}

function extraMinutesIn(text: string): number | null {
  const minutes = /(\d+)\s*(?:min|minutes|mins|דקות|דק)/i.exec(text);
  if (minutes) return Math.max(10, Math.min(240, Number(minutes[1])));
  const hours = /(\d+)\s*(?:hours?|שעות)/i.exec(text);
  if (hours) return Math.max(10, Math.min(240, Number(hours[1]) * 60));
  if (/half(?: an)? hour|חצי שעה/i.test(text)) return 30;
  if (/(?:an|another|one more) hour|עוד שעה/i.test(text)) return 60;
  return null;
}

const NEAR_PLANNED =
  /near (?:the |all the )?(?:places|stops|things|spots) (?:we(?:'re| are| will be)|i(?:'m| am| will be)) (?:already )?(?:visiting|seeing|going to)|near (?:our|my) (?:plan|itinerary|visits)|ליד המקומות ש|ליד מה שכבר|קרוב למקומות ש/i;
const LOCATE_EN = /^(?:so |and )?(?:where(?:'s| is| are)|show me where)\s+(.+?)\s*\??$/i;
const LOCATE_HE = /^(?:ו?איפה|היכן)(?:\s+(?:נמצא|נמצאת|נמצאים))?\s+(.+?)\s*\??$/;
const ADD_EN =
  /\b(?:i|we)(?: also| really| still)?(?: want| would like|'d like| wanna) to (?:visit|see|go to|check out|add)\s+(.+?)\s*[?.!]?$|\b(?:can|could) (?:we|you|i) (?:also )?(?:fit|add|squeeze|include|plan)(?: in)?\s+(.+?)\s*[?.!]?$|^(?:please )?(?:add|plan in|fit in|include)\s+(.+?)\s*[?.!]?$|^let'?s (?:also )?(?:visit|add|see)\s+(.+?)\s*[?.!]?$|^(?:find|suggest|recommend|look for)\s+(.+?)\s*[?.!]?$/i;
const ADD_HE =
  /(?:אני|אנחנו|הייתי|היינו)\s+(?:גם\s+)?(?:רוצה|רוצים|רוצות)\s+(?:גם\s+)?(?:לבקר|ללכת|לראות|להגיע|להוסיף)\s+(.+?)\s*[?.!]?$|(?:^|\s)(?:תוסיף|תוסיפי|להוסיף|תכניס|להכניס|אפשר להכניס|אפשר להוסיף|תמצא|למצוא|תציע)\s+(?:גם\s+)?(.+?)\s*[?.!]?$|בא לי\s+(?:גם\s+)?(?:לבקר|ללכת|לראות)\s+(.+?)\s*[?.!]?$/;
/** Words that describe a kind of place rather than name one. */
const GENERIC =
  /^(?:(?:a|an|another|one more|some|more|any|other|good|nice|interesting|cool|fun|new|local|famous|great|stop|place|places|spot|thing|something|anything|visit|museum|museums|gallery|galleries|restaurant|restaurants|cafe|cafes|coffee|bar|bars|park|parks|shop|shops|shopping|store|stores|market|attraction|attractions|sight|sights|lunch|dinner|breakfast|brunch|food|exhibit|exhibition|עוד|איזה|מקום|מקומות|משהו|מעניין|מעניינים|טוב|נחמד|מוזיאון|מוזיאונים|במוזיאון|למוזיאון|גלריה|מסעדה|מסעדות|במסעדה|למסעדה|בית|קפה|בר|ברים|פארק|חנות|חנויות|קניות|שוק|אטרקציה|אטרקציות|ארוחת|ערב|צהריים|בוקר|אוכל|תחנת|תערוכה)(?:\s+|$))+$/i;
const FILLER = /^(?:a|an|another|one more|some|more|any|other|good|nice|cool|fun|new|great|עוד|איזה)\s+|\s+(?:stop|place|spot|visit)$/gi;
const SOMETHING = /^(?:something|anything|places?|stops?|משהו|מקום|מקומות)(?:\s+(?:interesting|fun|cool|nice|new|מעניין|מעניינים|נחמד))?$/i;
const THIS_PLACE = /^(?:this|that|the same|it)\b|^(?:המקום|המסעדה|המוזיאון|החנות|הגלריה|הבר|הפארק)\s+(?:הזה|הזאת|הזו)$|^(?:זה|אותו|אותה)$/i;

/** Takes "on Thursday", "into tomorrow", "ביום חמישי", "near SoHo"… out of the place words. */
function placeWords(text: string): { words: string; area: string | null } {
  let words = text.replace(/[?.!]+$/, '').trim();
  words = words.replace(/\s+(?:to|into|in|on|for)\s+(?:the|our|my)\s+(?:trip|plan|itinerary|schedule)\b/gi, '');
  const dayWords = `(?:${WEEKDAYS_EN.join('|')})s?|today|tomorrow|\\d{4}-\\d{2}-\\d{2}`;
  words = words.replace(new RegExp(`\\s*,?\\s*(?:on|into|to|for|in)?\\s*(?:the\\s+)?(?:${dayWords})\\b`, 'gi'), '');
  words = words.replace(new RegExp(`\\s*(?:ל|ב)?(?:יום\\s+)?(?:${WEEKDAYS_HE.join('|')})(?=$|\\s|[?.!,])`, 'g'), '');
  words = words.replace(/\s*(?:ל|ב)?מחר(?=$|\s)/g, '');
  words = words.replace(/[,\s]+(?:which day|what day|where)\b.*$/i, '').replace(/[,\s]+(?:באיזה יום|איזה יום|איפה).*$/, '');
  let area: string | null = null;
  const near =
    /\s+(?:near|around|close to)\s+(.+)$/i.exec(words) ?? /\s+in\s+(\p{Lu}.*)$/u.exec(words) ?? /\s+(?:ליד|באזור|קרוב ל-?)\s*(.+)$/.exec(words);
  if (near) {
    area = (near[1] ?? '').trim() || null;
    words = words.slice(0, near.index).trim();
  }
  // Hebrew "לבקר ב-X" / "לבקר בX" / "את X".
  words = words.replace(/^(?:גם\s+)?(?:את\s+|ב-|ל-|ב(?=[A-Za-z0-9]))/, '').replace(/\s+/g, ' ').trim();
  return { words, area };
}

function readFindPlace(text: string, days: DayRead): FindPlace | { pickDay: { weekday: number; days: string[] } } | null {
  const nearPlanned = NEAR_PLANNED.test(text);
  const nearHere = !nearPlanned && NEAR_HERE.test(text);
  const locate = LOCATE_EN.exec(text) ?? LOCATE_HE.exec(text);
  const add = locate ? null : (ADD_EN.exec(text) ?? ADD_HE.exec(text));
  const match = locate ?? add;
  if (!match) return null;
  const raw = match.slice(1).find((group) => group !== undefined) ?? '';
  const { words, area } = placeWords(nearPlanned ? raw.replace(NEAR_PLANNED, ' ') : nearHere ? raw.replace(NEAR_HERE, ' ') : raw);
  // "Where is it?" alone is a follow-up (see readClause).
  if (locate && /^(?:it|this|that|זה|הוא|היא)$/i.test(words)) return null;
  if (days.ambiguous && days.days.length === 0) return { pickDay: days.ambiguous };
  const unnamed = words.length === 0 || THIS_PLACE.test(words);
  const generic = !unnamed && GENERIC.test(words);
  const category = categoryIn(words) ?? (unnamed ? categoryIn(text) : null);
  const kindWords = words.replace(FILLER, '').trim();
  const kindQuery = !kindWords || SOMETHING.test(kindWords) ? (category && !SOMETHING.test(kindWords) ? NEARBY_QUERY[category] : 'tourist attractions') : kindWords;
  const query = unnamed ? (nearPlanned || nearHere ? (category ? NEARBY_QUERY[category] : 'tourist attractions') : null) : generic ? kindQuery : words;
  return {
    kind: 'findPlace',
    query: query ? query.slice(0, 100) : null,
    category: category ?? (generic || nearPlanned || nearHere ? 'sights' : null),
    area: area?.slice(0, 80) ?? null,
    nearPlanned,
    nearHere,
    day: days.days[0] ?? null,
    intent: locate ? 'locate' : 'add',
  };
}

/** "Day one" / "the first day" and "the rest" / "other days" (Hebrew too; not "יום ראשון", which is Sunday). */
const FIRST_DAY = /\b(?:day\s*(?:one|1)|(?:the\s+)?first\s+day)\b|ב?ה?יום\s+הראשון|ב?יום\s*1(?!\d)/i;
const REST_DAYS =
  /\b(?:(?:all\s+)?the\s+rest(?:\s+of\s+the\s+(?:days|trip))?|(?:all\s+)?(?:the\s+)?other\s+days|(?:the\s+)?remaining\s+days|the\s+others)\b|ב?(?:שאר|יתר)\s+(?:ה)?ימים|בשאר|ביתר|השאר/i;

/**
 * "Start day one at 16:00 and the rest at 8": the trip's first day and the
 * other days each get their own time. Null when the clause isn't about the
 * first day; an empty list when it is but a time can't be read (then the AI reads it).
 */
function firstAndRest(text: string, kind: 'dayStart' | 'dayEnd', tripDays: readonly string[]): AssistantInstruction[] | null {
  const first = FIRST_DAY.exec(text);
  const firstDay = tripDays[0];
  if (!first || !firstDay) return null;
  const rest = REST_DAYS.exec(text);
  const clean = (part: string) => part.replace(FIRST_DAY, ' ').replace(REST_DAYS, ' ').replace(/\d{4}-\d{2}-\d{2}/g, '');
  const time = (part: string) => timeIn(clean(part), kind === 'dayEnd');
  const restAt = rest ? rest.index : text.length;
  const firstPart = first.index < restAt ? text.slice(first.index, restAt) : text.slice(first.index);
  // "Start at 16:00 on day one": the time comes before the words.
  const firstTime = time(firstPart) ?? time(text.slice(0, Math.min(first.index, restAt)));
  if (!firstTime) return [];
  const out: AssistantInstruction[] = [{ kind, time: firstTime, days: [firstDay] }];
  if (rest) {
    const restTime = time(first.index < rest.index ? text.slice(rest.index) : text.slice(rest.index, first.index));
    if (!restTime) return [];
    if (tripDays.length > 1) out.push({ kind, time: restTime, days: tripDays.slice(1) });
  }
  return out;
}

function readClause(text: string, tripDays: readonly string[], today: string | null, picks: Picks): Clause {
  const lower = text.toLowerCase();
  const days = daysIn(text, tripDays, today, picks);
  const needDay = (make: (day: string) => AssistantInstruction): Clause => {
    if (days.ambiguous && days.days.length === 0) return { pickDay: days.ambiguous };
    const day = days.days[0];
    return day ? { instruction: make(day) } : null;
  };

  // "Where is it?" / "Which day would be best (to add it)?" right after naming a place.
  if (/^(?:and |so )?(?:where(?:'s| is) (?:it|that|this)|which day|what day|when (?:should|could|can) (?:we|i)|what(?:'s| is) the best day|best day)\b/i.test(text)) {
    return { followUp: /^(?:and |so )?where/i.test(text) ? 'locate' : 'add' };
  }
  if (/^(?:ו)?(?:איפה (?:זה|הוא|היא)|באיזה יום|איזה יום|מתי (?:כדאי|אפשר))/.test(text)) {
    return { followUp: /^(?:ו)?איפה/.test(text) ? 'locate' : 'add' };
  }

  // Live: a planned place is closed, a visit to skip, or one taking longer.
  const closed = CLOSED_EN.exec(text) ?? CLOSED_HE.exec(text);
  if (closed) return { instruction: { kind: 'closedVisit', target: liveTarget(closed[1]) } };
  const skip = SKIP_EN.exec(text) ?? SKIP_HE.exec(text);
  if (skip) return { instruction: { kind: 'skipVisit', target: liveTarget(skip[1]) } };
  const extend = EXTEND_EN.exec(text) ?? EXTEND_HE.exec(text);
  if (extend) {
    const words = extend.slice(1).find((group) => group !== undefined);
    return { instruction: { kind: 'extendVisit', target: liveTarget(words), extraMinutes: extraMinutesIn(text) } };
  }

  // "Find something interesting near the places we're already visiting."
  if (NEAR_PLANNED.test(text)) {
    const found = readFindPlace(text, days);
    if (found) return 'pickDay' in found ? { pickDay: found.pickDay } : { instruction: found };
  }

  // Running late today: re-time what's left from now.
  if (
    /(running (late|behind)|\b(i'?m|i am|we'?re|we are) (so |a bit |very )?late\b|behind schedule|fallen behind|overslept|catch up|re-?plan|back on track)/.test(lower) ||
    /(אני מאחר|אנחנו מאחרים|מאחרת|מאחרים|באיחור|התעכבנו|התעכבתי|נרדמנו|לתכנן מחדש|תתכנן מחדש|לסדר מחדש|להדביק)/.test(text)
  ) {
    return { instruction: { kind: 'catchUp' } };
  }

  // Find a kind of place near where the day ends / the stay.
  const anchored = /finish|end (?:of )?(?:the )?day|day ends|hotel|stay|airbnb|מסיים|מסיימת|מסיימים|סוף היום|מלון|לינה|ישנים|הדירה/i.test(text);

  // "Something interesting nearby?" / "a coffee near me": around where the user is now.
  if (NEAR_HERE.test(text) && !anchored) {
    const found = readFindPlace(text, days);
    if (found && 'pickDay' in found) return { pickDay: found.pickDay };
    if (found) return { instruction: { ...found, nearHere: true, area: null } };
    const category = categoryIn(text.replace(NEAR_HERE, ' '));
    return {
      instruction: {
        kind: 'findPlace',
        query: category ? NEARBY_QUERY[category] : 'tourist attractions',
        category: category ?? 'sights',
        area: null,
        nearPlanned: false,
        nearHere: true,
        day: days.days[0] ?? null,
        intent: 'add',
      },
    };
  }
  if (anchored && (/(find|look(ing)? for|suggest|search|recommend|where (can|should) (i|we))/.test(lower) || /(תמצא|למצוא|חפש|לחפש|תציע|להציע|איפה)/.test(text))) {
    const category = categoryIn(text);
    if (category) {
      const stay = /hotel|where (i|we)('m|'re| am| are)? stay|airbnb|מלון|לינה|איפה שאנחנו ישנים|הדירה/.test(lower + text);
      const meal = /dinner|ארוחת ערב/.test(lower + text) ? 'dinner restaurant' : /lunch|צהריים/.test(lower + text) ? 'lunch restaurant' : null;
      return {
        instruction: {
          kind: 'findNearby',
          category,
          query: meal ?? NEARBY_QUERY[category],
          day: days.days[0] ?? null,
          near: stay ? 'stay' : 'dayEnd',
        },
      };
    }
  }

  // Move one visit.
  const moveEn = /\b(?:move|shift|push)\s+(?:the\s+|my\s+|our\s+)?(.+?)(?:\s+visit)?(?:\s+(?:to|for)\s+(.+))?$/i.exec(text);
  const moveHe = /(?:להעביר|תעביר|העבר|תזיז|להזיז|הזז)\s+(?:את\s+)?(.+?)(?:\s+(?:ל|אל\s+)?(יום.*|מחר|ליום.*|ל.+))?$/.exec(text);
  const move = moveEn ?? moveHe;
  if (move && !/(less busy|פחות עמוס)/.test(lower)) {
    const words = (move[1] ?? '').replace(/^(the|my|our)\s+/i, '').replace(/^ה(?=[א-ת]{3,})/, '').trim();
    const destination = move[2] ? daysIn(move[2], tripDays, today, picks) : null;
    const sourceDays = daysIn(move[1] ?? '', tripDays, today, picks);
    if (destination?.ambiguous && destination.days.length === 0) return { pickDay: destination.ambiguous };
    if (words.length > 0) {
      return {
        instruction: {
          kind: 'moveVisit',
          target: { ref: null, category: categoryIn(words), text: words.slice(0, 80), day: sourceDays.days[0] ?? null },
          toDay: destination && !destination.other ? (destination.days[0] ?? null) : null,
        },
      };
    }
  }

  // Keep things fixed.
  if (/(keep|leave|don'?t (move|touch|change)|do not (move|touch|change)|lock|fix)/.test(lower) || /(להשאיר|תשאיר|השאר|אל תזיז|לא להזיז|אל תשנה|לא לשנות|לנעול|קבועים|קבוע)/.test(text)) {
    if (/(starred|favou?rite|stars?\b)/.test(lower) || /(כוכב|מסומנ|מועדפ)/.test(text)) return { instruction: { kind: 'keepFixed', what: 'starred' } };
    if (/(everything|all (my |the )?(visits|plans|places)|what('s| is) (already )?planned|existing|as (it|they) (is|are))/.test(lower) || /(הכל|את כל|מה שכבר|הקיימ|כמו שהם|כמו שזה)/.test(text)) {
      return { instruction: { kind: 'keepFixed', what: 'all' } };
    }
  }

  // Lighter day / free day.
  const hours = /(\d+(?:\.\d)?)\s*(?:h\b|hours?|hrs?|שעות|שעה)/i.exec(text);
  if (/(day off|free day|keep .*free|make .*free|nothing (on|planned))/.test(lower) || /(יום חופשי|יום פנוי|פנוי לגמרי|בלי כלום|חופשי)/.test(text)) {
    return needDay((day) => ({ kind: 'lighten', day, maxHours: 0 }));
  }
  if (/(less busy|lighter|less packed|too (busy|much|full|packed)|more relaxed|relax|easier|calmer|lighten|less hectic)/.test(lower) || /(פחות עמוס|פחות לחוץ|יותר רגוע|רגוע יותר|להקל|קל יותר|עמוס מדי|פחות דחוס)/.test(text)) {
    return needDay((day) => ({ kind: 'lighten', day, maxHours: hours ? Math.min(14, Number(hours[1])) : null }));
  }

  // More time for a kind of place.
  if (/(more time|longer|extra time|slow(er)? down at)/.test(lower) || /(יותר זמן|זמן נוסף|ארוך יותר|יותר ארוך)/.test(text)) {
    const category = categoryIn(text);
    if (category) {
      const minutes = /(\d+)\s*(?:min|minutes|mins|דקות|דק)/i.exec(text);
      const extra = minutes ? Number(minutes[1]) : hours ? Math.round(Number(hours[1]) * 60) : null;
      return { instruction: { kind: 'moreTime', category, extraMinutes: extra === null ? null : Math.max(15, Math.min(240, extra)) } };
    }
  }

  // Start / finish times.
  const scope = () => (days.every || days.days.length === 0 ? [] : days.days);
  if (/(start|begin|leave|head out|get going|first (stop|visit))/.test(lower) || /(להתחיל|מתחיל|מתחילים|נתחיל|תתחיל|התחלה|לצאת|יוצאים|נצא)/.test(text)) {
    const split = firstAndRest(text, 'dayStart', tripDays);
    if (split) return split.length > 0 ? { instructions: split } : null;
    const time = timeIn(text.replace(/\d{4}-\d{2}-\d{2}/g, ''), false);
    if (time) {
      if (days.ambiguous && days.days.length === 0 && !days.every) return { pickDay: days.ambiguous };
      return { instruction: { kind: 'dayStart', time, days: scope() } };
    }
  }
  if (/(finish|end|be back|done|wrap up|stop by|back at)/.test(lower) || /(לסיים|מסיימים|נסיים|תסיים|לחזור|חוזרים|נחזור|סיום|לגמור)/.test(text)) {
    const split = firstAndRest(text, 'dayEnd', tripDays);
    if (split) return split.length > 0 ? { instructions: split } : null;
    const time = timeIn(text.replace(/\d{4}-\d{2}-\d{2}/g, ''), true);
    if (time) {
      if (days.ambiguous && days.days.length === 0 && !days.every) return { pickDay: days.ambiguous };
      return { instruction: { kind: 'dayEnd', time, days: scope() } };
    }
  }

  // A place to find: by name ("I also want to visit SUMMIT One Vanderbilt", "where is the Frick?") or by kind.
  const found = readFindPlace(text, days);
  if (found) return 'pickDay' in found ? { pickDay: found.pickDay } : { instruction: found };
  return null;
}

/** Splits "make Wednesday lighter and start at 10" into its requests. */
export function clauses(message: string): string[] {
  return message
    .split(
      /[;\n]|,\s+(?!(?:and\s+|ו)?(?:the rest|all the rest|the other days|other days|remaining days|the others|ל?שאר|בשאר|ל?יתר|ביתר))|[.?!]\s+|\s+and\s+(?=(?:make|start|keep|give|move|find|leave|finish|end|let|don'?t)\b)|\s+וגם\s+|\s+ו(?=(?:ת|ל|ת)[א-ת]{2,})(?!ל?(?:שאר|יתר))/i,
    )
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
}

/**
 * Every clause read, or null when any part isn't understood (then the AI
 * reads the whole message, so nothing the user asked is silently dropped).
 */
export function readRequest(message: string, tripDays: readonly string[], today: string | null, picks: Picks = {}): RulesResult {
  const instructions: AssistantInstruction[] = [];
  // iOS keyboards type curly apostrophes ("we’re").
  for (const clause of clauses(message.replace(/[’‘]/g, "'"))) {
    const read = readClause(clause, tripDays, today, picks);
    if (!read) return null;
    if ('pickDay' in read) return { kind: 'pickDay', ...read.pickDay };
    if ('instructions' in read) {
      instructions.push(...read.instructions);
      continue;
    }
    const last = instructions[instructions.length - 1];
    if ('followUp' in read) {
      // "Where is it?" needs a place named before it; "which day?" means plan it in.
      if (last?.kind !== 'findPlace') return null;
      if (read.followUp === 'add') instructions[instructions.length - 1] = { ...last, intent: 'add' };
      continue;
    }
    // "…and can we add it on Friday?" about the place just named.
    if (read.instruction.kind === 'findPlace' && read.instruction.query === null && last?.kind === 'findPlace') {
      instructions[instructions.length - 1] = { ...last, intent: 'add', day: read.instruction.day ?? last.day };
      continue;
    }
    instructions.push(read.instruction);
  }
  return instructions.length > 0 ? { kind: 'plan', instructions: instructions.slice(0, 6) } : null;
}
