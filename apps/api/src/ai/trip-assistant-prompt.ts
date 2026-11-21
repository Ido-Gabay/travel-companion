import { PLACE_CATEGORIES, type TripAssistantRequest } from '@travel-companion/shared';

/**
 * JSON schema for Claude's structured output. Flat on purpose (no unions):
 * unused text is "", unused numbers are -1, unused enums are "none".
 * trip-assistant-result.ts maps it to our instruction types and checks it.
 */
export const TRIP_ASSISTANT_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['plan', 'clarify'] },
    summary: { type: 'string', description: 'One short line in the user language saying what will be planned. Empty when clarifying.' },
    instructions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['lighten', 'dayStart', 'dayEnd', 'moreTime', 'keepFixed', 'moveVisit', 'findNearby', 'catchUp', 'findPlace', 'skipVisit', 'extendVisit', 'closedVisit'] },
          day: { type: 'string', description: 'YYYY-MM-DD from the trip days, or "".' },
          days: { type: 'array', items: { type: 'string' }, description: 'For dayStart/dayEnd: the days it applies to; [] = every day.' },
          time: { type: 'string', description: 'HH:MM (24 h) for dayStart/dayEnd, or "".' },
          maxHours: { type: 'number', description: 'lighten: hours to keep on that day (0 = free day), or -1 = just noticeably lighter.' },
          category: { type: 'string', enum: [...PLACE_CATEGORIES, 'none'] },
          extraMinutes: { type: 'number', description: 'moreTime: extra minutes per visit, or -1 = about half as long again.' },
          what: { type: 'string', enum: ['starred', 'all', 'none'] },
          ref: { type: 'string', description: 'moveVisit: a ref from the context (v3, w1) when the request clearly names one, or "".' },
          text: { type: 'string', description: 'moveVisit: words from the request naming the place (e.g. "museum"), or "".' },
          toDay: { type: 'string', description: 'moveVisit: target day YYYY-MM-DD, or "" = the best other day.' },
          query: { type: 'string', description: 'findNearby: a short Google Maps search in English, e.g. "dinner restaurant". No place names. findPlace: the place name exactly as the user wrote it, or a short English kind ("museum"); "" when not named ("this place").' },
          near: { type: 'string', enum: ['dayEnd', 'stay', 'none'] },
          area: { type: 'string', description: 'findPlace: a neighborhood or area the user named (e.g. "SoHo"), or "".' },
          nearPlanned: { type: 'boolean', description: 'findPlace: true for "near the places we are already visiting".' },
          nearHere: { type: 'boolean', description: 'findPlace: true for "nearby", "near me", "around here" (where the traveler is now).' },
          intent: { type: 'string', enum: ['locate', 'add', 'none'] },
        },
        required: ['kind', 'day', 'days', 'time', 'maxHours', 'category', 'extraMinutes', 'what', 'ref', 'text', 'toDay', 'query', 'near', 'area', 'nearPlanned', 'nearHere', 'intent'],
        additionalProperties: false,
      },
    },
    question: { type: 'string', description: 'One short clarification question in the user language, or "".' },
    options: { type: 'array', items: { type: 'string' }, description: 'Up to 4 short answers, or [].' },
  },
  required: ['action', 'summary', 'instructions', 'question', 'options'],
  additionalProperties: false,
} as const;

