import { Text, type TextProps } from 'react-native';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors, typography, type TypographyVariant } from '@/theme/tokens';

type TextColor = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'onAccent';

const colorMap: Record<TextColor, string> = {
  primary: colors.text,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  accent: colors.accent,
  danger: colors.danger,
  onAccent: colors.textOnAccent,
};

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: TextColor;
  align?: 'start' | 'center' | 'end';
}

/** All text in the app goes through this, so alignment follows the app language (RTL/LTR). */
export function AppText({
  variant = 'body',
  color = 'primary',
  align = 'start',
  style,
  ...rest
}: AppTextProps) {
  const { isRtl } = useLocale();
  const textAlign =
    align === 'center' ? 'center' : (align === 'start') !== isRtl ? 'left' : 'right';

  return (
    <Text
      {...rest}
      style={[
        typography[variant],
        { color: colorMap[color], textAlign, writingDirection: isRtl ? 'rtl' : 'ltr' },
        style,
      ]}
    />
  );
}
