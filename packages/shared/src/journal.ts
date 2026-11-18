import { z } from 'zod';
import { calendarDateSchema } from './trip.js';

/**
 * M15 trip journal: one entry per trip day (the user's note and a 1–5 rating).
 * What the user did that day comes from the itinerary (stops marked Done), and
 * highlights are a flag on trip places (`TripPlace.highlight`).
 */
export const JOURNAL_NOTE_MAX = 4000;

export const journalRatingSchema = z.number().int().min(1).max(5);

export const journalDaySchema = z.object({
  day: calendarDateSchema,
  note: z.string().nullable(),
  rating: journalRatingSchema.nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type JournalDay = z.infer<typeof journalDaySchema>;

/** Response of GET /v1/trips/:id/journal: days that have a note or rating, by date. */
export const tripJournalSchema = z.object({ days: z.array(journalDaySchema) });
export type TripJournal = z.infer<typeof tripJournalSchema>;

/** Body of PUT /v1/trips/:id/journal/:day. Blank note = no note. */
export const updateJournalDaySchema = z
  .strictObject({
    note: z
      .string()
      .trim()
      .max(JOURNAL_NOTE_MAX)
      .transform((value) => (value.length === 0 ? null : value))
      .nullable()
      .optional(),
    rating: journalRatingSchema.nullable().optional(),
  })
  .refine((body) => body.note !== undefined || body.rating !== undefined, {
    error: 'Provide note or rating.',
  });
export type UpdateJournalDayInput = z.input<typeof updateJournalDaySchema>;
export type UpdateJournalDayData = z.output<typeof updateJournalDaySchema>;
