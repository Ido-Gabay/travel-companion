import { googleMapsDirectionsUrl, tripDays, type TripPlace } from '@travel-companion/shared';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Icon, InlineError } from '@/components/ui';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { openInMaps } from '@/features/places/open-in-maps';
import { zonedNow } from '@/features/companion/zoned-time';
import { useGooglePlace, useSetVisited } from '@/features/places/queries';
import { usePlaceDisplay } from '@/features/places/use-place-display';
import { useLocale } from '@/i18n/LocaleProvider';
import { formatTripDates } from '@/lib/dates';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing } from '@/theme/tokens';
import { countByDay, formatStartTime, nextStop, placesForDay, wishlistPlaces, type TripMode } from './itinerary';
import { useTrip } from './queries';

/**
 * Home's focus card. Before the trip: a countdown, a one-line summary of the plan and
 * one primary action (keep planning). During the trip: the next stop with Directions
 * and Done, and one primary action (Open Today). The full day lives on Today.
 */
export function TripModeCard({ mode, today }: { mode: TripMode; today: string }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const detail = useTrip(mode.trip.id);
  // During the trip, "today" is the trip's day (pinned hotel's time zone), not the phone's.
  const hotel = useGooglePlace(detail.data?.basePlaceId ?? null);
  const tripToday = hotel.data?.timeZone ? zonedNow(Date.now(), hotel.data.timeZone).day : null;
  const openTrip = () => router.push({ pathname: '/trips/[id]', params: { id: mode.trip.id } });
  const openToday = () =>
    router.push({
      pathname: '/today',
      params: mode.phase === 'during' ? { tripId: mode.trip.id } : { tripId: mode.trip.id, preview: '1' },
    });

  const eyebrow =
    mode.phase === 'during'
      ? t('tripMode.dayOf', { day: mode.dayNumber, total: mode.totalDays })
      : mode.daysUntil === 1
        ? t('tripMode.tomorrow')
        : t('tripMode.inDays', { count: mode.daysUntil });

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${mode.trip.title}, ${eyebrow}`}
        onPress={openTrip}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.flex}>
          <AppText variant="label" color="accent">
            {eyebrow}
          </AppText>
          <AppText variant="title" numberOfLines={2}>
            {mode.trip.title}
          </AppText>
          <AppText variant="caption" color="secondary">
            {formatTripDates(mode.trip.startDate, mode.trip.endDate, locale)}
          </AppText>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.textTertiary} flipInRtl />
      </Pressable>

      {detail.isPending ? (
        <ActivityIndicator color={colors.accent} />
      ) : detail.isError ? (
        <Button label={t('tripMode.openTrip')} onPress={openTrip} />
      ) : mode.phase === 'before' ? (
        <BeforeTrip
          places={detail.data.places}
          totalDays={tripDays(detail.data.startDate, detail.data.endDate).length}
          hasBase={detail.data.baseLocation !== null}
          tripId={mode.trip.id}
          onOpen={openTrip}
          onPreview={openToday}
        />
      ) : (
        <Today stops={placesForDay(detail.data.places, tripToday ?? today)} onOpen={openTrip} onToday={openToday} />
      )}
    </View>
  );
}

function BeforeTrip({
  places,
  totalDays,
  hasBase,
  tripId,
  onOpen,
  onPreview,
}: {
  places: readonly TripPlace[];
  totalDays: number;
  hasBase: boolean;
  tripId: string;
  onOpen: () => void;
  onPreview: () => void;
}) {
  const { t } = useTranslation();
  const plannedDays = countByDay(places).size;
  const planned = places.length - wishlistPlaces(places).length;
  return (
    <>
      <AppText variant="body" color="secondary">
        {t('tripMode.summary', {
          planned,
          wishlist: places.length - planned,
          days: plannedDays,
          total: totalDays,
        })}
      </AppText>
      {!hasBase ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/trips/[id]/edit', params: { id: tripId } })}
          style={({ pressed }) => [styles.hint, pressed && styles.pressed]}
        >
          <Icon name="bed-outline" size={18} color={colors.accent} />
          <AppText variant="caption" color="accent" style={styles.flex}>
            {t('tripMode.addStay')}
          </AppText>
          <Icon name="chevron-forward" size={16} color={colors.accent} flipInRtl />
        </Pressable>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={plannedDays < totalDays ? t('tripMode.keepPlanning') : t('tripMode.openPlan')}
          onPress={onOpen}
        />
        <Button label={t('tripMode.previewToday')} variant="ghost" size="sm" onPress={onPreview} />
      </View>
    </>
  );
}

function Today({
  stops,
  onOpen,
  onToday,
}: {
  stops: readonly TripPlace[];
  onOpen: () => void;
  onToday: () => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const setVisited = useSetVisited();
  const next = useMemo(() => nextStop(stops), [stops]);
  const done = stops.filter((stop) => stop.visitedAt !== null).length;

  if (stops.length === 0) {
    return (
      <>
        <AppText variant="body" color="secondary">
          {t('tripMode.nothingToday')}
        </AppText>
        <Button label={t('tripMode.planToday')} onPress={onOpen} />
      </>
    );
  }

  return (
    <>
      {next ? (
        <NextStop
          stop={next}
          number={stops.indexOf(next) + 1}
          marking={setVisited.isPending}
          onDone={() => setVisited.mutate({ id: next.id, visited: true })}
        />
      ) : (
        <View style={styles.allDone}>
          <Icon name="checkmark-done-circle" size={24} color={colors.success} />
          <AppText variant="bodyStrong" style={styles.flex}>
            {t('tripMode.allDone')}
          </AppText>
        </View>
      )}
      {setVisited.isError ? <InlineError message={errorMessage(setVisited.error)} /> : null}
      <View style={styles.actions}>
        <Button label={t('tripMode.openToday')} onPress={onToday} />
        <AppText variant="caption" color="tertiary" align="center">
          {t('tripMode.doneOf', { done, total: stops.length })}
        </AppText>
      </View>
    </>
  );
}

function NextStop({
  stop,
  number,
  marking,
  onDone,
}: {
  stop: TripPlace;
  number: number;
  marking: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const display = usePlaceDisplay(stop);
  const directions = () => {
    if (stop.googlePlaceId) {
      void Linking.openURL(googleMapsDirectionsUrl(stop.googlePlaceId, display.google?.name ?? display.name)).catch(
        () => undefined,
      );
    } else {
      openInMaps(stop.name ?? '', stop.address);
    }
  };

  return (
    <View style={styles.next}>
      <AppText variant="label" color="secondary">
        {stop.startTime
          ? t('tripMode.nextAt', { number, time: formatStartTime(stop.startTime, locale) })
          : t('tripMode.next', { number })}
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/places/[id]', params: { id: stop.id } })}
      >
        <AppText variant="heading" numberOfLines={2}>
          {display.name}
        </AppText>
        {display.typeLabel || display.address ? (
          <AppText variant="caption" color="secondary" numberOfLines={1}>
            {[display.typeLabel, display.address].filter(Boolean).join(' · ')}
          </AppText>
        ) : null}
        {stop.source === 'google' && display.google ? <GoogleAttribution inline align="start" /> : null}
      </Pressable>
      <View style={styles.row}>
        <Button label={t('places.directions')} icon="navigate" variant="secondary" size="sm" block={false} onPress={directions} />
        <Button
          label={t('tripMode.done')}
          icon="checkmark"
          variant="secondary"
          size="sm"
          block={false}
          loading={marking}
          onPress={onDone}
          accessibilityHint={t('tripMode.markDone', { name: display.name })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
  },
  actions: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  next: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.background,
  },
  allDone: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
