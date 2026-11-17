import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing, typography } from '@/theme/tokens';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container width (default true). */
  block?: boolean;
  accessibilityHint?: string;
}

const palette: Record<Variant, { bg: string; pressed: string; text: string; border?: string }> = {
  primary: { bg: colors.accent, pressed: colors.accentPressed, text: colors.textOnAccent },
  secondary: { bg: colors.surface, pressed: colors.surfaceMuted, text: colors.text, border: colors.border },
  ghost: { bg: 'transparent', pressed: colors.surfaceMuted, text: colors.accent },
  danger: { bg: colors.surface, pressed: colors.dangerSoft, text: colors.danger, border: colors.border },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  block = true,
  accessibilityHint,
}: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
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
            {icon ? <Icon name={icon} size={18} color={p.text} /> : null}
            <AppText variant="bodyStrong" style={[styles.label, { color: p.text }]} align="center">
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
    minHeight: 50,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  block: { alignSelf: 'stretch' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: { ...typography.bodyStrong },
});