export function buildTripAssistantSystemPrompt(): string {
  return [
    "You turn a traveler's request about their trip itinerary into structured planning instructions for an app.",
    'The app plans on the phone and shows the traveler a proposal to accept or reject; you never change anything yourself.',
    'You never name, recommend or invent places.',
    '',
    'Instruction kinds:',
    '- lighten: make one day less busy ("make Wednesday less busy", "keep Friday free" = maxHours 0). maxHours -1 if no amount is given.',
    '- dayStart / dayEnd: earliest start or latest finish ("start every day at 10" → dayStart 10:00, days []). Only the days named, [] for every day.',
    '- moreTime: longer visits of a kind ("more time for shopping" → category shopping, extraMinutes -1 unless given). Museums, galleries and attractions are "sights"; restaurants are "food"; cafes "coffee"; bars "nightlife"; parks "outdoors".',
    '- keepFixed: keep starred visits (what "starred") or every planned visit (what "all") where and when they are.',
    '- moveVisit: move one visit to another day. Use ref when exactly one listed visit matches; otherwise give category and the words naming it in text, plus day if the request says which day it is on.',
    '- findNearby: look for a kind of place near where a day ends (near "dayEnd") or near the stay (near "stay"), e.g. "find a dinner place near where I finish the day". Give a short English query and the category; day = the day meant, or "" for today/unspecified.',
    '- catchUp: the traveler is running late or behind today ("we overslept", "replan the rest of today"); visits whose time has passed get new times from now. Today only; other fields empty.',
    '- findPlace: the traveler names a place they want to visit or asks where it is ("I also want to visit SUMMIT One Vanderbilt", "where is the Frick?"), or wants a kind of place added ("another shopping stop near SoHo", "a museum", "something interesting near what we are visiting"). query = the name exactly as written, or a short English kind; "" for "this place" without a name. category when clear. area = a neighborhood they named, or "". nearPlanned for "near the places we are visiting". day = the day they ask about, or "". intent "locate" when they only ask where it is, else "add". The app searches Google Maps; you never choose the place.',
    '- skipVisit: skip one planned visit ("let\'s skip the Met"). Name it with ref, or category + text (+ day), as for moveVisit; leave empty for "skip this one".',
    '- extendVisit: a visit is taking longer ("we\'re staying another hour at MoMA", "this is taking longer than expected"). Name the visit as for moveVisit, or leave ref/text/category empty for the one happening now. extraMinutes when given, else -1.',
    '- closedVisit: a planned place is closed or unavailable ("the Frick is closed"). Name it as for moveVisit, or leave empty for the next one. The app offers to skip it, keep it, or find an alternative nearby.',
    '- For "find something interesting nearby / near me", use findPlace with nearHere true.',
    '',
    'Rules:',
    '- Use only days from the trip days list. Weekday names, "tomorrow" and dates refer to those days (today is given).',
    '- If a weekday matches more than one trip day, or a needed day is missing and cannot be inferred, choose "clarify". Ask at most one short question with up to 4 options; options for days use the weekday and date.',
    '- If clarification answers are given, you MUST choose "plan".',
    '- Several requests in one message become several instructions (at most 6). Never add instructions the user did not ask for.',
    '- If the request is not about planning this trip, choose "clarify" and ask, in the user language, what they would like to change in the plan.',
    '- summary: a few words in the user language (e.g. "Lighter Wednesday, days from 10:00").',
  ].join('\n');
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (day: string) => WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()] ?? '';

type Body = Pick<TripAssistantRequest, 'message' | 'locale' | 'context' | 'clarifications'>;

/** The user's own trip data only: refs, categories, their labels, times, stars. No Google content. */
export function buildTripAssistantUserMessage(body: Body): string {
  const item = (entry: Body['context']['wishlist'][number]) =>
    [
      entry.ref,
      entry.category,
      entry.label ? `"${entry.label}"` : null,
      entry.start ? `at ${entry.start}` : null,
      entry.starred ? 'starred' : null,
      entry.status && entry.status !== 'planned' ? entry.status : null,
    ]
      .filter(Boolean)
      .join(' ');
  const lines = [
    `User language: ${body.locale === 'he' ? 'Hebrew' : 'English'}`,
    `Today: ${body.context.today ? `${body.context.today} (${weekday(body.context.today)})` : 'unknown'}`,
    'Trip days:',
    ...body.context.days.map((day) => `${day.day} (${weekday(day.day)}): ${day.visits.map(item).join('; ') || 'nothing planned'}`),
    `Wishlist (not on a day yet): ${body.context.wishlist.map(item).join('; ') || 'empty'}`,
    '',
    `Request: ${body.message}`,
  ];
  for (const c of body.clarifications ?? []) lines.push(`You asked: ${c.question}`, `User answered: ${c.answer}`);
  return lines.join('\n');
}
