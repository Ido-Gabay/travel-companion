import type { PlaceCategory } from '@travel-companion/shared';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Icon } from '@/components/ui';
import { colors, radii, spacing } from '@/theme/tokens';
import { CATEGORY_ICONS } from './categories';

interface CategoryChipsProps<T extends PlaceCategory | 'all'> {
  options: readonly { value: T; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}

/** Horizontal, scrollable chips for picking a category (or "all"). */
export function CategoryChips<T extends PlaceCategory | 'all'>({ options, value, onChange }: CategoryChipsProps<T>) {
  const { t } = useTranslation();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        const label = option.value === 'all' ? t('categories.all') : t(`categories.${option.value as PlaceCategory}`);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            {option.value !== 'all' ? (
              <Icon
                name={CATEGORY_ICONS[option.value as PlaceCategory]}
                size={15}
                color={selected ? colors.textOnAccent : colors.textSecondary}
              />
            ) : null}
            <AppText variant="caption" style={[styles.label, selected && styles.labelSelected]}>
              {option.count !== undefined ? `${label} · ${option.count}` : label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xxs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  label: { fontWeight: '600', color: colors.textSecondary },
  labelSelected: { color: colors.textOnAccent },
});
