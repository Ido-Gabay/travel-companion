import {
  googleMapsDirectionsUrl,
  tripDays,
  type LatLng,
  type PlaceCategory,
} from '@travel-companion/shared';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import {
  AppText,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  InlineError,
  LoadingState,
  MapSheet,
  NavHeader,
  useActionMenu,
  type IconName,
  type SheetIndex,
} from '@/components/ui';
import { useMe } from '@/features/me/queries';
import { CATEGORY_ICONS } from '@/features/places/categories';
import { openInMaps } from '@/features/places/open-in-maps';
import { useGooglePlace, useGooglePlacePreviews, useGooglePlaces, usePlaces } from '@/features/places/queries';
import { dayChipParts, dayTitle, formatStartTime, initialDay, placesForDay } from '@/features/trips/itinerary';
import { stayForNight, storedZoneFor, type TripView } from '@/features/trips/model';
import { useSetVisitStatus, useTrip } from '@/features/trips/queries';
import { formatDurationShort, TimeSheet } from '@/features/trips/TimeSheet';
import { useLocale } from '@/i18n/LocaleProvider';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, hitSlop, radii, shadows, spacing, weights } from '@/theme/tokens';
import { OfflineStatus } from '@/features/offline/OfflineStatus';
import { useOfflineCoords } from '@/features/offline/OfflineProvider';
import { usePendingState } from '@/features/offline/ops-store';
import { useConnection } from '@/features/offline/connection';
import { fallbackName } from '@/features/places/use-place-display';
import { TripPlanSheet } from '@/features/planning/TripPlanning';
import { useDismissals } from './dismissals';
import { NEARBY_SAVED_WALK_MIN, nearbyKey, nearbySaved, type NearbySaved } from './nearby-saved';
import type { AssistantResult } from '@/features/assistant/AssistantPanel';
import type { SavedToAdd } from '@/features/planning/TripPlanning';
import { dayWindows } from '@/features/planning/opening-hours';
import { formatDistance } from './geo';
import { useCurrentLocation } from './location';
import { useTodayAction } from './today-actions';
import { TodayMap, type TodayMapHandle } from './TodayMap';
import { useRealRoutes, type PlannedLeg } from './real-routes';
import { buildTodayMap, locationAge } from './today-map';
import { zonedNow } from './zoned-time';
import {
  computeToday,
  toClock,
  toEngineStops,
  toMinutes,
  type Candidate,
  type EngineStop,
  type Hint,
  type Origin,
  type Suggestion,
  type TimelineItem,
  type TodayAction,
  type TodayResult,
} from './today-engine';
import type { TravelEstimate } from './travel';

/** Google places looked up for suggestions (Place Details Pro, free tier, cached for the session). */
const MAX_CANDIDATES = 40;
const DEFAULT_PREVIEW_TIME = '10:00';
/** Free-time suggestions shown at once; dismissing one reveals the next. */
const MAX_SHOWN_SUGGESTIONS = 2;
/** Alerts shown in the collapsed sheet; the rest are one swipe away. */
const MAX_PEEK_ALERTS = 2;
/** Height of the floating top bar under the status bar. */
const TOP_BAR = 64;

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
 * Live Today, map first (U2). The map is the workspace: the day's stops as
 * pins (done, next, later), the next leg, and the last location reading. A
 * bottom sheet carries the next action (collapsed), the day (half) and full
 * control (full).
 *
 * Unchanged rules: location is read once when the screen opens, on refresh or
 * on "Show my location", never continuously or in the background. Every change
 * is a suggestion the user accepts or dismisses. Travel times are on-device
 * estimates, shown only when reliable. Outside the trip dates it runs as a
 * clearly labeled preview.
 */
