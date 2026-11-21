import type { Stay } from '@travel-companion/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Icon } from '@/components/ui';
import { usePlaceDisplay } from '@/features/places/use-place-display';
import { useLocale } from '@/i18n/LocaleProvider';
import { colors, radii, spacing } from '@/theme/tokens';
import type { TripView } from './model';
import { StaySheet, stayNights, zoneName } from './StaySheet';

/** D1 · Where the user stays, night by night: one line per stay, tap to edit, a link to add another. */
export function StaysSection({ trip }: { trip: TripView }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Stay | null | undefined>(undefined);

  return (
    <View style={styles.root}>
      {trip.stays.map((stay) => (
        <StayRow key={stay.id} stay={stay} onPress={() => setEditing(stay)} />
      ))}
      <Pressable
        accessibilityRole="button"
        onPress={() => setEditing(null)}
        hitSlop={6}
        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
      >
        <Icon name={trip.stays.length === 0 ? 'bed-outline' : 'add'} size={16} color={colors.accent} />
        <AppText variant="caption" color="accent" style={styles.bold}>
          {trip.stays.length === 0 ? t('stays.addFirst') : t('stays.addAnother')}
        </AppText>
      </Pressable>
      <StaySheet trip={trip} stay={editing ?? null} visible={editing !== undefined} onClose={() => setEditing(undefined)} />
    </View>
  );
}

function StayRow({ stay, onPress }: { stay: Stay; onPress: () => void }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const display = usePlaceDisplay(
    stay.place ?? { source: 'custom', googlePlaceId: null, name: null, address: null, category: 'stay', myLabel: null },
  );
  const title = stay.label ?? (stay.place ? display.name : t('stays.untitled'));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('stays.editHint')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Icon name="bed-outline" size={16} color={colors.textSecondary} />
      <AppText variant="caption" color="secondary" style={styles.flex} numberOfLines={1}>
        {[title, stayNights(stay, locale, t('stays.wholeTrip'))].join(' · ')}
      </AppText>
      {stay.place ? <Icon name="location" size={14} color={colors.accent} /> : null}
      {stay.timeZone ? (
        <AppText variant="caption" color="tertiary" numberOfLines={1}>
          {zoneName(stay.timeZone)}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  pressed: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 28, borderRadius: radii.sm },
  add: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 28 },
});
