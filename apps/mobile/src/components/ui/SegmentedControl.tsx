import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '@/theme/tokens';
import { AppText } from './AppText';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={option.label}
            disabled={disabled}
            onPress={() => {
              if (!selected) onChange(option.value);
            }}
            style={[styles.segment, selected && styles.selected]}
          >
            <AppText variant="bodyStrong" color={selected ? 'primary' : 'secondary'} align="center">
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  selected: {
    backgroundColor: colors.surface,
    shadowColor: '#14202E',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
