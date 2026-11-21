import type { SupportedLocale } from '@travel-companion/shared';

/**
 * Destinations offered while typing a new trip's destination: our own small
 * list (free, offline, no Google content stored). Anything else can still be
 * typed freely. Neighborhoods are offered for "Staying at".
 */

interface Names {
    city: string;
    country: string;
}

export interface Destination {
    id: string;
    en: Names;
    he: Names;
    neighborhoods?: { en: string; he: string }[];
}

const d = (id: string, en: [string, string], he: [string, string], neighborhoods?: [string, string][]): Destination => ({
    id,
    en: { city: en[0], country: en[1] },
    he: { city: he[0], country: he[1] },
    ...(neighborhoods ? { neighborhoods: neighborhoods.map(([enName, heName]) => ({ en: enName, he: heName })) } : {}),
});

export const DESTINATIONS: readonly Destination[] = [
    d('nyc', ['New York', 'USA'], ['ניו יורק', 'ארה"ב'], [
        ['Midtown', 'מידטאון'],
        ['SoHo', 'סוהו'],
        ['Upper West Side', 'אפר ווסט סייד'],
        ['Williamsburg', 'וויליאמסבורג'],
        ['Lower Manhattan', 'מנהטן התחתית'],
    ]),
    d('london', ['London', 'UK'], ['לונדון', 'בריטניה'], [
        ['Covent Garden', 'קובנט גארדן'],
        ['Soho', 'סוהו'],
        ['South Bank', 'סאות\' בנק'],
        ['Kensington', 'קנזינגטון'],
        ['Shoreditch', 'שורדיץ\''],
    ]),
    d('paris', ['Paris', 'France'], ['פריז', 'צרפת'], [
        ['Le Marais', 'לה מארה'],
        ['Saint-Germain', 'סן ז\'רמן'],
        ['Montmartre', 'מונמארטר'],
        ['Latin Quarter', 'הרובע הלטיני'],
    ]),
    d('rome', ['Rome', 'Italy'], ['רומא', 'איטליה'], [
        ['Centro Storico', 'המרכז ההיסטורי'],
        ['Trastevere', 'טרסטוורה'],
        ['Monti', 'מונטי'],
        ['Prati', 'פראטי'],
    ]),
    d('barcelona', ['Barcelona', 'Spain'], ['ברצלונה', 'ספרד'], [
        ['Gothic Quarter', 'הרובע הגותי'],
        ['Eixample', 'אשמפלה'],
        ['El Born', 'אל בורן'],
        ['Gràcia', 'גרסיה'],
    ]),
    d('amsterdam', ['Amsterdam', 'Netherlands'], ['אמסטרדם', 'הולנד'], [
        ['Jordaan', 'יורדן'],
        ['Centrum', 'המרכז'],
        ['De Pijp', 'דה פייפ'],
    ]),
    d('berlin', ['Berlin', 'Germany'], ['ברלין', 'גרמניה'], [
        ['Mitte', 'מיטה'],
        ['Kreuzberg', 'קרויצברג'],
        ['Prenzlauer Berg', 'פרנצלאואר ברג'],
    ]),
    d('lisbon', ['Lisbon', 'Portugal'], ['ליסבון', 'פורטוגל'], [
        ['Baixa', 'באישה'],
        ['Chiado', 'שיאדו'],
        ['Alfama', 'אלפמה'],
        ['Príncipe Real', 'פרינסיפה ריאל'],
    ]),
    d('tokyo', ['Tokyo', 'Japan'], ['טוקיו', 'יפן'], [
        ['Shinjuku', 'שינג\'וקו'],
        ['Shibuya', 'שיבויה'],
        ['Ginza', 'גינזה'],
        ['Asakusa', 'אסקוסה'],
    ]),
    d('telaviv', ['Tel Aviv', 'Israel'], ['תל אביב', 'ישראל'], [
        ['Neve Tzedek', 'נווה צדק'],
        ['Florentin', 'פלורנטין'],
        ['Old Jaffa', 'יפו העתיקה'],
        ['The beachfront', 'קו החוף'],
    ]),
    d('jerusalem', ['Jerusalem', 'Israel'], ['ירושלים', 'ישראל']),
    d('eilat', ['Eilat', 'Israel'], ['אילת', 'ישראל']),
    d('madrid', ['Madrid', 'Spain'], ['מדריד', 'ספרד']),
    d('prague', ['Prague', 'Czechia'], ['פראג', 'צ\'כיה']),
    d('vienna', ['Vienna', 'Austria'], ['וינה', 'אוסטריה']),
    d('budapest', ['Budapest', 'Hungary'], ['בודפשט', 'הונגריה']),
    d('athens', ['Athens', 'Greece'], ['אתונה', 'יוון']),
    d('milan', ['Milan', 'Italy'], ['מילאנו', 'איטליה']),
    d('florence', ['Florence', 'Italy'], ['פירנצה', 'איטליה']),
    d('venice', ['Venice', 'Italy'], ['ונציה', 'איטליה']),
    d('munich', ['Munich', 'Germany'], ['מינכן', 'גרמניה']),
    d('zurich', ['Zurich', 'Switzerland'], ['ציריך', 'שווייץ']),
    d('nice', ['Nice', 'France'], ['ניס', 'צרפת']),
    d('copenhagen', ['Copenhagen', 'Denmark'], ['קופנהגן', 'דנמרק']),
    d('stockholm', ['Stockholm', 'Sweden'], ['סטוקהולם', 'שוודיה']),
    d('dublin', ['Dublin', 'Ireland'], ['דבלין', 'אירלנד']),
    d('edinburgh', ['Edinburgh', 'UK'], ['אדינבורו', 'בריטניה']),
    d('krakow', ['Kraków', 'Poland'], ['קרקוב', 'פולין']),
    d('istanbul', ['Istanbul', 'Türkiye'], ['איסטנבול', 'טורקיה']),
    d('larnaca', ['Larnaca', 'Cyprus'], ['לרנקה', 'קפריסין']),
    d('tbilisi', ['Tbilisi', 'Georgia'], ['טביליסי', 'גאורגיה']),
    d('batumi', ['Batumi', 'Georgia'], ['בטומי', 'גאורגיה']),
    d('dubai', ['Dubai', 'UAE'], ['דובאי', 'איחוד האמירויות']),
    d('bangkok', ['Bangkok', 'Thailand'], ['בנגקוק', 'תאילנד']),
    d('singapore', ['Singapore', 'Singapore'], ['סינגפור', 'סינגפור']),
    d('kyoto', ['Kyoto', 'Japan'], ['קיוטו', 'יפן']),
    d('losangeles', ['Los Angeles', 'USA'], ['לוס אנג\'לס', 'ארה"ב']),
    d('sanfrancisco', ['San Francisco', 'USA'], ['סן פרנסיסקו', 'ארה"ב']),
    d('miami', ['Miami', 'USA'], ['מיאמי', 'ארה"ב']),
    d('lasvegas', ['Las Vegas', 'USA'], ['לאס וגאס', 'ארה"ב']),
    d('chicago', ['Chicago', 'USA'], ['שיקגו', 'ארה"ב']),
    d('boston', ['Boston', 'USA'], ['בוסטון', 'ארה"ב']),
    d('washington', ['Washington, D.C.', 'USA'], ['וושינגטון', 'ארה"ב']),
    d('toronto', ['Toronto', 'Canada'], ['טורונטו', 'קנדה']),
    d('montreal', ['Montreal', 'Canada'], ['מונטריאול', 'קנדה']),
    d('mexicocity', ['Mexico City', 'Mexico'], ['מקסיקו סיטי', 'מקסיקו']),
    d('rio', ['Rio de Janeiro', 'Brazil'], ['ריו דה ז\'ניירו', 'ברזיל']),
    d('buenosaires', ['Buenos Aires', 'Argentina'], ['בואנוס איירס', 'ארגנטינה']),
    d('capetown', ['Cape Town', 'South Africa'], ['קייפטאון', 'דרום אפריקה']),
    d('sydney', ['Sydney', 'Australia'], ['סידני', 'אוסטרליה']),
];

