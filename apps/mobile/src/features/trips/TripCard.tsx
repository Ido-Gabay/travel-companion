import type { Trip } from '@travel-companion/shared';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Card, Icon } from '@/components/ui';
import { useLocale } from '@/i18n/LocaleProvider';
import { formatTripDates } from '@/lib/dates';
import { colors, radii, spacing } from '@/theme/tokens';

/** Opens the trip on tap. */
export function TripCard({ trip }: { trip: Trip }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dates = formatTripDates(trip.startDate, trip.endDate, locale);

  return (
    <Card
      onPress={() => router.push({ pathname: '/trips/[id]', params: { id: trip.id } })}
      accessibilityLabel={trip.title}
    >
      <View style={styles.row}>
        <View style={styles.badge}>
          <Icon name="airplane-outline" size={20} color={colors.accent} flipInRtl />
        </View>
        <View style={styles.text}>
          <AppText variant="heading" numberOfLines={1}>
            {trip.title}
          </AppText>
          <AppText variant="body" color="secondary" numberOfLines={1}>
            {trip.destination ?? t('trips.noDestination')}
          </AppText>
          <View style={styles.dates}>
            <Icon name="calendar-outline" size={14} color={colors.textTertiary} />
            <AppText variant="caption" color="tertiary">
              {dates ?? t('trips.noDates')}
            </AppText>
            {trip.placeCount > 0 ? (
              <>
                <Icon name="bookmark-outline" size={14} color={colors.textTertiary} />
                <AppText variant="caption" color="tertiary">
                  {t('trips.placeCount', { count: trip.placeCount })}
                </AppText>
              </>
            ) : null}
          </View>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.textTertiary} flipInRtl />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: spacing.xxs },
  dates: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
});
