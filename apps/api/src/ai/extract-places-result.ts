import { importedPlaceSchema, MAX_IMPORT_PLACES, type ImportedPlace } from '@travel-companion/shared';
import { z } from 'zod';

const rawSchema = z.object({
    places: z.array(z.object({ name: z.string(), note: z.string(), area: z.string() })),
});

const clip = (value: string, max: number) => value.trim().slice(0, max).trim();

/**
 * Claude's output → places. Anything not found in the user's own text is
 * dropped: a name must appear in it, so an invented place never reaches the app.
 */
export function parseExtractPlacesOutput(text: string, source: string): ImportedPlace[] | null {
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return null;
    }
    const raw = rawSchema.safeParse(json);
    if (!raw.success) return null;
    const haystack = source.toLocaleLowerCase();
    const seen = new Set<string>();
    const places: ImportedPlace[] = [];
    for (const entry of raw.data.places) {
        const name = clip(entry.name, 120);
        const key = name.toLocaleLowerCase();
        if (!name || seen.has(key) || !haystack.includes(key)) continue;
        const parsed = importedPlaceSchema.safeParse({
            name,
            note: clip(entry.note, 300) || null,
            area: clip(entry.area, 80) || null,
        });
        if (!parsed.success) continue;
        seen.add(key);
        places.push(parsed.data);
        if (places.length >= MAX_IMPORT_PLACES) break;
    }
    return places;
}
