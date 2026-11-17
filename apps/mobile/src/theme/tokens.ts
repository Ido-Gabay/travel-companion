/**
 * Design tokens. Every color, size and radius in the app comes from here.
 * Direction: calm, editorial, warm neutrals with one deep accent. No gradients.
 * See docs/DESIGN_SYSTEM.md for how these are used.
 */
export const colors = {
  background: '#F6F4F0',
  surface: '#FFFFFF',
  surfaceMuted: '#EFECE6',
  border: '#E3DED6',
  borderStrong: '#CFC8BD',

  text: '#14202E',
  textSecondary: '#5B6573',
  textTertiary: '#8A929C',
  textOnAccent: '#FFFFFF',

  accent: '#1F5C66',
  accentPressed: '#174850',
  accentSoft: '#E3EEEF',

  danger: '#B3261E',
  dangerSoft: '#FBEAE8',
  success: '#2E6B3F',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  /** Cards, grouped lists and sheets. */
  card: 20,
  pill: 999,
} as const;

/** System fonts (SF Pro on iOS, Roboto on Android) cover Latin and Hebrew. */
export const typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const, letterSpacing: -0.2 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  /** Sentence-case section label (replaces uppercase overlines in new UI). */
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 0.6 },
} as const;

export type TypographyVariant = keyof typeof typography;

/**
 * Elevation is reserved for things that float above content (sheets, map controls,
 * the floating save bar). In-flow content is flat.
 */
export const shadows = {
  floating: {
    shadowColor: '#14202E',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  card: {
    shadowColor: '#14202E',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
