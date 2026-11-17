/**
 * Design tokens. Every color, size and radius in the app comes from here.
 * Direction: calm, editorial, warm neutrals with one deep accent. No gradients.
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
  pill: 999,
} as const;

/** System fonts (SF Pro on iOS, Roboto on Android) cover Latin and Hebrew. */
export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.2 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 0.6 },
} as const;

export type TypographyVariant = keyof typeof typography;

export const shadows = {
  card: {
    shadowColor: '#14202E',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;
