import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { colors, compactHitSlop, radii, spacing, typography } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

/**
 * primary: the one main action on a screen (filled accent).
 * secondary: tonal (soft accent fill), for supporting actions.
 * ghost: plain accent text.
 * danger: plain red text, for destructive actions (usually inside menus or at the end of a page).
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container width (default true). */
  block?: boolean;
  /** md = 48pt (default), sm = 36pt compact. */
  size?: Size;
  accessibilityHint?: string;
  testID?: string;
}

const palette: Record<Variant, { bg: string; pressed: string; text: string; border?: string }> = {
  primary: { bg: colors.accent, pressed: colors.accentPressed, text: colors.textOnAccent },
  secondary: { bg: colors.accentSoft, pressed: colors.accentSoftPressed, text: colors.accent },
  ghost: { bg: 'transparent', pressed: colors.surfaceMuted, text: colors.accent },
  danger: { bg: 'transparent', pressed: colors.dangerSoft, text: colors.danger },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  block = true,
  size = 'md',
  accessibilityHint,
  testID,
}: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      // A 36pt button still gets a 44pt touch target.
      hitSlop={size === 'sm' ? compactHitSlop : undefined}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.small,
        block && styles.block,
        {
          backgroundColor: pressed ? p.pressed : p.bg,
          borderColor: p.border ?? 'transparent',
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={p.text} />
        ) : (
          <>
            {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={p.text} /> : null}
            <AppText
              variant="bodyStrong"
              style={[styles.label, size === 'sm' && styles.smallLabel, { color: p.text }]}
              align="center"
            >
              {label}
            </AppText>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  small: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radii.pill },
  smallLabel: { fontSize: 15, lineHeight: 20 },
  block: { alignSelf: 'stretch' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: { ...typography.bodyStrong },
});
