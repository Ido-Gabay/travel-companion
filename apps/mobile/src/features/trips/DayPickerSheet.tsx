import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Icon, Sheet } from '@/components/ui';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors, radii, spacing } from '@/theme/tokens';
import { dayTitle } from './itinerary';

interface DayPickerSheetProps {
  visible: boolean;
  /** The place's name, shown as the subtitle. */
  placeName: string;
  days: readonly string[];
  /** The day the place is planned for now, or null when it's on the wishlist. */
  current: string | null;
  counts: ReadonlyMap<string, number>;
  onPick: (day: string | null) => void;
  onClose: () => void;
  /** Sheet title (default: "Pick a day"). */
  title?: string;
  /** Offer "not planned" as a choice (default true). D1: a visit is removed from its menu instead. */
  allowWishlist?: boolean;
}

/** Choose which day of the trip a place is planned for, or move it back to the wishlist. */
export function DayPickerSheet({
  visible,
  placeName,
  days,
  current,
  counts,
  onPick,
  onClose,
  title,
  allowWishlist = true,
}: DayPickerSheetProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();

  return (
    <Sheet visible={visible} title={title ?? t('itinerary.pickDay')} subtitle={placeName} onClose={onClose}>
      {days.map((day, index) => (
        <Row
          key={day}
          icon="calendar-outline"
          title={t('itinerary.dayNumber', { number: index + 1 })}
          subtitle={dayTitle(day, locale)}
          meta={counts.get(day) ? t('itinerary.placesCount', { count: counts.get(day) ?? 0 }) : undefined}
          selected={current === day}
          onPress={() => onPick(day)}
        />
      ))}
      {allowWishlist ? (
        <Row
          icon="bookmark-outline"
          title={t('itinerary.wishlist')}
          subtitle={t('itinerary.wishlistHint')}
          selected={current === null}
          onPress={() => onPick(null)}
        />
      ) : null}
    </Sheet>
  );
}

function Row({
  icon,
  title,
  subtitle,
  meta,
  selected,
  onPress,
}: {
  icon: 'calendar-outline' | 'bookmark-outline';
  title: string;
  subtitle: string;
  meta?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
    >
      <View style={[styles.icon, selected && styles.iconSelected]}>
        <Icon name={icon} size={18} color={selected ? colors.textOnAccent : colors.accent} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="caption" color="secondary">
          {subtitle}
        </AppText>
      </View>
      {meta ? (
        <AppText variant="caption" color="tertiary">
          {meta}
        </AppText>
      ) : null}
      {selected ? <Icon name="checkmark-circle" size={22} color={colors.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  pressed: { opacity: 0.7 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSelected: { backgroundColor: colors.accent },
  text: { flex: 1, gap: spacing.xxs },
});
