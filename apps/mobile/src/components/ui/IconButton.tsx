import { Pressable, StyleSheet } from 'react-native';
import { colors, hitSlop, radii } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';

interface IconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  variant?: 'plain' | 'filled';
  flipInRtl?: boolean;
}

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'plain',
  flipInRtl,
}: IconButtonProps) {
  const filled = variant === 'filled';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={hitSlop}
      style={({ pressed }) => [
        styles.base,
        filled && { backgroundColor: pressed ? colors.accentPressed : colors.accent },
        !filled && pressed && { backgroundColor: colors.surfaceMuted },
      ]}
    >
      <Icon
        name={icon}
        size={22}
        color={filled ? colors.textOnAccent : colors.text}
        flipInRtl={flipInRtl}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
