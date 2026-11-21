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
  /** Text and lines on the accent surface (the New trip ticket). */
  textOnAccentSecondary: 'rgba(255,255,255,0.72)',
  textOnAccentTertiary: 'rgba(255,255,255,0.5)',
  borderOnAccent: 'rgba(255,255,255,0.35)',

  accent: '#1F5C66',
  accentPressed: '#174850',
  accentSoft: '#E3EEEF',
  accentSoftPressed: '#D3E4E6',

  danger: '#B3261E',
  dangerSoft: '#FBEAE8',
  success: '#2E6B3F',
  successSoft: '#E6F2E9',

  /** Controls floating over the map. */
  surfaceTranslucent: 'rgba(255,255,255,0.88)',

  /** The user's own location on maps (the platform's familiar blue). */
  location: '#2F6FDE',
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

/** Font weights outside the text variants (emphasis inside a caption, chip labels, map badges). */
export const weights = {
  regular: '400',
  semibold: '600',
  bold: '700',
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

/** Chips and small buttons (32–36pt tall): reach a 44pt target without looking bigger. Half the 8pt gap sideways. */
export const compactHitSlop = { top: 6, bottom: 6, left: 4, right: 4 } as const;
