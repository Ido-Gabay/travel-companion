import { tripDays, type TripPlace } from '@travel-companion/shared';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { AppText, Button, EmptyState, ErrorState, Icon, LoadingState, NavHeader } from '@/components/ui';
import { formatDistance } from '@/features/companion/geo';
import { useJournal } from '@/features/journal/queries';
import { buildRecap, recapText } from '@/features/journal/recap';
import { useMe } from '@/features/me/queries';
import { useOfflineCoords } from '@/features/offline/OfflineProvider';
import { useGooglePlaces } from '@/features/places/queries';
import { fallbackName } from '@/features/places/use-place-display';
import { dayTitle } from '@/features/trips/itinerary';
import { useTrip } from '@/features/trips/queries';
import { useLocale } from '@/i18n/LocaleProvider';
import { formatTripDates } from '@/lib/dates';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing } from '@/theme/tokens';

/** M15: the trip recap: numbers, highlights, each day's note and rating, and Share. */
export default function RecapScreen() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const errorMessage = useErrorMessage();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const trip = useTrip(id);
  const journal = useJournal(id);
  const me = useMe();
  const coordsFor = useOfflineCoords();
  const ids = useMemo(
    () => [...new Set((trip.data?.places ?? []).flatMap((place) => (place.googlePlaceId ? [place.googlePlaceId] : [])))],
    [trip.data],
  );
  const details = useGooglePlaces(ids);

  const nameOf = (place: TripPlace) =>
    (place.googlePlaceId ? details.get(place.googlePlaceId)?.name : null) ?? place.name ?? fallbackName(place, t);

  const recap = useMemo(() => {
    if (!trip.data) return null;
    return buildRecap(trip.data, journal.data, tripDays(trip.data.startDate, trip.data.endDate), (place) =>
      place.googlePlaceId ? (details.get(place.googlePlaceId)?.location ?? coordsFor(place.googlePlaceId)) : null,
    );
  }, [trip.data, journal.data, details, coordsFor]);

  if (!trip.data || !recap) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <NavHeader title={t('journal.recap')} mode="close" />
        {trip.isPending ? <LoadingState /> : <ErrorState message={errorMessage(trip.error)} onRetry={() => void trip.refetch()} />}
      </SafeAreaView>
    );
  }

  const data = trip.data;
  const distance = recap.meters !== null ? formatDistance(recap.meters, locale, me.data?.preferences.distanceUnit) : null;
  const summary = [
    t('journal.statDays', { count: recap.days }),
    t('journal.statPlaces', { visited: recap.visited, planned: recap.planned }),
    distance ? t('journal.statDistance', { distance }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const dates = formatTripDates(data.startDate, data.endDate, locale);
  const anything = recap.visited > 0 || recap.highlights.length > 0 || recap.entries.some((entry) => entry.note || entry.rating);
  const share = () =>
    void Share.share({
      message: recapText(recap, {
        title: data.title,
        dates,
        summary,
        highlightsLabel: t('journal.highlights'),
        nameOf,
        dayTitle: (day) => dayTitle(day, locale),
      }),
    }).catch(() => undefined);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <NavHeader title={t('journal.recap')} mode="close" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <AppText variant="display" accessibilityRole="header">
            {data.title}
          </AppText>
          {dates ? (
            <AppText variant="body" color="secondary">
              {dates}
            </AppText>
          ) : null}
          <AppText variant="bodyStrong">{summary}</AppText>
        </View>

        {!anything ? (
          <EmptyState icon="book-outline" title={t('journal.emptyTitle')} body={t('journal.emptyBody')} />
        ) : (
          <>
            {recap.highlights.length > 0 ? (
              <View style={styles.card}>
                <AppText variant="label" color="secondary">
                  {t('journal.highlights')}
                </AppText>
                {recap.highlights.map((place) => (
                  <View key={place.id} style={styles.row}>
                    <Icon name="star" size={16} color={colors.accent} />
                    <AppText variant="body" style={styles.flex} numberOfLines={1}>
                      {nameOf(place)}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : null}

            {recap.entries
              .filter((entry) => entry.done.length > 0 || entry.note || entry.rating)
              .map((entry) => (
                <View key={entry.day} style={styles.card}>
                  <View style={styles.row}>
                    <AppText variant="heading" style={styles.flex}>
                      {dayTitle(entry.day, locale)}
                    </AppText>
                    {entry.rating ? (
                      <AppText variant="body" color="accent" accessibilityLabel={t('journal.rating', { rating: entry.rating })}>
                        {'★'.repeat(entry.rating)}
                      </AppText>
                    ) : null}
                  </View>
                  {entry.done.length > 0 ? (
                    <AppText variant="body" color="secondary">
                      {entry.done.map(nameOf).join(' → ')}
                    </AppText>
                  ) : null}
                  {entry.note ? <AppText variant="body">{entry.note}</AppText> : null}
                </View>
              ))}
            {ids.length > 0 ? <GoogleAttribution inline /> : null}
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button label={t('journal.share')} icon="share-outline" onPress={share} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.huge },
  hero: { gap: spacing.xs },
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radii.card, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  footer: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
});
