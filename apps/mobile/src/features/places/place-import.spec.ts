import { describe, expect, it } from 'vitest';
import { candidate, dedupe, looksLikeTakeoutCsv, matchExisting, normalizeName, parseCsvRows, parseList, parseTakeoutCsv } from './place-import';

const names = (list: readonly { name: string }[] | null) => list?.map((item) => item.name) ?? null;

describe('CSV rows', () => {
    it('reads quotes, escaped quotes, commas and newlines inside fields, CRLF and a BOM', () => {
        const text = '\uFEFFTitle,Note\r\n"Katz\'s, Deli","Say ""pastrami""\nand pickles"\r\nMoMA,\r\n\r\n';
        expect(parseCsvRows(text)).toEqual([
            ['Title', 'Note'],
            ["Katz's, Deli", 'Say "pastrami"\nand pickles'],
            ['MoMA', ''],
        ]);
    });
});

describe('Google Takeout saved places', () => {
    it('English headers: title and note kept, URL ignored, empty rows skipped', () => {
        const csv = [
            'Title,Note,URL,Tags,Comment',
            '"Russ & Daughters",bagels,https://www.google.com/maps/place/Russ/data=!4m2!3m1!1s0x0:0x1,,go early',
            ',,,,',
            'The Met,,https://www.google.com/maps/place/Met,,',
        ].join('\n');
        expect(looksLikeTakeoutCsv(csv)).toBe(true);
        const result = parseTakeoutCsv(csv);
        expect(result).toEqual({
            kind: 'places',
            places: [
                { key: 'russ daughters', name: 'Russ & Daughters', note: 'bagels · go early', area: null },
                { key: 'the met', name: 'The Met', note: null, area: null },
            ],
        });
    });

    it('Hebrew headers', () => {
        const csv = 'כותרת,הערה,כתובת אתר\nמחנה יהודה,לבוא רעבים,https://maps.google.com/?cid=1\nהכותל,,https://maps.google.com/?cid=2\n';
        expect(looksLikeTakeoutCsv(csv)).toBe(true);
        const result = parseTakeoutCsv(csv);
        expect(result.kind === 'places' && result.places.map((place) => [place.name, place.note])).toEqual([
            ['מחנה יהודה', 'לבוא רעבים'],
            ['הכותל', null],
        ]);
    });

    it('a CSV that is not a saved-places export, or has no places', () => {
        expect(parseTakeoutCsv('Name,Phone\nBob,123')).toEqual({ kind: 'notTakeout' });
        expect(looksLikeTakeoutCsv('Katz\nMoMA')).toBe(false);
        expect(parseTakeoutCsv('Title,Note,URL\n,,\n')).toEqual({ kind: 'empty' });
        expect(parseTakeoutCsv('')).toEqual({ kind: 'empty' });
    });
});

describe('pasted lists (read on the phone)', () => {
    it('bullets, numbers, checkboxes, notes after a dash or colon, an area in brackets', () => {
        const text = ['- Katz - pastrami', '2. Russ & Daughters (Lower East Side)', '• MoMA: free on Fridays', '[ ] Joe\'s Pizza', '☐ High Line'].join('\n');
        expect(parseList(text)).toEqual([
            { key: 'katz', name: 'Katz', note: 'pastrami', area: null },
            { key: 'russ daughters', name: 'Russ & Daughters', note: null, area: 'Lower East Side' },
            { key: 'moma', name: 'MoMA', note: 'free on Fridays', area: null },
            { key: 'joe s pizza', name: "Joe's Pizza", note: null, area: null },
            { key: 'high line', name: 'High Line', note: null, area: null },
        ]);
    });

    it('one line of names separated by commas', () => {
        expect(names(parseList('Katz, Russ & Daughters, MoMA'))).toEqual(['Katz', 'Russ & Daughters', 'MoMA']);
    });

    it('Hebrew lists', () => {
        expect(names(parseList('1. מחנה יהודה - שוק\n2. הכותל\n3. מוזיאון ישראל'))).toEqual(['מחנה יהודה', 'הכותל', 'מוזיאון ישראל']);
    });

    it('prose (a chat message) is left for the AI', () => {
        expect(parseList('You have to try Katz for pastrami. Then walk over to Russ & Daughters and get bagels, trust me!')).toBeNull();
        expect(parseList('Hey! When you are in NYC go to MoMA and the Met. Have fun')).toBeNull();
    });

    it('nothing but blank lines is an empty list', () => {
        expect(parseList('\n  \n')).toEqual([]);
    });
});

describe('dedupe and matching', () => {
    it('one entry per place regardless of case, accents and punctuation; a later note fills in', () => {
        const list = [candidate('Café Lalo'), candidate('cafe lalo', 'cheesecake'), candidate('CAFÉ LALO!')].flatMap((item) => (item ? [item] : []));
        expect(normalizeName('Café  Lalo!')).toBe('cafe lalo');
        expect(dedupe(list)).toEqual([{ key: 'cafe lalo', name: 'Café Lalo', note: 'cheesecake', area: null }]);
    });

    it('already in the trip, already saved (reused), or new', () => {
        const list = [candidate('Katz'), candidate('MoMA'), candidate('High Line')].flatMap((item) => (item ? [item] : []));
        const rows = matchExisting(
            list,
            [
                { id: 'p1', names: ["Katz's", 'Katz'] },
                { id: 'p2', names: ['moma', null] },
            ],
            new Set(['p1']),
        );
        expect(rows.map((row) => [row.name, row.status, row.placeId])).toEqual([
            ['Katz', 'inTrip', 'p1'],
            ['MoMA', 'saved', 'p2'],
            ['High Line', 'new', null],
        ]);
    });

    it('ignores blank names and clips long ones', () => {
        expect(candidate('   ')).toBeNull();
        expect(candidate('!!!')).toBeNull();
        expect(candidate('x'.repeat(200))?.name.length).toBe(120);
    });
});