export function TodayScreen({ tripId, forcePreview }: { tripId: string; forcePreview: boolean }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const trip = useTrip(tripId);

  // M12a: the saved copy is shown even when refreshing fails (offline).
  if (trip.data) {
    return (
      <TodayContent
        trip={trip.data}
        forcePreview={forcePreview}
        onRefreshTrip={() => void trip.refetch()}
        refreshing={trip.isRefetching}
        savedAt={trip.dataUpdatedAt}
        stale={trip.isError}
      />
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <NavHeader title={t('today.title')} />
      {trip.isPending ? (
        <LoadingState />
      ) : (
        <ErrorState message={errorMessage(trip.error)} onRetry={() => void trip.refetch()} />
      )}
    </SafeAreaView>
  );
}

function TodayContent({
  trip,
  forcePreview,
  onRefreshTrip,
  refreshing,
  savedAt,
  stale,
}: {
  trip: TripView;
  forcePreview: boolean;
  onRefreshTrip: () => void;
  refreshing: boolean;
  savedAt: number;
  stale: boolean;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const insets = useSafeAreaInsets();
  const errorMessage = useErrorMessage();
  const openMenu = useActionMenu();
  const distanceUnit = useMe().data?.preferences.distanceUnit ?? 'km';
  const collection = usePlaces();
  const location = useCurrentLocation();
  const setStatus = useSetVisitStatus(trip.id);
  const now = useNow();
  const coordsFor = useOfflineCoords();
  const pending = usePendingState();
  const offline = useConnection() === 'offline' || stale;
  const mapRef = useRef<TodayMapHandle>(null);

  const days = useMemo(() => tripDays(trip.startDate, trip.endDate), [trip.startDate, trip.endDate]);
  // "Today" and "now" in the trip's time zone (pinned hotel), so they're right
  // even if the phone is still on home time; the phone's clock otherwise.
  // D1: the zone stored for the day (stay or trip, confirmed by the user), else the hotel's, else the phone's.
  const hotel = useGooglePlace(trip.basePlaceId);
  const phoneDay = now.toISOString().slice(0, 10);
  const tripNow = zonedNow(now.getTime(), storedZoneFor(trip, phoneDay) ?? hotel.data?.timeZone ?? null);
  const realToday = tripNow.day;
  const live = !forcePreview && days.includes(realToday);

  // Preview: pretend a trip day and a time (for planning and testing before the trip).
  const [previewDay, setPreviewDay] = useState<string | null>(() => initialDay(days, realToday));
  const [previewTime, setPreviewTime] = useState(DEFAULT_PREVIEW_TIME);
  const [pickingTime, setPickingTime] = useState(false);
  const day = live ? realToday : previewDay;
  const nowMinutes = live ? tripNow.minutes : toMinutes(previewTime);
  const dayIndex = day ? days.indexOf(day) : -1;
  const tomorrow = dayIndex >= 0 && dayIndex < days.length - 1 ? (days[dayIndex + 1] ?? null) : null;

  // Map-first state: sheet height, selected stop.
  const [chosenIndex, setChosenIndex] = useState<SheetIndex | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replan, setReplan] = useState<{ request: AssistantResult | null; saved?: SavedToAdd } | null>(null);

  // One location reading when Today opens for real (not in preview).
  const { locate } = location;
  useEffect(() => {
    if (live) void locate();
    // Only on open; refresh and "Show my location" ask again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  const here: LatLng | null = location.state.status === 'ready' ? location.state.coords : null;
  const hereAge = location.state.status === 'ready' ? locationAge(location.state.at, now.getTime()) : null;

  const { dismissed, dismiss } = useDismissals(trip.id, day);
  const act = useTodayAction(trip.id, day ?? '', tomorrow);

  // The day's stops and the places that could fill free time.
  // D1: the day's visits; skipped ones are off today's plan.
  const stops = useMemo(
    () => (day ? placesForDay(trip.places, day).filter((stop) => stop.status !== 'skipped') : []),
    [trip.places, day],
  );
  const tripPlaceIds = useMemo(() => new Set(trip.saved.map((place) => place.id)), [trip.saved]);
  const candidatePlaces = useMemo(() => {
    const wishlist = trip.places
      .filter((place) => place.stopId === null)
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
  // Offline: the place's category instead of Google's name; cached coordinates (≤ 30 days) for travel.
  const nameOf = (place: { googlePlaceId: string | null; name: string | null; category: PlaceCategory; myLabel?: string | null }) =>
    (place.googlePlaceId ? details.get(place.googlePlaceId)?.name : place.name) ?? place.name ?? fallbackName(place, t);
  const locationOf = (place: { googlePlaceId: string | null }) =>
    place.googlePlaceId ? (details.get(place.googlePlaceId)?.location ?? coordsFor(place.googlePlaceId)) : null;

  const engineStops: EngineStop[] = toEngineStops(stops, nameOf, locationOf);
  const candidates: Candidate[] = candidatePlaces.map(({ place, source }) => ({
    id: place.id,
    name: nameOf(place),
    category: place.category,
    durationMinutes: 'durationMinutes' in place ? (place.durationMinutes as number | null) : null,
    location: locationOf(place),
    source,
  }));

  // Where the user sleeps that night (D1 stays), else the trip's main stay.
  const nightStay = stayForNight(trip.stays, day);
  const nightGoogleId = nightStay?.place?.googlePlaceId ?? (nightStay ? null : trip.basePlaceId);
  const nightHotel = useGooglePlace(nightGoogleId);
  const ownPin =
    nightStay?.place?.latitude != null && nightStay.place.longitude != null
      ? { latitude: nightStay.place.latitude, longitude: nightStay.place.longitude }
      : null;
  const hotelPoint = ownPin ?? nightHotel.data?.location ?? coordsFor(nightGoogleId);
  const baseInput = {
    stops: engineStops,
    nowMinutes,
    here,
    hotel: hotelPoint,
    candidates,
    dismissed,
    hasTomorrow: tomorrow !== null,
  };
  // M16: first with on-device estimates, to know which legs matter; then, once
  // Google's real routes for those legs arrive (online only), again with them.
  const estimated = computeToday(baseInput);
  const plannedLegs: PlannedLeg[] = [
    ...(estimated.next
      ? [{ from: estimated.next.from, to: estimated.next.stop.location, departMinutes: live ? null : (estimated.current?.projectedEnd ?? nowMinutes) }]
      : []),
    ...estimated.timeline
      .filter((item) => item.status !== 'done' && item.travel)
      .map((item) => ({
        from: item.from,
        to: item.stop.location,
        departMinutes: item.projectedStart !== null && item.travel ? item.projectedStart - item.travel.minutes : null,
      })),
  ];
  const routeFor = useRealRoutes(plannedLegs, day, hotel.data?.timeZone ?? null);
  const result = routeFor ? computeToday({ ...baseInput, routeFor }) : estimated;
  const mapModel = buildTodayMap(result, result.hereIgnored ? null : here, hotelPoint);
  // With nothing to draw, or before the trip, the list is more useful than an empty map.
  const sheetIndex: SheetIndex = chosenIndex ?? (mapModel.pins.length === 0 || !live ? 1 : 0);

  // Live: places saved to this trip, not on any day, a short walk from here (opening hours only if already known).
  const savedItems = useMemo(() => trip.places.filter((item) => item.stopId === null), [trip.places]);
  const savedPreviews = useGooglePlacePreviews(
    savedItems.flatMap((item) => (item.googlePlaceId ? [item.googlePlaceId] : [])),
    false,
  );
  const hereNow = result.hereIgnored ? null : here;
  const nearby: NearbySaved[] =
    live && day
      ? nearbySaved({
          here: hereNow,
          candidates: savedItems.map((item) => {
            const preview = item.googlePlaceId ? savedPreviews.byId.get(item.googlePlaceId) : undefined;
            const pin = item.latitude != null && item.longitude != null ? { latitude: item.latitude, longitude: item.longitude } : null;
            return {
              id: item.id,
              name: nameOf(item),
              category: item.category,
              durationMinutes: item.durationMinutes,
              location: locationOf(item) ?? pin,
              hours: preview ? (preview.detail === 'full' && preview.openingPeriods.length > 0 ? dayWindows(preview.openingPeriods, day) : null) : undefined,
            };
          }),
          nowMinutes,
          free: result.free,
          planDone: !result.next && !result.current,
          dismissed,
        })
      : [];
  const nearbyIds = new Set(nearby.map((item) => item.candidate.id));
  const lateRequest = (): AssistantResult | null =>
    stops.some((stop) => stop.status === 'planned' && stop.startTime !== null && toMinutes(stop.startTime) < nowMinutes)
      ? { message: t('replan.lateMessage'), instructions: [{ kind: 'catchUp' }], source: 'rules', summary: '', refs: new Map() }
      : null;
  // "Something changed?" for the visit happening now (or the next one): a live request, still only a proposal.
  const openLiveMenu = (stop: { id: string; name: string }) => {
    const target = { ref: 't1', category: null, text: null, day: null };
    const ask = (message: string, instructions: AssistantResult['instructions']) =>
      setReplan({ request: { message, instructions, source: 'rules', summary: '', refs: new Map([['t1', stop.id]]) } });
    openMenu({
      items: [
        { label: t('live.menuClosed'), icon: 'close-circle-outline', onPress: () => ask(t('live.msgClosed', { name: stop.name }), [{ kind: 'closedVisit', target }]) },
        { label: t('live.menuLonger'), icon: 'time-outline', onPress: () => ask(t('live.msgLonger', { name: stop.name }), [{ kind: 'extendVisit', target, extraMinutes: null }]) },
        { label: t('live.menuSkip'), icon: 'play-skip-forward-outline', onPress: () => ask(t('live.msgSkip', { name: stop.name }), [{ kind: 'skipVisit', target }]) },
        { label: t('live.menuLate'), icon: 'hourglass-outline', onPress: () => ask(t('replan.lateMessage'), [{ kind: 'catchUp' }]) },
      ],
    });
  };
  const addSaved = (item: NearbySaved) =>
    setReplan({
      request: { message: t('live.addSavedMessage', { name: item.candidate.name }), instructions: [], source: 'rules', summary: '', refs: new Map() },
      saved: { id: item.candidate.id, name: item.candidate.name, category: item.candidate.category, location: item.candidate.location },
    });
  const openSavedDirections = (item: NearbySaved) => {
    const place = savedItems.find((entry) => entry.id === item.candidate.id);
    if (!place) return;
    if (place.googlePlaceId) {
      void Linking.openURL(googleMapsDirectionsUrl(place.googlePlaceId, item.candidate.name, 'walking')).catch(() => undefined);
    } else if (item.candidate.location) {
      const { latitude, longitude } = item.candidate.location;
      void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=walking`).catch(() => undefined);
    }
  };

  const clock = (minutes: number) => formatStartTime(toClock(minutes), locale);
  const travelText = (travel: TravelEstimate) => {
    const vars = { min: travel.minutes, dist: formatDistance(travel.meters, locale, distanceUnit) };
    // Real routes (Google, M16) are stated plainly; estimates keep their "≈".
    if (travel.source === 'google') return travel.mode === 'walk' ? t('today.walkRoute', vars) : t('today.transitRoute', vars);
    return travel.mode === 'walk' ? t('today.walk', vars) : t('today.transit', vars);
  };
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
  const showMyLocation = async () => {
    const reading = await location.locate();
    if (reading.ok) mapRef.current?.focus(reading.coords);
  };
  const selectStop = (id: string | null, from: 'map' | 'list') => {
    setSelectedId(id);
    if (!id) return;
    if (from === 'map') {
      setChosenIndex(1);
    } else {
      const point = result.timeline.find((item) => item.stop.id === id)?.stop.location;
      if (point) mapRef.current?.focus(point);
    }
  };
  const openDirections = () => {
    const place = stops.find((stop) => stop.id === result.next?.stop.id);
    if (!place) return;
    if (place.googlePlaceId) {
      const mode = result.next?.travel?.mode === 'transit' ? 'transit' : 'walking';
      void Linking.openURL(googleMapsDirectionsUrl(place.googlePlaceId, nameOf(place), mode)).catch(() => undefined);
    } else {
      openInMaps(place.name ?? '', place.address);
    }
  };
  const openItinerary = () => router.push({ pathname: '/trips/[id]', params: { id: trip.id } });
  // Live, "nearby" is near you and can go straight into today; a preview has no "here", so it browses Discover.
  const nearbyLabel = live ? t('live.menuNearby') : t('today.discoverNearby');
  const openNearby = () =>
    live
      ? setReplan({
          request: {
            message: t('live.msgNearby'),
            instructions: [
              { kind: 'findPlace', query: 'tourist attractions', category: 'sights', area: null, nearPlanned: false, nearHere: true, day: null, intent: 'add' },
            ],
            source: 'rules',
            summary: '',
            refs: new Map(),
          },
        })
      : router.push({ pathname: '/trips/[id]/discover', params: { id: trip.id } });

  if (days.length === 0 || !day) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <NavHeader title={t('today.title')} />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="calendar-outline"
            title={t('itinerary.noDatesTitle')}
            body={t('itinerary.noDatesBody')}
            action={
              <Button
                label={t('itinerary.setDates')}
                variant="secondary"
                onPress={() => router.push({ pathname: '/trips/[id]/edit', params: { id: trip.id } })}
              />
            }
          />
        </View>
      </SafeAreaView>
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

  const locationStatus =
    location.state.status === 'locating'
      ? t('today.locating')
      : result.hereIgnored
        ? t('today.farAway')
        : hereAge?.stale
          ? t('today.lastKnown', { min: hereAge.minutes })
          : here
            ? t('today.usingLocation')
            : t('today.noLocation');
  // Live, the chip only mentions location when something is off (the map shows the dot otherwise).
  const locationUnusual = location.state.status === 'locating' || result.hereIgnored || Boolean(hereAge?.stale);
  const hasEstimates = result.timeline.some((item) => item.travel && item.travel.source !== 'google');

  const alerts = peekAlerts(result, pending, offline, t, clock, nearby[0] ?? null, live);
  // The note is only needed while a straight line is drawn (a real route needs no caveat).
  const hasLines = (mapModel.nextLeg !== null && !mapModel.nextLegIsRoute) || mapModel.laterPath.length > 1;
  const topPadding = insets.top + TOP_BAR + (hasLines ? 28 : 0);

  const peek = (
    <View style={styles.peek}>
      {/* Before the trip (or any preview) there is no "now": no progress, lateness or live prompts, just the plan. */}
      {live && result.total > 0 ? (
        <View style={styles.progressRow} accessible accessibilityLabel={t('tripMode.doneOf', { done: result.done, total: result.total })}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round((result.done / result.total) * 100)}%` }]} />
          </View>
          <AppText variant="caption" color="secondary">
            {t('tripMode.doneOf', { done: result.done, total: result.total })}
          </AppText>
        </View>
      ) : null}

      {live && result.current ? (
        <View style={styles.currentRow}>
          <Icon name="location" size={18} color={colors.success} />
          <AppText variant="body" style={styles.flex}>
            {t('today.youAreAt', {
              name: result.current.stop.name,
              time: clock(result.current.projectedEnd ?? nowMinutes),
            })}
          </AppText>
          {live ? (
            <Button
              label={t('tripMode.done')}
              icon="checkmark"
              variant="secondary"
              size="sm"
              block={false}
              onPress={() => result.current && setStatus.mutate({ stopId: result.current.stop.id, status: 'completed' })}
            />
          ) : null}
        </View>
      ) : null}

      {result.next ? (
        <View style={styles.nextBlock}>
          <View style={styles.nextHead}>
            <View style={styles.flex}>
              <AppText variant="label" color="secondary">
                {result.next.stop.startTime
                  ? `${t('today.next')} · ${t('today.plannedAt', { time: clock(toMinutes(result.next.stop.startTime)) })}`
                  : `${t('today.next')} · ${t('today.flexible')}`}
              </AppText>
              <AppText variant="title" numberOfLines={2}>
                {result.next.stop.name}
              </AppText>
            </View>
            <Icon name={CATEGORY_ICONS[result.next.stop.category]} size={22} color={colors.accent} />
          </View>
          <LeaveLine next={result.next} nowMinutes={nowMinutes} clock={clock} live={live} />
          <AppText variant="caption" color={result.next.travel ? 'secondary' : 'tertiary'} testID="today-travel">
            {result.next.travel
              ? `${travelText(result.next.travel)} · ${originText(result.next.origin)}`
              : t('today.noTravel')}
          </AppText>
          {result.next.travel?.source === 'google' ? <GoogleAttribution inline align="start" /> : null}
        </View>
      ) : result.total > 0 && !result.current ? (
        <View style={styles.doneRow}>
          <Icon name="checkmark-done-circle" size={26} color={colors.success} />
          <AppText variant="bodyStrong" style={styles.flex}>
            {t('tripMode.allDone')}
          </AppText>
        </View>
      ) : result.total === 0 ? (
        <View style={styles.doneRow}>
          <Icon name="sunny-outline" size={22} color={colors.accent} />
          <AppText variant="bodyStrong" style={styles.flex}>
            {t('today.nothingPlanned')}
          </AppText>
        </View>
      ) : null}

      {alerts.slice(0, MAX_PEEK_ALERTS).map((alert) => (
        <Pressable
          key={alert.id}
          accessibilityRole="button"
          accessibilityHint={t('today.alertHint')}
          onPress={() => setChosenIndex(2)}
          style={({ pressed }) => [styles.alert, alert.tone === 'danger' && styles.alertDanger, pressed && styles.pressed]}
        >
          <Icon name={alert.icon} size={16} color={alert.tone === 'danger' ? colors.danger : colors.accent} />
          <AppText
            variant="caption"
            color={alert.tone === 'danger' ? 'danger' : 'accent'}
            style={[styles.flex, styles.bold]}
            numberOfLines={2}
          >
            {alert.text}
          </AppText>
          <Icon name="chevron-up" size={14} color={colors.textTertiary} />
        </Pressable>
      ))}

      {result.next ? (
        <View style={styles.buttons}>
          <View style={styles.flex}>
            <Button label={t('places.directions')} icon="navigate" onPress={openDirections} />
          </View>
          {/* One Done at a time: the visit happening now has its own; preview never changes the plan. */}
          {live && !result.current ? (
            <Button
              label={t('tripMode.done')}
              icon="checkmark"
              variant="secondary"
              block={false}
              loading={setStatus.isPending}
              onPress={() => result.next && setStatus.mutate({ stopId: result.next.stop.id, status: 'completed' })}
            />
          ) : null}
        </View>
      ) : result.total === 0 ? (
        <Button label={t('today.openItinerary')} variant="secondary" onPress={openItinerary} />
      ) : null}
      {live && (result.current ?? result.next) ? (
        <Button
          label={t('live.somethingChanged')}
          icon="help-circle-outline"
          variant="ghost"
          size="sm"
          block={false}
          onPress={() => {
            const stop = (result.current ?? result.next)?.stop;
            if (stop) openLiveMenu(stop);
          }}
        />
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <TodayMap
        ref={mapRef}
        model={mapModel}
        hotel={hotelPoint}
        here={here && hereAge && !result.hereIgnored ? { coords: here, ...hereAge } : null}
        selectedId={selectedId}
        onSelect={(id) => selectStop(id, 'map')}
        padding={{ top: topPadding, bottom: sheetHeight }}
      />

      {/* Floating top bar: back, the day, more. */}
      <View style={[styles.topBar, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          hitSlop={hitSlop}
          style={styles.roundButton}
        >
          <Icon name="arrow-back" size={22} color={colors.text} flipInRtl />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={t('today.dayChipHint')}
          onPress={() => setChosenIndex(2)}
          style={styles.dayChip}
          testID="today-day-chip"
        >
          <AppText variant="label" color="accent" numberOfLines={1}>
            {live
              ? t('today.liveLabel', { day: dayIndex + 1, total: days.length })
              : `${t('today.previewLabel')} · ${clock(nowMinutes)}`}
            {' · '}
            <AppText variant="label">{dayTitle(day, locale)}</AppText>
          </AppText>
          <AppText variant="caption" color="secondary" numberOfLines={1}>
            {live
              ? locationUnusual
                ? `${t('today.nowAt', { time: clock(nowMinutes) })} · ${locationStatus}`
                : t('today.nowAt', { time: clock(nowMinutes) })
              : locationStatus}
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('today.more')}
          onPress={() =>
            openMenu({
              items: [
                { label: t('today.openItinerary'), icon: 'list-outline', onPress: openItinerary },
                { label: nearbyLabel, icon: 'search', onPress: openNearby },
                { label: t('today.refresh'), icon: 'refresh', onPress: refresh },
              ],
            })
          }
          hitSlop={hitSlop}
          style={styles.roundButton}
        >
          <Icon name="ellipsis-horizontal" size={22} color={colors.text} />
        </Pressable>
      </View>
      {hasLines ? (
        <View style={[styles.linesNote, { top: insets.top + spacing.sm + TOP_BAR - 4 }]} pointerEvents="none">
          <AppText variant="caption" color="secondary">
            {t('today.mapLines')}
          </AppText>
        </View>
      ) : null}

      {/* Map controls sit just above the sheet, and step aside when it's fully open. */}
      {sheetIndex < 2 && mapModel.frame.length > 0 ? (
        <View style={[styles.controls, { bottom: sheetHeight + spacing.md }]} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('today.fitDay')}
            onPress={() => mapRef.current?.fitDay()}
            hitSlop={hitSlop}
            style={styles.roundButton}
          >
            <Icon name="scan-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('today.locateMe')}
            accessibilityHint={t('today.locateMeHint')}
            onPress={() => void showMyLocation()}
            hitSlop={hitSlop}
            style={styles.roundButton}
          >
            {location.state.status === 'locating' ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Icon name="locate-outline" size={20} color={here && !hereAge?.stale ? colors.location : colors.text} />
            )}
          </Pressable>
        </View>
      ) : null}

      <MapSheet
        index={sheetIndex}
        onIndexChange={setChosenIndex}
        onHeightChange={setSheetHeight}
        peek={peek}
        accessibilityLabel={t('today.sheetLabel')}
        accessibilityHint={t('today.sheetHint')}
        stateLabels={[t('today.sheetCollapsed'), t('today.sheetHalf'), t('today.sheetFull')]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {!live ? (
          <View style={styles.preview}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
              {days.map((option) => {
                const parts = dayChipParts(option, locale);
                const selected = option === day;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setPreviewDay(option);
                      setSelectedId(null);
                    }}
                    style={[styles.dayOption, selected && styles.dayOptionOn]}
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
                size="sm"
                block={false}
                onPress={() => setPickingTime(true)}
              />
              <Button
                label={here ? t('today.locationOn') : t('today.useLocation')}
                icon="navigate-outline"
                variant="secondary"
                size="sm"
                block={false}
                onPress={() => void showMyLocation()}
              />
            </View>
            <AppText variant="caption" color="tertiary">
              {t('today.previewBody')}
            </AppText>
          </View>
        ) : null}

        <OfflineStatus savedAt={savedAt} stale={stale} />
        {act.isError ? <InlineError message={errorMessage(act.error)} /> : null}
        {setStatus.isError ? <InlineError message={errorMessage(setStatus.error)} /> : null}

        {/* Should I consider changing my plan? (Nothing changes until the user picks an action.) */}
        {live
          ? result.hints.map((hint) => (
              <HintRow
                key={hint.id}
                hint={hint}
                clock={clock}
                busy={act.isPending}
                actionLabel={actionLabel}
                onAction={(action) => act.mutate(action)}
                onDismiss={() => dismiss(hint.id)}
              />
            ))
          : null}

        {/* The whole rest of the day at once (a proposal; Apply is a separate tap). */}
        {live && result.done < result.total ? (
          <View style={styles.section}>
            <Button label={t('replan.open')} icon="refresh" variant="secondary" onPress={() => setReplan({ request: lateRequest() })} />
            <AppText variant="caption" color="tertiary">
              {t('replan.openHint')}
            </AppText>
          </View>
        ) : null}

        {/* Saved for this trip but not on a day, and a short walk from here. */}
        {live && savedItems.length > 0 ? (
          <View style={styles.section} testID="today-nearby-saved">
            <AppText variant="heading" accessibilityRole="header">
              {t('live.nearbyTitle')}
            </AppText>
            {!hereNow ? (
              <>
                <AppText variant="body" color="secondary">
                  {result.hereIgnored ? t('live.nearbyFar') : t('live.nearbyNeedLocation')}
                </AppText>
                <Button
                  label={t('live.nearbyCheck')}
                  icon="locate-outline"
                  variant="secondary"
                  size="sm"
                  block={false}
                  loading={location.state.status === 'locating'}
                  onPress={() => void showMyLocation()}
                />
                <AppText variant="caption" color="tertiary">
                  {t('live.locationPrivacy')}
                </AppText>
              </>
            ) : nearby.length === 0 ? (
              <AppText variant="body" color="secondary">
                {t('live.nearbyNone', { min: NEARBY_SAVED_WALK_MIN })}
              </AppText>
            ) : (
              nearby.map((item) => (
                <View key={item.candidate.id} style={styles.suggestion}>
                  <View style={styles.rowBetween}>
                    <AppText variant="bodyStrong" style={styles.flex} numberOfLines={2}>
                      {item.candidate.name}
                    </AppText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('live.nearbyDismiss', { name: item.candidate.name })}
                      onPress={() => dismiss(nearbyKey(item.candidate.id))}
                      hitSlop={hitSlop}
                    >
                      <Icon name="close" size={18} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                  <AppText variant="caption" color="secondary">
                    {[travelText(item.travel), item.hours === 'open' ? t('live.nearbyOpen') : null].filter(Boolean).join(' · ')}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {item.reason === 'fitsFree'
                      ? t('live.nearbyFits', {
                          trip: trip.title,
                          duration: formatDurationShort(item.visitMinutes, t),
                          name: nameById.get(item.untilStopId ?? '') ?? '',
                          time: clock(item.until ?? nowMinutes),
                        })
                      : item.reason === 'dayDone'
                        ? t('live.nearbyDayDone', { trip: trip.title, duration: formatDurationShort(item.visitMinutes, t) })
                        : t('live.nearbyTight', { trip: trip.title })}
                  </AppText>
                  <View style={styles.previewRow}>
                    <Button label={t('live.nearbyAdd')} icon="add" variant="secondary" size="sm" block={false} onPress={() => addSaved(item)} />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('live.nearbyMore', { name: item.candidate.name })}
                      hitSlop={hitSlop}
                      style={styles.moreButton}
                      onPress={() =>
                        openMenu({
                          items: [
                            { label: t('places.directions'), icon: 'navigate-outline', onPress: () => openSavedDirections(item) },
                            {
                              label: t('live.nearbyOpenPlace'),
                              icon: 'information-circle-outline',
                              onPress: () => {
                                const place = savedItems.find((entry) => entry.id === item.candidate.id);
                                if (place) router.push({ pathname: '/places/[id]', params: { id: place.placeId } });
                              },
                            },
                          ],
                        })
                      }
                    >
                      <Icon name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
            {nearby.some((item) => savedItems.find((entry) => entry.id === item.candidate.id)?.googlePlaceId) ? <GoogleAttribution inline /> : null}
          </View>
        ) : null}

        {/* Where am I in my day? */}
        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <AppText variant="heading" accessibilityRole="header">
              {t('today.yourDay')}
            </AppText>
            {result.dayEndsAt !== null ? (
              <AppText variant="caption" color="secondary">
                {t('today.dayEnds', { time: clock(result.dayEndsAt) })}
              </AppText>
            ) : null}
          </View>
          {result.timeline.length === 0 ? (
            <AppText variant="body" color="secondary">
              {t('today.nothingPlannedBody')}
            </AppText>
          ) : (
            <View>
              {result.timeline.map((item, index) => (
                <TimelineRow
                  key={item.stop.id}
                  item={item}
                  number={index + 1}
                  last={index === result.timeline.length - 1}
                  selected={item.stop.id === selectedId}
                  live={live}
                  clock={clock}
                  travelText={travelText}
                  onPress={() =>
                    item.stop.id === selectedId
                      ? router.push({
                          pathname: '/places/[id]',
                          params: { id: stops.find((stop) => stop.id === item.stop.id)?.placeId ?? item.stop.id },
                        })
                      : selectStop(item.stop.id, 'list')
                  }
                />
              ))}
            </View>
          )}
          {mapModel.unmapped > 0 && mapModel.pins.length > 0 ? (
            <AppText variant="caption" color="tertiary">
              {t('today.unmapped', { count: mapModel.unmapped })}
            </AppText>
          ) : null}
          {stops.some((stop) => stop.googlePlaceId) ? <GoogleAttribution inline /> : null}
        </View>

        {/* What can I do now with the time available? */}
        {live && (result.free || result.suggestions.length > 0) ? (
          <View style={styles.section}>
            <AppText variant="heading" accessibilityRole="header">
              {t('today.timeAvailable')}
            </AppText>
            {result.free ? (
              <AppText variant="body" color="secondary">
                {result.free.untilStopId
                  ? t('today.freeUntil', {
                      duration: formatDurationShort(result.free.minutes, t),
                      time: clock(result.free.until),
                      name: nameById.get(result.free.untilStopId) ?? '',
                    })
                  : t('today.freeRestOfDay', { duration: formatDurationShort(result.free.minutes, t) })}
              </AppText>
            ) : null}
            {/* Two at most: dismissing one brings the next. */}
            {result.suggestions.filter((suggestion) => !nearbyIds.has(suggestion.candidate.id)).slice(0, MAX_SHOWN_SUGGESTIONS).map((suggestion) => (
              <SuggestionRow
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
              <>
                <AppText variant="caption" color="secondary">
                  {result.origin ? t('today.nothingFits') : t('today.needLocation')}
                </AppText>
                {result.origin ? (
                  <Button label={nearbyLabel} icon="search" variant="ghost" size="sm" block={false} onPress={openNearby} />
                ) : null}
              </>
            ) : null}
            {result.suggestions.length > 0 ? <GoogleAttribution inline /> : null}
          </View>
        ) : null}

        {/* Only when a travel time on this screen is an estimate (the map's lines have their own note). */}
        {hasEstimates ? (
          <AppText variant="caption" color="tertiary" style={styles.footnote}>
            {t('today.estimateNote')}
          </AppText>
        ) : null}

        {act.isPending ? <ActivityIndicator color={colors.accent} /> : null}
      </MapSheet>

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
      {replan ? (
        <TripPlanSheet
          trip={trip}
          today={day}
          nowMinutes={nowMinutes}
          focusDay={day}
          here={result.hereIgnored ? null : here}
          initialRequest={replan.request}
          initialSaved={replan.saved ?? null}
          onClose={() => setReplan(null)}
        />
      ) : null}
    </View>
  );
}

// TFunction (not the hook's return type): the hook's type grows too deep to check with the full key set.
type TFn = TFunction;

interface PeekAlert {
  id: string;
  tone: 'danger' | 'accent';
  icon: IconName;
  text: string;
}

/**
 * What must be visible without opening the sheet: changes that need a choice,
 * running late, a stop that may not fit today, being offline, free time, and
 * changes waiting to sync. Most urgent first; the peek shows the first two.
 */
function peekAlerts(
  result: TodayResult,
  pending: { ops: readonly unknown[]; conflicts: readonly unknown[] },
  offline: boolean,
  t: TFn,
  clock: (minutes: number) => string,
  nearby: NearbySaved | null,
  live: boolean,
): PeekAlert[] {
  const alerts: PeekAlert[] = [];
  if (pending.conflicts.length > 0) {
    alerts.push({ id: 'conflicts', tone: 'danger', icon: 'alert-circle-outline', text: t('offline.conflicts', { count: pending.conflicts.length }) });
  }
  for (const hint of live ? result.hints : []) {
    alerts.push(
      hint.kind === 'late'
        ? { id: hint.id, tone: 'danger', icon: 'hourglass-outline', text: t('today.hintLate', { min: hint.lateBy, name: hint.stopName }) }
        : { id: hint.id, tone: 'danger', icon: 'moon-outline', text: t('today.alertMayNotFit', { name: hint.stopName, time: clock(hint.endsAt) }) },
    );
  }
  if (nearby && nearby.reason !== 'tight') {
    alerts.push({ id: 'nearby', tone: 'accent', icon: 'bookmark-outline', text: t('live.alertNearby', { name: nearby.candidate.name, min: nearby.travel.minutes }) });
  }
  if (offline) {
    // Details (when the copy was saved) are in the sheet's offline status.
    alerts.push({
      id: 'offline',
      tone: 'accent',
      icon: 'cloud-offline-outline',
      text: pending.ops.length > 0 ? t('today.alertOfflinePending', { count: pending.ops.length }) : t('today.alertOffline'),
    });
  }
  if (live && result.free) {
    const duration = formatDurationShort(result.free.minutes, t);
    alerts.push({
      id: 'free',
      tone: 'accent',
      icon: 'cafe-outline',
      text: result.suggestions.length > 0 ? t('today.alertFreeIdeas', { duration }) : t('today.alertFree', { duration }),
    });
  }
  if (pending.ops.length > 0 && !offline) {
    alerts.push({ id: 'pending', tone: 'accent', icon: 'cloud-upload-outline', text: t('offline.pending', { count: pending.ops.length }) });
  }
  return alerts;
}

function LeaveLine({
  next,
  nowMinutes,
  clock,
  live,
}: {
  next: NonNullable<TodayResult['next']>;
  nowMinutes: number;
  clock: (minutes: number) => string;
  live: boolean;
}) {
  const { t } = useTranslation();
  if (!live) {
    // A preview's time is pretend: say when the plan has you there, never "leave now" or "behind".
    return next.stop.startTime !== null ? (
      <View style={styles.leave} testID="today-be-there">
        <Icon name="flag-outline" size={20} color={colors.accent} />
        <AppText variant="heading" color="accent" style={[styles.flex, styles.tabular]}>
          {t('today.beThereBy', { time: clock(toMinutes(next.stop.startTime)) })}
        </AppText>
      </View>
    ) : null;
  }
  if (next.lateBy > 0) {
    return (
      <View style={styles.leave}>
        <Icon name="alert-circle" size={20} color={colors.danger} />
        <AppText variant="heading" color="danger" style={styles.flex}>
          {t('today.leaveNowLate', { min: next.lateBy })}
        </AppText>
      </View>
    );
  }
  if (next.leaveBy === null && next.stop.startTime !== null) {
    // Travel unknown: say when to be there, never a made-up leave time.
    return (
      <View style={styles.leave} testID="today-be-there">
        <Icon name="flag-outline" size={20} color={colors.accent} />
        <AppText variant="heading" color="accent" style={[styles.flex, styles.tabular]}>
          {t('today.beThereBy', { time: clock(toMinutes(next.stop.startTime)) })}
        </AppText>
      </View>
    );
  }
  if (next.leaveBy === null) {
    return next.arriveAt !== null && next.travel ? (
      <View style={styles.leave}>
        <Icon name="walk-outline" size={20} color={colors.accent} />
        <AppText variant="heading" color="accent" style={styles.flex}>
          {t('today.goWhenReady', { time: clock(next.arriveAt) })}
        </AppText>
      </View>
    ) : null;
  }
  const inMinutes = next.leaveBy - nowMinutes;
  return (
    <View style={styles.leave} testID="today-leave">
      <Icon name="time" size={20} color={colors.accent} />
      {/* The one big number on the screen: when to leave. */}
      <AppText variant="title" color="accent" style={[styles.flex, styles.tabular]}>
        {inMinutes <= 0 ? t('today.leaveNow') : t('today.leaveBy', { time: clock(next.leaveBy), min: inMinutes })}
      </AppText>
    </View>
  );
}

function HintRow({
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
        <Icon name={hint.kind === 'late' ? 'hourglass-outline' : 'moon-outline'} size={18} color={colors.danger} />
        <AppText variant="bodyStrong" style={styles.flex}>
          {hint.kind === 'late'
            ? t('today.hintLate', { min: hint.lateBy, name: hint.stopName })
            : t('today.hintOverbooked', { time: clock(hint.endsAt), name: hint.stopName })}
        </AppText>
      </View>
      <View style={styles.actionsRow}>
        {hint.actions.map((action) => (
          <Button
            key={action.type}
            label={actionLabel(action)}
            variant="secondary"
            size="sm"
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

function SuggestionRow({
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
        <Icon name={CATEGORY_ICONS[candidate.category]} size={20} color={colors.accent} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={1}>
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
      <View style={styles.actionsRow}>
        <Button
          label={actionLabel(suggestion.action)}
          icon="add"
          variant="secondary"
          size="sm"
          block={false}
          disabled={busy}
          onPress={onAccept}
        />
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
  number,
  last,
  selected,
  live,
  clock,
  travelText,
  onPress,
}: {
  item: TimelineItem;
  number: number;
  last: boolean;
  selected: boolean;
  live: boolean;
  clock: (minutes: number) => string;
  travelText: (travel: TravelEstimate) => string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const done = item.status === 'done';
  const time =
    item.plannedStart !== null
      ? clock(item.plannedStart)
      : item.projectedStart !== null
        ? `≈ ${clock(item.projectedStart)}`
        : null;
  const status = item.status === 'now' && live ? t('today.statusNow') : item.status === 'next' ? t('today.statusNext') : null;
  return (
    <View>
      {item.travel && !done ? (
        <AppText variant="caption" color="tertiary" style={styles.travelLine}>
          {travelText(item.travel)}
        </AppText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityHint={selected ? t('today.rowOpenHint') : t('today.rowSelectHint')}
        onPress={onPress}
        testID={`today-row-${item.stop.id}`}
        style={({ pressed }) => [styles.timelineRow, selected && styles.rowSelected, pressed && styles.pressed]}
      >
        <View style={styles.rail}>
          <View
            style={[
              styles.dot,
              done && styles.dotDone,
              item.status === 'now' && styles.dotNow,
              item.status === 'next' && styles.dotNext,
            ]}
          >
            {done ? (
              <Icon name="checkmark" size={12} color={colors.textTertiary} />
            ) : (
              <AppText
                variant="caption"
                style={item.status === 'next' || item.status === 'now' ? styles.dotNumberOn : styles.dotNumber}
                allowFontScaling={false}
              >
                {number}
              </AppText>
            )}
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
          <AppText variant="caption" color="secondary" style={styles.tabular}>
            {[time, formatDurationShort(item.visitMinutes, t), status].filter(Boolean).join(' · ')}
          </AppText>
        </View>
        {selected ? (
          <View style={styles.detailsLink}>
            <AppText variant="caption" color="accent" style={styles.bold}>
              {t('today.details')}
            </AppText>
            <Icon name="chevron-forward" size={14} color={colors.accent} flipInRtl />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.surfaceMuted },
  emptyWrap: { padding: spacing.xl },
  flex: { flex: 1 },
  bold: { fontWeight: weights.semibold },
  tabular: { fontVariant: ['tabular-nums'] },
  muted: { color: colors.textSecondary },
  onAccent: { color: colors.textOnAccent },
  pressed: { opacity: 0.7 },

  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.floating,
  },
  dayChip: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    ...shadows.floating,
  },
  linesNote: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceTranslucent,
  },
  controls: { position: 'absolute', end: spacing.lg, gap: spacing.sm },

  peek: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.md },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  track: { flex: 1, height: 4, borderRadius: radii.pill, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: 4, borderRadius: radii.pill, backgroundColor: colors.success },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nextBlock: { gap: spacing.xs },
  nextHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  leave: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
  },
  alertDanger: { backgroundColor: colors.dangerSoft },
  buttons: { flexDirection: 'row', gap: spacing.md },

  preview: { gap: spacing.sm },
  dayStrip: { gap: spacing.sm, paddingVertical: spacing.xs },
  dayOption: {
    width: 52,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  dayOptionOn: { backgroundColor: colors.accent },
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  moreButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  section: { gap: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  hint: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.dangerSoft },
  hintHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  dismiss: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  suggestion: { gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  suggestionHead: { flexDirection: 'row', gap: spacing.md },

  travelLine: { paddingStart: 36, paddingVertical: spacing.xxs },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 52,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.xs,
    marginHorizontal: -spacing.xs,
    borderRadius: radii.md,
  },
  rowSelected: { backgroundColor: colors.accentSoft },
  rail: { width: 24, alignItems: 'center' },
  dot: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dotDone: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong },
  dotNow: { backgroundColor: colors.success, borderColor: colors.success },
  dotNext: { backgroundColor: colors.accent, borderColor: colors.accent },
  dotNumber: { color: colors.accent, fontWeight: weights.bold, fontSize: 11, lineHeight: 14 },
  dotNumberOn: { color: colors.textOnAccent, fontWeight: weights.bold, fontSize: 11, lineHeight: 14 },
  railLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  struck: { textDecorationLine: 'line-through' },
  detailsLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, alignSelf: 'center' },
  footnote: { textAlign: 'center' },
});
