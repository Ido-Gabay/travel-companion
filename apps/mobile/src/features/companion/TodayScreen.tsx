import {
  googleMapsDirectionsUrl,
  tripDays,
  type LatLng,
  type TripDetail,
} from '@travel-companion/shared';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppText, Button, Card, EmptyState, ErrorState, Icon, InlineError, LoadingState, NavHeader } from '@/components/ui';
import { useMe } from '@/features/me/queries';
import { CATEGORY_ICONS } from '@/features/places/categories';
import { openInMaps } from '@/features/places/open-in-maps';
import { useGooglePlace, useGooglePlaces, usePlaces, useSetVisited } from '@/features/places/queries';
import { dayChipParts, dayTitle, formatStartTime, initialDay, placesForDay } from '@/features/trips/itinerary';
import { useTrip } from '@/features/trips/queries';
import { formatDurationShort, TimeSheet } from '@/features/trips/TimeSheet';
import { useLocale } from '@/i18n/LocaleProvider';
import { toIsoDate } from '@/lib/dates';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, shadows, spacing } from '@/theme/tokens';
import { useDismissals } from './dismissals';
import { formatDistance } from './geo';
import { useCurrentLocation } from './location';
import { useTodayAction } from './today-actions';
import {
  computeToday,
  toClock,
  toMinutes,
  type Candidate,
  type EngineStop,
  type Hint,
  type Origin,
  type Suggestion,
  type TimelineItem,
  type TodayAction,
} from './today-engine';
import type { TravelEstimate } from './travel';

/** Google places looked up for suggestions (Place Details Pro, free tier, cached for the session). */
const MAX_CANDIDATES = 40;
const DEFAULT_PREVIEW_TIME = '10:00';

/** The clock, refreshed every 30 seconds so leave-by countdowns stay current. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * Live Today: answers "where am I in my day", "what's next and when do I
 * leave", "what can I do with the time I have" and "should I change my plan".
 * Location is read once when the screen opens (and on refresh), never in the
 * background. Every change is a suggestion the user accepts or dismisses.
 * Outside the trip dates it runs as a clearly labeled preview.
 */
export function TodayScreen({ tripId, forcePreview }: { tripId: string; forcePreview: boolean }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const trip = useTrip(tripId);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <NavHeader title={t('today.title')} />
      {trip.isPending ? (
        <LoadingState />
      ) : trip.isError ? (
        <ErrorState message={errorMessage(trip.error)} onRetry={() => void trip.refetch()} />
      ) : (
        <TodayContent trip={trip.data} forcePreview={forcePreview} onRefreshTrip={() => void trip.refetch()} refreshing={trip.isRefetching} />
      )}
    </SafeAreaView>
  );
}

