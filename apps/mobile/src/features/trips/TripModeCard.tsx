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
import { colors, radii, shadows, spacing } from '@/theme/tokens';
import { countByDay, formatStartTime, nextStop, placesForDay, wishlistPlaces, type TripMode } from './itinerary';
import { useTrip } from './queries';

/**
 * Home's focus card. Before the trip: a countdown and how much is planned.
 * During the trip: today's plan with the next stop, directions and "Done".
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

  const overline =
    mode.phase === 'during'
      ? t('tripMode.dayOf', { day: mode.dayNumber, total: mode.totalDays })
      : mode.daysUntil === 1
        ? t('tripMode.tomorrow')
        : t('tripMode.inDays', { count: mode.daysUntil });

  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" onPress={openTrip} style={styles.header}>
        <View style={styles.flex}>
          <AppText variant="overline" color="accent">
            {overline.toUpperCase()}
          </AppText>
          <AppText variant="title">{mode.trip.title}</AppText>
          <AppText variant="caption" color="secondary">
            {formatTripDates(mode.trip.startDate, mode.trip.endDate, locale)}
          </AppText>
        </View>
        <View style={styles.headerIcon}>
          <Icon name={mode.phase === 'during' ? 'navigate' : 'airplane'} size={22} color={colors.textOnAccent} />
        </View>
      </Pressable>

      {detail.isPending ? (
        <ActivityIndicator color={colors.accent} />
      ) : detail.isError ? (
        <Button label={t('tripMode.openTrip')} variant="secondary" onPress={openTrip} />
      ) : mode.phase === 'before' ? (
        <BeforeTrip places={detail.data.places} totalDays={tripDays(detail.data.startDate, detail.data.endDate).length} hasBase={detail.data.baseLocation !== null} tripId={mode.trip.id} onOpen={openTrip} />
      ) : (
        <Today stops={placesForDay(detail.data.places, tripToday ?? today)} tripId={mode.trip.id} onOpen={openTrip} />
      )}

      <Button
        label={mode.phase === 'during' ? t('tripMode.openToday') : t('tripMode.previewToday')}
        icon={mode.phase === 'during' ? 'compass' : 'eye-outline'}
        variant={mode.phase === 'during' ? 'primary' : 'secondary'}
        onPress={openToday}
      />
    </View>
  );
}

function BeforeTrip({
  places,
  totalDays,
  hasBase,
  tripId,
  onOpen,
}: {
  places: readonly TripPlace[];
  totalDays: number;
  hasBase: boolean;
  tripId: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const plannedDays = countByDay(places).size;
  const planned = places.length - wishlistPlaces(places).length;
  return (
    <>
      <View style={styles.stats}>
        <Stat value={String(planned)} label={t('tripMode.planned')} />
        <Stat value={String(places.length - planned)} label={t('tripMode.onWishlist')} />
        <Stat value={`${plannedDays}/${totalDays}`} label={t('tripMode.daysPlanned')} />
      </View>
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
      <Button label={plannedDays < totalDays ? t('tripMode.keepPlanning') : t('tripMode.openPlan')} icon="calendar-outline" onPress={onOpen} />
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="title">{value}</AppText>
      <AppText variant="caption" color="secondary" align="center">
        {label}
      </AppText>
    </View>
  );
}

function Today({ stops, tripId, onOpen }: { stops: readonly TripPlace[]; tripId: string; onOpen: () => void }) {
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
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <Button label={t('tripMode.planToday')} icon="calendar-outline" onPress={onOpen} />
          </View>
          <Button
            label={t('tripDetail.discover')}
            icon="sparkles"
            variant="secondary"
            block={false}
            onPress={() => router.push({ pathname: '/trips/[id]/discover', params: { id: tripId } })}
          />
        </View>
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
          <Icon name="checkmark-done-circle" size={28} color={colors.success} />
          <AppText variant="bodyStrong" style={styles.flex}>
            {t('tripMode.allDone')}
          </AppText>
        </View>
      )}
      {setVisited.isError ? <InlineError message={errorMessage(setVisited.error)} /> : null}

      <View style={styles.list}>
        {stops.map((stop, index) => (
          <StopLine
            key={stop.id}
            stop={stop}
            number={index + 1}
            current={stop.id === next?.id}
            onToggle={() => setVisited.mutate({ id: stop.id, visited: stop.visitedAt === null })}
          />
        ))}
      </View>

      <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.footer, pressed && styles.pressed]}>
        <AppText variant="caption" color="secondary" style={styles.flex}>
          {t('tripMode.doneOf', { done, total: stops.length })}
        </AppText>
        <AppText variant="caption" color="accent" style={styles.bold}>
          {t('tripMode.seeToday')}
        </AppText>
        <Icon name="chevron-forward" size={14} color={colors.accent} flipInRtl />
      </Pressable>
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
      <AppText variant="overline" color="tertiary">
        {(stop.startTime
          ? t('tripMode.nextAt', { number, time: formatStartTime(stop.startTime, locale) })
          : t('tripMode.next', { number })
        ).toUpperCase()}
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
        {stop.source === 'google' && display.google ? (
          <GoogleAttribution inline align="start" />
        ) : null}
      </Pressable>
      <View style={styles.buttons}>
        <View style={styles.flex}>
          <Button label={t('places.directions')} icon="navigate" onPress={directions} />
        </View>
        <Button label={t('tripMode.done')} icon="checkmark" variant="secondary" block={false} loading={marking} onPress={onDone} />
      </View>
    </View>
  );
}

function StopLine({
  stop,
  number,
  current,
  onToggle,
}: {
  stop: TripPlace;
  number: number;
  current: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const display = usePlaceDisplay(stop);
  const visited = stop.visitedAt !== null;
  return (
    <View style={styles.line}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: visited }}
        accessibilityLabel={t('tripMode.markDone', { name: display.name })}
        hitSlop={8}
        onPress={onToggle}
        style={[styles.lineCheck, visited && styles.lineCheckDone, current && styles.lineCheckCurrent]}
      >
        {visited ? (
          <Icon name="checkmark" size={14} color={colors.textOnAccent} />
        ) : (
          <AppText variant="caption" style={[styles.bold, current ? styles.onAccent : styles.accentText]}>
            {number}
          </AppText>
        )}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={styles.flex}
        onPress={() => router.push({ pathname: '/places/[id]', params: { id: stop.id } })}
      >
        <AppText
          variant="body"
          numberOfLines={1}
          color={visited ? 'tertiary' : 'primary'}
          style={visited ? styles.struck : undefined}
        >
          {display.name}
        </AppText>
      </Pressable>
      {stop.startTime ? (
        <AppText variant="caption" color="secondary">
          {formatStartTime(stop.startTime, locale)}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    ...shadows.card,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  bold: { fontWeight: '700' },
  onAccent: { color: colors.textOnAccent },
  accentText: { color: colors.accent },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.background,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.accentSoft,
  },
  buttons: { flexDirection: 'row', gap: spacing.md },
  next: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.background,
  },
  allDone: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  list: { gap: spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lineCheck: {
    width: 26,
    height: 26,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineCheckCurrent: { backgroundColor: colors.accent },
  lineCheckDone: { backgroundColor: colors.success, borderColor: colors.success },
  struck: { textDecorationLine: 'line-through' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