const fold = (text: string) =>
    text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();

/** How a destination is written into the trip: "New York, USA" / "ניו יורק, ארה"ב". */
export const destinationLabel = (destination: Destination, locale: SupportedLocale) =>
    `${destination[locale].city}, ${destination[locale].country}`;

/**
 * Destinations matching what's typed, in either language: a city name that
 * starts with it first, then a word of the city, then the country.
 */
export function matchDestinations(query: string, limit = 5): Destination[] {
    const q = fold(query);
    if (q.length < 2) return [];
    const scored = DESTINATIONS.flatMap((destination) => {
        const cities = [fold(destination.en.city), fold(destination.he.city)];
        const countries = [fold(destination.en.country), fold(destination.he.country)];
        const score = cities.some((city) => city.startsWith(q))
            ? 0
            : cities.some((city) => city.split(' ').some((word) => word.startsWith(q)))
                ? 1
                : countries.some((country) => country.startsWith(q))
                    ? 2
                    : -1;
        return score < 0 ? [] : [{ destination, score }];
    });
    return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((item) => item.destination);
}

/** The listed destination a typed value is (exactly, in either language), if any. */
export function findDestination(value: string | null): Destination | null {
    if (!value) return null;
    const folded = fold(value);
    return (
        DESTINATIONS.find((destination) =>
            (['en', 'he'] as const).some(
                (locale) => folded === fold(destinationLabel(destination, locale)) || folded === fold(destination[locale].city),
            ),
        ) ?? null
    );
}