function TodayContent({
  trip,
  forcePreview,
  onRefreshTrip,
  refreshing,
}: {
  trip: TripDetail;
  forcePreview: boolean;
  onRefreshTrip: () => void;
  refreshing: boolean;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const errorMessage = useErrorMessage();
  const distanceUnit = useMe().data?.preferences.distanceUnit ?? 'km';
  const collection = usePlaces();
  const location = useCurrentLocation();
  const setVisited = useSetVisited();
  const now = useNow();

  const days = useMemo(() => tripDays(trip.startDate, trip.endDate), [trip.startDate, trip.endDate]);
  const realToday = toIsoDate(now);
  const live = !forcePreview && days.includes(realToday);

  // Preview: pretend a trip day and a time (for planning and testing before the trip).
  const [previewDay, setPreviewDay] = useState<string | null>(() => initialDay(days, realToday));
  const [previewTime, setPreviewTime] = useState(DEFAULT_PREVIEW_TIME);
  const [pickingTime, setPickingTime] = useState(false);
  const day = live ? realToday : previewDay;
  const nowMinutes = live ? now.getHours() * 60 + now.getMinutes() : toMinutes(previewTime);
  const dayIndex = day ? days.indexOf(day) : -1;
  const tomorrow = dayIndex >= 0 && dayIndex < days.length - 1 ? (days[dayIndex + 1] ?? null) : null;

  // One location reading when Today opens for real (not in preview).
  const { locate } = location;
  useEffect(() => {
    if (live) void locate();
    // Only on open; refresh asks again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  const here: LatLng | null = location.state.status === 'ready' ? location.state.coords : null;

  const hotel = useGooglePlace(trip.basePlaceId);
  const { dismissed, dismiss } = useDismissals(trip.id, day);
  const act = useTodayAction(trip.id, day ?? '', tomorrow);

  // The day's stops and the places that could fill free time.
  const stops = useMemo(() => (day ? placesForDay(trip.places, day) : []), [trip.places, day]);
  const tripPlaceIds = useMemo(() => new Set(trip.places.map((place) => place.id)), [trip.places]);
  const candidatePlaces = useMemo(() => {
    const wishlist = trip.places
      .filter((place) => place.day === null && place.visitedAt === null)
      .map((place) => ({ place, source: 'wishlist' as const }));
    const others = (collection.data?.items ?? [])
      .filter((place) => !tripPlaceIds.has(place.id) && place.visitedAt === null && place.googlePlaceId)
      .map((place) => ({ place, source: 'collection' as const }));
    return [...wishlist, ...others].filter((item) => item.place.googlePlaceId).slice(0, MAX_CANDIDATES);
  }, [trip.places, collection.data, tripPlaceIds]);

  const googleIds = useMemo(
    () => [
      ...new Set(
        [...stops.map((stop) => stop.googlePlaceId), ...candidatePlaces.map((item) => item.place.googlePlaceId)].filter(
          (id): id is string => id !== null,
        ),
      ),
    ],
    [stops, candidatePlaces],
  );
  const details = useGooglePlaces(googleIds);
  const nameOf = (place: { googlePlaceId: string | null; name: string | null }) =>
    (place.googlePlaceId ? details.get(place.googlePlaceId)?.name : place.name) ?? place.name ?? t('common.loading');
  const locationOf = (place: { googlePlaceId: string | null }) =>
    place.googlePlaceId ? (details.get(place.googlePlaceId)?.location ?? null) : null;

  const engineStops: EngineStop[] = stops.map((stop) => ({
    id: stop.id,
    name: nameOf(stop),
    category: stop.category,
    startTime: stop.startTime,
    durationMinutes: stop.durationMinutes,
    visited: stop.visitedAt !== null,
    location: locationOf(stop),
  }));
  const candidates: Candidate[] = candidatePlaces.map(({ place, source }) => ({
    id: place.id,
    name: nameOf(place),
    category: place.category,
    durationMinutes: 'durationMinutes' in place ? (place.durationMinutes as number | null) : null,
    location: locationOf(place),
    source,
  }));

  const result = computeToday({
    stops: engineStops,
    nowMinutes,
    here,
    hotel: hotel.data?.location ?? null,
    candidates,
    dismissed,
    hasTomorrow: tomorrow !== null,
  });

  const clock = (minutes: number) => formatStartTime(toClock(minutes), locale);
  const travelText = (travel: TravelEstimate) =>
    travel.mode === 'walk'
      ? t('today.walk', { min: travel.minutes, dist: formatDistance(travel.meters, locale, distanceUnit) })
      : t('today.transit', { min: travel.minutes, dist: formatDistance(travel.meters, locale, distanceUnit) });
  const nameById = new Map(engineStops.map((stop) => [stop.id, stop.name]));
  const actionLabel = (action: TodayAction): string => {
    switch (action.type) {
      case 'shiftStart':
        return t('today.actionShift', { time: clock(toMinutes(action.startTime)) });
      case 'moveToTomorrow':
        return t('today.actionTomorrow');
      case 'removeFromDay':
        return t('today.actionRemove');
      case 'addToday':
        return action.afterStopId
          ? t('today.actionAddAfter', { name: nameById.get(action.afterStopId) ?? '' })
          : t('today.actionAddNow');
    }
  };

  const refresh = () => {
    onRefreshTrip();
    if (live || here) void location.locate();
  };

  if (days.length === 0 || !day) {
    return (
      <View style={styles.content}>
        <EmptyState
          icon="calendar-outline"
          title={t('itinerary.noDatesTitle')}
          body={t('itinerary.noDatesBody')}
          action={<Button label={t('itinerary.setDates')} variant="secondary" onPress={() => router.push({ pathname: '/trips/[id]/edit', params: { id: trip.id } })} />}
        />
      </View>
    );
  }

  const originText = (origin: Origin | null) =>
    origin === 'here'
      ? t('today.fromHere')
      : origin === 'current'
        ? t('today.fromCurrent')
        : origin === 'previous'
          ? t('today.fromPrevious')
          : origin === 'hotel'
            ? t('today.fromHotel')
            : t('today.fromUnknown');

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      {/* Day + preview controls */}
      <View style={styles.dayHead}>
        <AppText variant="overline" color="accent">
          {(live ? t('today.liveLabel', { day: dayIndex + 1, total: days.length }) : t('today.previewLabel')).toUpperCase()}
        </AppText>
        <AppText variant="display">{dayTitle(day, locale)}</AppText>
        <AppText variant="caption" color="secondary">
          {t('today.nowAt', { time: clock(nowMinutes) })}
          {' · '}
          {location.state.status === 'locating'
            ? t('today.locating')
            : result.hereIgnored
              ? t('today.farAway')
              : here
                ? t('today.usingLocation')
                : t('today.noLocation')}
        </AppText>
      </View>

      {!live ? (
        <Card>
          <AppText variant="caption" color="secondary">
            {t('today.previewBody')}
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
            {days.map((option) => {
              const parts = dayChipParts(option, locale);
              const selected = option === day;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setPreviewDay(option)}
                  style={[styles.dayChip, selected && styles.dayChipOn]}
                >
                  <AppText variant="caption" style={selected ? styles.onAccent : styles.muted}>
                    {parts.weekday}
                  </AppText>
                  <AppText variant="bodyStrong" style={selected ? styles.onAccent : undefined}>
                    {parts.date}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.previewRow}>
            <Button
              label={t('today.previewTime', { time: clock(nowMinutes) })}
              icon="time-outline"
              variant="secondary"
              block={false}
              onPress={() => setPickingTime(true)}
            />
            <Button
              label={here ? t('today.locationOn') : t('today.useLocation')}
              icon="navigate-outline"
              variant="secondary"
              block={false}
              onPress={() => void location.locate()}
            />
          </View>
        </Card>
      ) : null}

      {act.isError ? <InlineError message={errorMessage(act.error)} /> : null}
      {setVisited.isError ? <InlineError message={errorMessage(setVisited.error)} /> : null}

      {/* 2. What's next, and when should I leave? */}
      {result.current ? (
        <View style={styles.currentRow}>
          <Icon name="location" size={18} color={colors.success} />
          <AppText variant="body" style={styles.flex}>
            {t('today.youAreAt', {
              name: result.current.stop.name,
              time: clock(result.current.projectedEnd ?? nowMinutes),
            })}
          </AppText>
          <Button
            label={t('tripMode.done')}
            icon="checkmark"
            variant="secondary"
            block={false}
            onPress={() => result.current && setVisited.mutate({ id: result.current.stop.id, visited: true })}
          />
        </View>
      ) : null}

      {result.next ? (
        <View style={styles.nextCard}>
          <AppText variant="overline" color="tertiary">
            {t('today.next').toUpperCase()}
          </AppText>
          <View style={styles.nextHead}>
            <View style={styles.nextIcon}>
              <Icon name={CATEGORY_ICONS[result.next.stop.category]} size={22} color={colors.textOnAccent} />
            </View>
            <View style={styles.flex}>
              <AppText variant="title" numberOfLines={2}>
                {result.next.stop.name}
              </AppText>
              <AppText variant="caption" color="secondary">
                {result.next.stop.startTime
                  ? t('today.plannedAt', { time: clock(toMinutes(result.next.stop.startTime)) })
                  : t('today.flexible')}
              </AppText>
            </View>
          </View>

          <LeaveLine next={result.next} nowMinutes={nowMinutes} clock={clock} />

          {result.next.travel ? (
            <AppText variant="body" color="secondary">
              {travelText(result.next.travel)} · {originText(result.next.origin)}
            </AppText>
          ) : (
            <AppText variant="caption" color="tertiary">
              {t('today.noTravel')}
            </AppText>
          )}

          <View style={styles.buttons}>
            <View style={styles.flex}>
              <Button
                label={t('places.directions')}
                icon="navigate"
                onPress={() => {
                  const place = stops.find((stop) => stop.id === result.next?.stop.id);
                  if (!place) return;
                  if (place.googlePlaceId) {
                    const mode = result.next?.travel?.mode === 'transit' ? 'transit' : 'walking';
                    void Linking.openURL(googleMapsDirectionsUrl(place.googlePlaceId, nameOf(place), mode)).catch(() => undefined);
                  } else {
                    openInMaps(place.name ?? '', place.address);
                  }
                }}
              />
            </View>
            <Button
              label={t('tripMode.done')}
              icon="checkmark"
              variant="secondary"
              block={false}
              loading={setVisited.isPending}
              onPress={() => result.next && setVisited.mutate({ id: result.next.stop.id, visited: true })}
            />
          </View>
          <AppText variant="caption" color="tertiary">
            {t('today.estimateNote')}
          </AppText>
        </View>
      ) : stops.length > 0 && !result.current ? (
        <View style={styles.doneCard}>
          <Icon name="checkmark-done-circle" size={28} color={colors.success} />
          <AppText variant="bodyStrong" style={styles.flex}>
            {t('tripMode.allDone')}
          </AppText>
        </View>
      ) : null}

      {/* 4. Should I consider changing my plan? */}
      {result.hints.map((hint) => (
        <HintCard
          key={hint.id}
          hint={hint}
          clock={clock}
          busy={act.isPending}
          actionLabel={actionLabel}
          onAction={(action) => act.mutate(action)}
          onDismiss={() => dismiss(hint.id)}
        />
      ))}

      {/* 3. What can I do now with the time available? */}
      <View style={styles.section}>
        <AppText variant="overline" color="tertiary">
          {t('today.timeAvailable').toUpperCase()}
        </AppText>
        {result.free ? (
          <AppText variant="heading">
            {result.free.untilStopId
              ? t('today.freeUntil', {
                  duration: formatDurationShort(result.free.minutes, t),
                  time: clock(result.free.until),
                  name: nameById.get(result.free.untilStopId) ?? '',
                })
              : t('today.freeRestOfDay', { duration: formatDurationShort(result.free.minutes, t) })}
          </AppText>
        ) : result.next?.leaveBy != null ? (
          <AppText variant="body" color="secondary">
            {t('today.noFreeTime')}
          </AppText>
        ) : null}
        {result.suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            travelText={travelText}
            busy={act.isPending}
            actionLabel={actionLabel}
            onAccept={() => act.mutate(suggestion.action)}
            onDismiss={() => dismiss(suggestion.id)}
          />
        ))}
        {result.free && result.suggestions.length === 0 ? (
          <AppText variant="caption" color="secondary">
            {result.origin ? t('today.nothingFits') : t('today.needLocation')}
          </AppText>
        ) : null}
        <Button
          label={t('today.discoverNearby')}
          icon="search"
          variant="secondary"
          onPress={() => router.push({ pathname: '/trips/[id]/discover', params: { id: trip.id } })}
        />
      </View>

      {/* 1. Where am I in my day? */}
      <View style={styles.section}>
        <View style={styles.rowBetween}>
          <AppText variant="overline" color="tertiary">
            {t('today.yourDay').toUpperCase()}
          </AppText>
          <AppText variant="caption" color="secondary">
            {t('tripMode.doneOf', { done: result.done, total: result.total })}
          </AppText>
        </View>
        {result.total > 0 ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round((result.done / result.total) * 100)}%` }]} />
          </View>
        ) : null}
        {result.timeline.length === 0 ? (
          <EmptyState
            icon="sunny-outline"
            title={t('today.nothingPlanned')}
            body={t('today.nothingPlannedBody')}
            action={<Button label={t('today.openItinerary')} variant="secondary" onPress={() => router.push({ pathname: '/trips/[id]', params: { id: trip.id } })} />}
          />
        ) : (
          result.timeline.map((item, index) => (
            <TimelineRow
              key={item.stop.id}
              item={item}
              last={index === result.timeline.length - 1}
              clock={clock}
              travelText={travelText}
              onOpen={() => router.push({ pathname: '/places/[id]', params: { id: item.stop.id } })}
            />
          ))
        )}
        {result.dayEndsAt !== null ? (
          <AppText variant="caption" color="secondary">
            {t('today.dayEnds', { time: clock(result.dayEndsAt) })}
          </AppText>
        ) : null}
      </View>

      <AppText variant="caption" color="tertiary" style={styles.footnote}>
        {t('today.footnote')}
      </AppText>

      {act.isPending ? <ActivityIndicator color={colors.accent} /> : null}

      <TimeSheet
        visible={pickingTime}
        placeName={t('today.previewLabel')}
        title={t('today.pickPreviewTime')}
        value={{ startTime: previewTime, durationMinutes: null }}
        defaultDuration={0}
        showDuration={false}
        onSave={(value) => {
          if (value.startTime) setPreviewTime(value.startTime);
          setPickingTime(false);
        }}
        onClose={() => setPickingTime(false)}
      />
    </ScrollView>
  );
}

function LeaveLine({
  next,
  nowMinutes,
  clock,
}: {
  next: NonNullable<ReturnType<typeof computeToday>['next']>;
  nowMinutes: number;
  clock: (minutes: number) => string;
}) {
  const { t } = useTranslation();
  if (next.lateBy > 0) {
    return (
      <View style={[styles.leave, styles.leaveLate]}>
        <Icon name="alert-circle" size={18} color={colors.danger} />
        <AppText variant="bodyStrong" style={styles.lateText}>
          {t('today.leaveNowLate', { min: next.lateBy })}
        </AppText>
      </View>
    );
  }
  if (next.leaveBy === null) {
    return next.arriveAt !== null ? (
      <View style={styles.leave}>
        <Icon name="walk-outline" size={18} color={colors.accent} />
        <AppText variant="bodyStrong" color="accent">
          {t('today.goWhenReady', { time: clock(next.arriveAt) })}
        </AppText>
      </View>
    ) : null;
  }
  const inMinutes = next.leaveBy - nowMinutes;
  return (
    <View style={styles.leave}>
      <Icon name="time" size={18} color={colors.accent} />
      <AppText variant="bodyStrong" color="accent">
        {inMinutes <= 0 ? t('today.leaveNow') : t('today.leaveBy', { time: clock(next.leaveBy), min: inMinutes })}
      </AppText>
    </View>
  );
}

function HintCard({
  hint,
  clock,
  busy,
  actionLabel,
  onAction,
  onDismiss,
}: {
  hint: Hint;
  clock: (minutes: number) => string;
  busy: boolean;
  actionLabel: (action: TodayAction) => string;
  onAction: (action: TodayAction) => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.hint}>
      <View style={styles.hintHead}>
        <Icon name={hint.kind === 'late' ? 'hourglass-outline' : 'moon-outline'} size={20} color={colors.danger} />
        <AppText variant="bodyStrong" style={styles.flex}>
          {hint.kind === 'late'
            ? t('today.hintLate', { min: hint.lateBy, name: hint.stopName })
            : t('today.hintOverbooked', { time: clock(hint.endsAt), name: hint.stopName })}
        </AppText>
      </View>
      <AppText variant="caption" color="secondary">
        {t('today.suggestOnly')}
      </AppText>
      <View style={styles.hintActions}>
        {hint.actions.map((action) => (
          <Button
            key={action.type}
            label={actionLabel(action)}
            variant="secondary"
            block={false}
            disabled={busy}
            onPress={() => onAction(action)}
          />
        ))}
        <Pressable accessibilityRole="button" onPress={onDismiss} hitSlop={8} style={styles.dismiss}>
          <AppText variant="caption" color="secondary" style={styles.bold}>
            {t('today.dismiss')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function SuggestionCard({
  suggestion,
  travelText,
  busy,
  actionLabel,
  onAccept,
  onDismiss,
}: {
  suggestion: Suggestion;
  travelText: (travel: TravelEstimate) => string;
  busy: boolean;
  actionLabel: (action: TodayAction) => string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const { candidate } = suggestion;
  return (
    <View style={styles.suggestion}>
      <View style={styles.suggestionHead}>
        <View style={styles.badge}>
          <Icon name={CATEGORY_ICONS[candidate.category]} size={18} color={colors.accent} />
        </View>
        <View style={styles.flex}>
          <AppText variant="heading" numberOfLines={1}>
            {candidate.name}
          </AppText>
          <AppText variant="caption" color="secondary">
            {travelText(suggestion.travel)} · {t('today.visitAbout', { duration: formatDurationShort(suggestion.visitMinutes, t) })}
          </AppText>
          <AppText variant="caption" color={suggestion.fits ? 'accent' : 'tertiary'} style={styles.bold}>
            {suggestion.fits ? t('today.fits') : t('today.nearby')} ·{' '}
            {candidate.source === 'wishlist' ? t('today.fromWishlist') : t('today.fromCollection')}
          </AppText>
        </View>
      </View>
      <View style={styles.hintActions}>
        <Button label={actionLabel(suggestion.action)} icon="add" variant="secondary" block={false} disabled={busy} onPress={onAccept} />
        <Pressable accessibilityRole="button" onPress={onDismiss} hitSlop={8} style={styles.dismiss}>
          <AppText variant="caption" color="secondary" style={styles.bold}>
            {t('today.dismiss')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function TimelineRow({
  item,
  last,
  clock,
  travelText,
  onOpen,
}: {
  item: TimelineItem;
  last: boolean;
  clock: (minutes: number) => string;
  travelText: (travel: TravelEstimate) => string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const done = item.status === 'done';
  const time =
    item.plannedStart !== null
      ? clock(item.plannedStart)
      : item.projectedStart !== null
        ? `≈ ${clock(item.projectedStart)}`
        : null;
  return (
    <View>
      {item.travel && !done ? (
        <AppText variant="caption" color="tertiary" style={styles.travelLine}>
          {travelText(item.travel)}
        </AppText>
      ) : null}
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.timelineRow}>
        <View style={styles.rail}>
          <View
            style={[
              styles.dot,
              done && styles.dotDone,
              item.status === 'now' && styles.dotNow,
              item.status === 'next' && styles.dotNext,
            ]}
          >
            {done ? <Icon name="checkmark" size={12} color={colors.textOnAccent} /> : null}
          </View>
          {!last ? <View style={styles.railLine} /> : null}
        </View>
        <View style={styles.flex}>
          <AppText
            variant="bodyStrong"
            numberOfLines={1}
            color={done ? 'tertiary' : 'primary'}
            style={done ? styles.struck : undefined}
          >
            {item.stop.name}
          </AppText>
          <AppText variant="caption" color="secondary">
            {[
              time,
              formatDurationShort(item.visitMinutes, t),
              item.status === 'now' ? t('today.statusNow') : item.status === 'next' ? t('today.statusNext') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.huge, gap: spacing.lg },
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  muted: { color: colors.textSecondary },
  onAccent: { color: colors.textOnAccent },
  dayHead: { gap: spacing.xxs },
  dayStrip: { gap: spacing.sm, paddingVertical: spacing.sm },
  dayChip: {
    width: 52,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dayChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: '#E6F2E9',
  },
  nextCard: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    ...shadows.card,
  },
  nextHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nextIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
  },
  leaveLate: { backgroundColor: colors.dangerSoft },
  lateText: { color: colors.danger, flex: 1 },
  buttons: { flexDirection: 'row', gap: spacing.md },
  doneCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  hint: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.dangerSoft,
  },
  hintHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  hintActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  dismiss: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  section: { gap: spacing.md },
  suggestion: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  suggestionHead: { flexDirection: 'row', gap: spacing.md },
  badge: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  track: { height: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radii.pill, backgroundColor: colors.success },
  travelLine: { paddingStart: 32, paddingVertical: spacing.xxs },
  timelineRow: { flexDirection: 'row', gap: spacing.md, minHeight: 48 },
  rail: { width: 20, alignItems: 'center' },
  dot: {
    width: 18,
    height: 18,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  dotNow: { backgroundColor: colors.success, borderColor: colors.success },
  dotNext: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  railLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  struck: { textDecorationLine: 'line-through' },
  footnote: { textAlign: 'center' },
});
