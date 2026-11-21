import {
  assistantInstructionSchema,
  placeCategorySchema,
  type AssistantInstruction,
  type TripAssistantRequest,
  type TripAssistantResponse,
} from '@travel-companion/shared';
import { z } from 'zod';

/** Claude's flat output (validated again here; never trusted blindly). */
const outputSchema = z.object({
  action: z.enum(['plan', 'clarify']),
  summary: z.string().max(200),
  instructions: z
    .array(
      z.object({
        kind: z.enum(['lighten', 'dayStart', 'dayEnd', 'moreTime', 'keepFixed', 'moveVisit', 'findNearby', 'catchUp', 'findPlace', 'skipVisit', 'extendVisit', 'closedVisit']),
        day: z.string(),
        days: z.array(z.string()),
        time: z.string(),
        maxHours: z.number(),
        category: z.union([placeCategorySchema, z.literal('none')]),
        extraMinutes: z.number(),
        what: z.enum(['starred', 'all', 'none']),
        ref: z.string(),
        text: z.string(),
        toDay: z.string(),
        query: z.string(),
        near: z.enum(['dayEnd', 'stay', 'none']),
        // Older outputs (before findPlace) leave these out.
        area: z.string().default(''),
        nearPlanned: z.boolean().default(false),
        nearHere: z.boolean().default(false),
        intent: z.enum(['locate', 'add', 'none']).default('none'),
      }),
    )
    .max(12),
  question: z.string().max(300),
  options: z.array(z.string()),
});
type Flat = z.infer<typeof outputSchema>['instructions'][number];

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

/** One flat instruction as ours, or null if it doesn't make sense for this trip. */
function toInstruction(flat: Flat, days: ReadonlySet<string>, refs: ReadonlySet<string>): AssistantInstruction | null {
  const day = (value: string) => (days.has(value) ? value : null);
  const category = flat.category === 'none' ? null : flat.category;
  let candidate: unknown;
  switch (flat.kind) {
    case 'lighten':
      if (!day(flat.day)) return null;
      candidate = { kind: 'lighten', day: flat.day, maxHours: flat.maxHours < 0 ? null : flat.maxHours };
      break;
    case 'dayStart':
    case 'dayEnd':
      candidate = { kind: flat.kind, time: flat.time, days: flat.days.filter((item) => days.has(item)) };
      break;
    case 'moreTime':
      if (!category) return null;
      candidate = { kind: 'moreTime', category, extraMinutes: flat.extraMinutes < 0 ? null : Math.round(flat.extraMinutes) };
      break;
    case 'keepFixed':
      if (flat.what === 'none') return null;
      candidate = { kind: 'keepFixed', what: flat.what };
      break;
    case 'moveVisit': {
      const ref = refs.has(flat.ref.trim()) ? flat.ref.trim() : null;
      if (!ref && !category && !orNull(flat.text)) return null;
      candidate = {
        kind: 'moveVisit',
        target: { ref, category, text: orNull(flat.text)?.slice(0, 80) ?? null, day: day(flat.day) },
        toDay: day(flat.toDay),
      };
      break;
    }
    case 'findNearby':
      if (!category || flat.near === 'none') return null;
      candidate = { kind: 'findNearby', category, query: flat.query.trim().slice(0, 100) || category, day: day(flat.day), near: flat.near };
      break;
    case 'catchUp':
      candidate = { kind: 'catchUp' };
      break;
    case 'findPlace': {
      const query = orNull(flat.query)?.slice(0, 100) ?? null;
      if (!query && !category && !flat.nearPlanned && !flat.nearHere) return null;
      candidate = {
        kind: 'findPlace',
        query,
        category,
        area: orNull(flat.area)?.slice(0, 80) ?? null,
        nearPlanned: flat.nearPlanned,
        nearHere: flat.nearHere,
        day: day(flat.day),
        intent: flat.intent === 'locate' ? 'locate' : 'add',
      };
      break;
    }
    case 'skipVisit':
    case 'closedVisit':
    case 'extendVisit': {
      const ref = refs.has(flat.ref.trim()) ? flat.ref.trim() : null;
      const named = ref || category || orNull(flat.text);
      const target = named ? { ref, category, text: orNull(flat.text)?.slice(0, 80) ?? null, day: day(flat.day) } : null;
      // Without a name they mean the visit happening now / next (the phone resolves it).
      if (flat.kind === 'skipVisit') {
        candidate = { kind: 'skipVisit', target };
      } else if (flat.kind === 'closedVisit') {
        candidate = { kind: 'closedVisit', target };
      } else {
        candidate = { kind: 'extendVisit', target, extraMinutes: flat.extraMinutes < 0 ? null : Math.round(flat.extraMinutes) };
      }
      break;
    }
  }
  const parsed = assistantInstructionSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Claude's JSON text as our response, checked against the trip it was asked
 * about (days and refs must exist). Null when nothing usable came back, so
 * the caller answers "unavailable" instead of showing something wrong.
 */
export function parseTripAssistantOutput(
  text: string,
  request: Pick<TripAssistantRequest, 'context' | 'clarifications'>,
): TripAssistantResponse | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = outputSchema.safeParse(json);
  if (!parsed.success) return null;
  const out = parsed.data;
  const answered = (request.clarifications?.length ?? 0) > 0;

  if (out.action === 'clarify' && !answered && out.question.trim()) {
    return {
      action: 'clarify',
      question: out.question.trim().slice(0, 300),
      options: out.options.map((option) => option.trim().slice(0, 80)).filter(Boolean).slice(0, 4),
    };
  }
  const days = new Set(request.context.days.map((day) => day.day));
  const refs = new Set([...request.context.days.flatMap((day) => day.visits), ...request.context.wishlist].map((item) => item.ref));
  const instructions = out.instructions.flatMap((flat) => {
    const instruction = toInstruction(flat, days, refs);
    return instruction ? [instruction] : [];
  });
  if (instructions.length === 0) return null;
  return { action: 'plan', summary: out.summary.trim().slice(0, 200), instructions: instructions.slice(0, 6) };
}
