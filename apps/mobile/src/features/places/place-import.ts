/**
 * Import places from the user's own list: a pasted list or a Google Takeout
 * "saved places" CSV. Pure and local (no network); nothing here calls Google.
 */

/** A place found in the user's text, before it's saved. */
export interface ImportCandidate {
    /** Normalized name: the identity used for dedupe and to match what's already saved. */
    key: string;
    name: string;
    note: string | null;
    area: string | null;
}

export const MAX_NAME = 120;
const MAX_NOTE = 300;
const MAX_AREA = 80;

/** Lowercase, no accents or punctuation, single spaces: "Katz's Deli" and "katzs deli" match. */
export function normalizeName(name: string): string {
    return name
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

const clip = (value: string | null | undefined, max: number): string | null => {
    const text = value?.replace(/\s+/g, ' ').trim() ?? '';
    return text ? text.slice(0, max).trim() : null;
};

export function candidate(name: string, note: string | null = null, area: string | null = null): ImportCandidate | null {
    const clean = clip(name, MAX_NAME);
    if (!clean) return null;
    const key = normalizeName(clean);
    if (!key) return null;
    return { key, name: clean, note: clip(note, MAX_NOTE), area: clip(area, MAX_AREA) };
}

/** One entry per place, first spelling kept; a later note fills a missing one. */
export function dedupe(list: readonly ImportCandidate[]): ImportCandidate[] {
    const byKey = new Map<string, ImportCandidate>();
    for (const item of list) {
        const seen = byKey.get(item.key);
        if (!seen) byKey.set(item.key, item);
        else byKey.set(item.key, { ...seen, note: seen.note ?? item.note, area: seen.area ?? item.area });
    }
    return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// CSV (RFC 4180: quoted fields, "" escapes, commas and newlines inside quotes)
// ---------------------------------------------------------------------------

export function parseCsvRows(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    const input = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < input.length; i += 1) {
        const char = input[i];
        if (quoted) {
            if (char === '"' && input[i + 1] === '"') {
                field += '"';
                i += 1;
            } else if (char === '"') {
                quoted = false;
            } else {
                field += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            row.push(field);
            field = '';
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && input[i + 1] === '\n') i += 1;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += char;
        }
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

/** Google Takeout "Saved" list headers, English and Hebrew. */
const TITLE = ['title', 'כותרת'];
const NOTE = ['note', 'הערה'];
const COMMENT = ['comment', 'תגובה'];

export type CsvResult =
    | { kind: 'places'; places: ImportCandidate[] }
    /** Not a Takeout saved-places file (no title column). */
    | { kind: 'notTakeout' }
    /** The file has the columns but no places. */
    | { kind: 'empty' };

const headerIndex = (header: readonly string[], names: readonly string[]) =>
    header.findIndex((cell) => names.includes(cell.trim().toLocaleLowerCase()));

export function looksLikeTakeoutCsv(text: string): boolean {
    const first = parseCsvRows(text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '')[0] ?? [];
    return first.length > 1 && headerIndex(first, TITLE) !== -1;
}

/**
 * A Takeout saved list: Title → name, Note (and Comment) → note. The URL column
 * is ignored: it isn't a place ID, and nothing is looked up during import.
 */
export function parseTakeoutCsv(text: string): CsvResult {
    const [header, ...rows] = parseCsvRows(text);
    if (!header) return { kind: 'empty' };
    const title = headerIndex(header, TITLE);
    if (title === -1) return { kind: 'notTakeout' };
    const note = headerIndex(header, NOTE);
    const comment = headerIndex(header, COMMENT);
    const places = dedupe(
        rows.flatMap((row) => {
            const notes = [note, comment].flatMap((index) => (index !== -1 && row[index]?.trim() ? [row[index].trim()] : []));
            const item = candidate(row[title] ?? '', notes.join(' · ') || null);
            return item ? [item] : [];
        }),
    );
    return places.length > 0 ? { kind: 'places', places } : { kind: 'empty' };
}

// ---------------------------------------------------------------------------
// Pasted lists
// ---------------------------------------------------------------------------

const BULLET = /^\s*(?:[-*•·▪◦‣–—>]+|\d{1,3}[.)\]]|\[[ xX]?\]|☐|☑|✅|✔️?)\s*/u;
/** "Katz - pastrami", "Katz: pastrami", "Katz — pastrami". */
const NOTE_SPLIT = /\s+[-–—]\s+|:\s+/;
/** "Katz (Lower East Side)". */
const AREA_SUFFIX = /^(.*?)\s*\(([^()]{1,60})\)\s*$/;
const MAX_LIST_WORDS = 10;

/**
 * A list the phone can read on its own: one place per line (bullets, numbers,
 * "name - note"), or one line of comma-separated names. Returns null for prose
 * (sentences, chat messages): that needs the AI.
 */
export function parseList(text: string): ImportCandidate[] | null {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '');
    if (lines.length === 0) return [];

    if (lines.length === 1) {
        const parts = (lines[0] ?? '').split(/[,،;]/).map((part) => part.trim()).filter(Boolean);
        if (parts.length >= 2 && parts.every((part) => wordCount(part) <= 5 && !/[.!?]$/.test(part))) {
            return dedupe(parts.flatMap((part) => toCandidates(part)));
        }
    }

    const items: ImportCandidate[] = [];
    for (const raw of lines) {
        const line = raw.replace(BULLET, '').trim();
        if (!line) continue;
        const name = (line.split(NOTE_SPLIT)[0] ?? '').trim();
        // A sentence where a name should be: this isn't a list.
        if (wordCount(name) > MAX_LIST_WORDS || /[.!?]\s+\S/.test(name) || (/[.!?]$/.test(name) && wordCount(name) > 4)) return null;
        items.push(...toCandidates(line));
    }
    return dedupe(items);
}

function toCandidates(line: string): ImportCandidate[] {
    const [head = '', ...rest] = line.split(NOTE_SPLIT);
    const note = rest.join(' - ').trim() || null;
    const withArea = AREA_SUFFIX.exec(head.trim());
    const item = withArea ? candidate(withArea[1] ?? '', note, withArea[2] ?? null) : candidate(head, note);
    return item ? [item] : [];
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

// ---------------------------------------------------------------------------
// Against what's already saved
// ---------------------------------------------------------------------------

export type ImportStatus = 'inTrip' | 'saved' | 'new';

export interface ImportRow extends ImportCandidate {
    status: ImportStatus;
    /** The saved place to reuse (inTrip / saved). */
    placeId: string | null;
}

/**
 * Each candidate against the user's places by name: already in this trip,
 * already in the collection (reused, never copied), or new. Names come from
 * what the phone already knows (the user's own names and labels, Google names
 * only if already in memory); nothing is looked up.
 */
export function matchExisting(
    candidates: readonly ImportCandidate[],
    saved: readonly { id: string; names: readonly (string | null)[] }[],
    inTrip: ReadonlySet<string>,
): ImportRow[] {
    const byKey = new Map<string, string>();
    for (const place of saved) {
        for (const name of place.names) {
            const key = name ? normalizeName(name) : '';
            if (!key) continue;
            // Prefer the copy that's already in this trip.
            if (!byKey.has(key) || inTrip.has(place.id)) byKey.set(key, place.id);
        }
    }
    return candidates.map((item) => {
        const placeId = byKey.get(item.key) ?? null;
        return { ...item, placeId, status: placeId === null ? 'new' : inTrip.has(placeId) ? 'inTrip' : 'saved' };
    });
}
