import {
  DEFAULT_VISIT_MINUTES,
  visitMinutes,
  googleMapsDirectionsUrl,
  googleMapsRouteUrl,
  tripDays,
  type TripDetail,
  type TripPlace,
} from '@travel-companion/shared';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { googleMapsEnabled, PlacesMap } from '@/components/maps/PlacesMap';
import { AppText, Button, Card, EmptyState, Icon, IconButton, InlineError } from '@/components/ui';
import { CATEGORY_ICONS } from '@/features/places/categories';
import { openInMaps } from '@/features/places/open-in-maps';
import { useGooglePlaces, useSetVisited } from '@/features/places/queries';
import { usePlaceDisplay } from '@/features/places/use-place-display';
import { useLocale } from '@/i18n/LocaleProvider';
import { toIsoDate } from '@/lib/dates';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing } from '@/theme/tokens';
import { AddToDaySheet } from './AddToDaySheet';
import { DayPickerSheet } from './DayPickerSheet';
import {
  countByDay,
  dayChipParts,
  dayTitle,
  formatStartTime,
  initialDay,
  moveId,
  placesForDay,
  wishlistPlaces,
} from './itinerary';
import { muteKey, useMutedStops, useToggleMuted } from '@/features/companion/reminder-settings';
import { useReorderTripDay, useScheduleTripPlace } from './queries';
import { formatDurationShort, TimeSheet } from './TimeSheet';

/** A place plus the name to show for it (Google names aren't stored in the trip). */
interface Named {
  place: TripPlace;
  name: string;
}

interface ItineraryViewProps {
  trip: TripDetail;
  onOpenPlace: (place: TripPlace) => void;
  onDiscover: () => void;
  onEditTrip: () => void;
}

/** The trip day by day: a strip of days, the selected day's map and its ordered stops. */
export function ItineraryView({ trip, onOpenPlace, onDiscover, onEditTrip }: ItineraryViewProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const errorMessage = useErrorMessage();
  const schedule = useScheduleTripPlace(trip.id);
  const reorder = useReorderTripDay(trip.id);
  const setVisited = useSetVisited();
  const muted = useMutedStops();
  const toggleMuted = useToggleMuted();

  const days = useMemo(() => tripDays(trip.startDate, trip.endDate), [trip.startDate, trip.endDate]);
  const today = toIsoDate(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(() => initialDay(days, today));
  const [adding, setAdding] = useState(false);
  const [timeFor, setTimeFor] = useState<Named | null>(null);
  const [moving, setMoving] = useState<Named | null>(null);

  // Keep a valid selection when the trip dates change.
  useEffect(() => {
    if (!selectedDay || !days.includes(selectedDay)) setSelectedDay(initialDay(days, today));
  }, [days, selectedDay, today]);

  const counts = useMemo(() => countByDay(trip.places), [trip.places]);
  const wishlist = useMemo(() => wishlistPlaces(trip.places), [trip.places]);
  const stops = useMemo(
    () => (selectedDay ? placesForDay(trip.places, selectedDay) : []),
    [trip.places, selectedDay],
  );

  if (days.length === 0) {
    return (
      <EmptyState
        icon="calendar-outline"
        title={t('itinerary.noDatesTitle')}
        body={t('itinerary.noDatesBody')}
        action={<Button label={t('itinerary.setDates')} icon="calendar-outline" variant="secondary" onPress={onEditTrip} />}
      />
    );
  }

  const dayIndex = selectedDay ? days.indexOf(selectedDay) : -1;
  const stopIds = stops.map((stop) => stop.id);
  const move = (place: TripPlace, delta: -1 | 1) => {
    if (!selectedDay) return;
    const next = moveId(stopIds, place.id, delta);
    if (next) reorder.mutate({ day: selectedDay, placeIds: next });
  };
  const pickDay = (place: TripPlace, day: string | null) => {
    setMoving(null);
    if (day !== place.day) schedule.mutate({ placeId: place.id, day });
  };
  const openMenu = (place: TripPlace, name: string) => {
    Alert.alert(name, undefined, [
      { text: t('itinerary.openPlace'), onPress: () => onOpenPlace(place) },
      { text: t('itinerary.changeDay'), onPress: () => setMoving({ place, name }) },
      ...(place.startTime
        ? [
            { text: t('itinerary.clearTime'), onPress: () => schedule.mutate({ placeId: place.id, startTime: null }) },
            {
              text: muted.data?.includes(muteKey(trip.id, place.id)) ? t('reminders.unmuteStop') : t('reminders.muteStop'),
              onPress: () => toggleMuted.mutate(muteKey(trip.id, place.id)),
            },
          ]
        : []),
      {
        text: t('itinerary.backToWishlist'),
        style: 'destructive' as const,
        onPress: () => schedule.mutate({ placeId: place.id, day: null }),
      },
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        accessibilityRole="tablist"
      >
        {days.map((day, index) => {
          const parts = dayChipParts(day, locale);
          const selected = day === selectedDay;
          const count = counts.get(day) ?? 0;
          return (
            <Pressable
              key={day}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${t('itinerary.dayNumber', { number: index + 1 })}, ${dayTitle(day, locale)}`}
              onPress={() => setSelectedDay(day)}
              style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
            >
              <AppText variant="caption" style={[styles.chipWeekday, selected && styles.onAccent]}>
                {day === today ? t('itinerary.today') : parts.weekday}
              </AppText>
              <AppText variant="title" style={selected ? styles.onAccent : undefined}>
                {parts.date}
              </AppText>
              <View style={styles.dots}>
                {Array.from({ length: Math.min(count, 4) }, (_, i) => (
                  <View key={i} style={[styles.dot, selected && styles.dotSelected]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {selectedDay ? (
        <>
          <View style={styles.dayHeader}>
            <View style={styles.flex}>
              <AppText variant="overline" color="accent">
                {t('itinerary.dayNumber', { number: dayIndex + 1 }).toUpperCase()}
              </AppText>
              <AppText variant="title">{dayTitle(selectedDay, locale)}</AppText>
            </View>
            <Button label={t('itinerary.add')} icon="add" variant="secondary" block={false} onPress={() => setAdding(true)} />
          </View>

          {schedule.isError ? <InlineError message={errorMessage(schedule.error)} /> : null}

          {stops.length === 0 ? (
            <EmptyState
              icon="sunny-outline"
              title={t('itinerary.emptyDayTitle')}
              body={wishlist.length > 0 ? t('itinerary.emptyDayBody', { count: wishlist.length }) : t('itinerary.emptyDayNoWishlist')}
              action={
                wishlist.length > 0 ? (
                  <Button label={t('itinerary.addFromWishlist')} icon="add" onPress={() => setAdding(true)} />
                ) : (
                  <Button label={t('tripDetail.discover')} icon="sparkles" onPress={onDiscover} />
                )
              }
            />
          ) : (
            <>
              <DayMap stops={stops} />
              <View>
                {stops.map((stop, index) => (
                  <StopRow
                    key={stop.id}
                    place={stop}
                    number={index + 1}
                    first={index === 0}
                    last={index === stops.length - 1}
                    onOpen={() => onOpenPlace(stop)}
                    onTime={(name) => setTimeFor({ place: stop, name })}
                    onToggleVisited={() => setVisited.mutate({ id: stop.id, visited: stop.visitedAt === null })}
                    onUp={() => move(stop, -1)}
                    onDown={() => move(stop, 1)}
                    onMenu={(name) => openMenu(stop, name)}
                  />
                ))}
              </View>
            </>
          )}

          {wishlist.length > 0 && stops.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setAdding(true)}
              style={({ pressed }) => [styles.wishlistHint, pressed && styles.pressed]}
            >
              <Icon name="bookmark-outline" size={18} color={colors.accent} />
              <AppText variant="body" color="accent" style={styles.flex}>
                {t('itinerary.wishlistLeft', { count: wishlist.length })}
              </AppText>
              <Icon name="chevron-forward" size={18} color={colors.accent} flipInRtl />
            </Pressable>
          ) : null}

          <AddToDaySheet
            visible={adding}
            dayLabel={dayTitle(selectedDay, locale)}
            wishlist={wishlist}
            addingId={schedule.isPending ? (schedule.variables?.placeId ?? null) : null}
            error={schedule.isError ? errorMessage(schedule.error) : null}
            onAdd={(place) => schedule.mutate({ placeId: place.id, day: selectedDay })}
            onDiscover={() => {
              setAdding(false);
              onDiscover();
            }}
            onClose={() => setAdding(false)}
          />
        </>
      ) : null}

      <TimeSheet
        visible={timeFor !== null}
        placeName={timeFor?.name ?? ''}
        value={{ startTime: timeFor?.place.startTime ?? null, durationMinutes: timeFor?.place.durationMinutes ?? null }}
        defaultDuration={timeFor ? DEFAULT_VISIT_MINUTES[timeFor.place.category] : 60}
        onSave={(value) => {
          if (timeFor) schedule.mutate({ placeId: timeFor.place.id, ...value });
          setTimeFor(null);
        }}
        onClose={() => setTimeFor(null)}
      />
      <DayPickerSheet
        visible={moving !== null}
        placeName={moving?.name ?? ''}
        days={days}
        current={moving?.place.day ?? null}
        counts={counts}
        onPick={(day) => moving && pickDay(moving.place, day)}
        onClose={() => setMoving(null)}
      />
    </View>
  );
}

/** The day's stops on a Google map, numbered in order, with a link to the whole route in Google Maps. */
function DayMap({ stops }: { stops: readonly TripPlace[] }) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const googleIds = useMemo(
    () => stops.flatMap((stop) => (stop.googlePlaceId ? [stop.googlePlaceId] : [])),
    [stops],
  );
  const details = useGooglePlaces(googleIds);

  const points = stops.flatMap((stop, index) => {
    const google = stop.googlePlaceId ? details.get(stop.googlePlaceId) : undefined;
    return google?.location
      ? [{
          id: stop.id,
          latitude: google.location.latitude,
          longitude: google.location.longitude,
          title: google.name,
          label: String(index + 1),
        }]
      : [];
  });
  const route = stops.flatMap((stop) => {
    const google = stop.googlePlaceId ? details.get(stop.googlePlaceId) : undefined;
    return stop.googlePlaceId && google ? [{ placeId: stop.googlePlaceId, name: google.name }] : [];
  });
  const routeUrl = route.length > 1 ? googleMapsRouteUrl(route, 'walking') : null;

  return (
    <View style={styles.map}>
      {googleMapsEnabled && points.length > 0 ? (
        <PlacesMap points={points} selectedId={selectedId} onSelect={setSelectedId} height={240} connect />
      ) : null}
      {routeUrl ? (
        <Button
          label={t('itinerary.openRoute')}
          icon="walk-outline"
          variant="secondary"
          onPress={() => void Linking.openURL(routeUrl).catch(() => undefined)}
        />
      ) : null}
    </View>
  );
}

interface StopRowProps {
  place: TripPlace;
  number: number;
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onTime: (name: string) => void;
  onToggleVisited: () => void;
  onUp: () => void;
  onDown: () => void;
  onMenu: (name: string) => void;
}

/** One stop of the day: number on a timeline, time, name, and quick actions. */
function StopRow({ place, number, first, last, onOpen, onTime, onToggleVisited, onUp, onDown, onMenu }: StopRowProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const display = usePlaceDisplay(place);
  const visited = place.visitedAt !== null;

  const directions = () => {
    if (place.googlePlaceId) {
      void Linking.openURL(googleMapsDirectionsUrl(place.googlePlaceId, display.google?.name ?? display.name)).catch(
        () => undefined,
      );
    } else {
      openInMaps(place.name ?? '', place.address);
    }
  };

  return (
    <View style={styles.stopRow}>
      <View style={styles.rail}>
        <View style={[styles.railLine, first && styles.railHidden]} />
        <View style={[styles.number, visited && styles.numberVisited]}>
          {visited ? (
            <Icon name="checkmark" size={16} color={colors.textOnAccent} />
          ) : (
            <AppText variant="caption" color="onAccent" style={styles.numberText}>
              {number}
            </AppText>
          )}
        </View>
        <View style={[styles.railLine, styles.railGrow, last && styles.railHidden]} />
      </View>

      <Card onPress={onOpen} accessibilityLabel={display.name} style={styles.stopCard}>
        <View style={styles.stopTop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={place.startTime ? t('itinerary.changeTime') : t('itinerary.addTime')}
            onPress={() => onTime(display.name)}
            style={({ pressed }) => [styles.time, place.startTime ? styles.timeSet : null, pressed && styles.pressed]}
          >
            <Icon name="time-outline" size={14} color={place.startTime ? colors.textOnAccent : colors.accent} />
            <AppText variant="caption" style={[styles.timeText, place.startTime ? styles.onAccent : styles.accentText]}>
              {place.startTime ? formatStartTime(place.startTime, locale) : t('itinerary.addTime')}
            </AppText>
          </Pressable>
          <AppText variant="caption" color="secondary">
            {formatDurationShort(visitMinutes(place), t)}
            {place.durationMinutes === null ? ' ' + t('itinerary.approx') : ''}
          </AppText>
          <View style={styles.flex} />
          <Icon name={CATEGORY_ICONS[place.category]} size={16} color={colors.textTertiary} />
        </View>
        <AppText variant="heading" numberOfLines={2}>
          {display.name}
        </AppText>
        {display.typeLabel || display.address ? (
          <AppText variant="caption" color="secondary" numberOfLines={1}>
            {[display.typeLabel, display.address].filter(Boolean).join(' · ')}
          </AppText>
        ) : null}
        {place.notes ? (
          <AppText variant="body" color="secondary" numberOfLines={2}>
            {place.notes}
          </AppText>
        ) : null}
        {place.source === 'google' && display.google ? (
          <AppText variant="caption" color="tertiary" style={styles.attribution}>
            Google Maps
          </AppText>
        ) : null}
        <View style={styles.stopActions}>
          <IconButton icon="navigate-outline" accessibilityLabel={t('places.directions')} onPress={directions} />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: visited }}
            accessibilityLabel={t('tripMode.markDone', { name: display.name })}
            onPress={onToggleVisited}
            style={({ pressed }) => [styles.doneChip, visited && styles.doneChipOn, pressed && styles.pressed]}
          >
            <Icon name="checkmark" size={14} color={visited ? colors.textOnAccent : colors.success} />
            <AppText variant="caption" style={[styles.timeText, visited ? styles.onAccent : styles.successText]}>
              {visited ? t('itinerary.visited') : t('tripMode.done')}
            </AppText>
          </Pressable>
          <View style={styles.flex} />
          {!first ? <IconButton icon="arrow-up" accessibilityLabel={t('itinerary.moveUp')} onPress={onUp} /> : null}
          {!last ? <IconButton icon="arrow-down" accessibilityLabel={t('itinerary.moveDown')} onPress={onDown} /> : null}
          <IconButton
            icon="ellipsis-horizontal"
            accessibilityLabel={t('itinerary.more')}
            onPress={() => onMenu(display.name)}
          />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  onAccent: { color: colors.textOnAccent },
  accentText: { color: colors.accent },
  strip: { gap: spacing.sm, paddingVertical: spacing.xxs },
  chip: {
    width: 58,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipWeekday: { color: colors.textSecondary, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
  dotSelected: { backgroundColor: colors.textOnAccent },
  dayHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  map: { gap: spacing.md },
  stopRow: { flexDirection: 'row', gap: spacing.md },
  rail: { width: 28, alignItems: 'center' },
  railLine: { width: 2, height: spacing.lg, backgroundColor: colors.borderStrong },
  railGrow: { flex: 1, height: undefined },
  railHidden: { backgroundColor: 'transparent' },
  number: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberVisited: { backgroundColor: colors.success },
  numberText: { fontWeight: '700' },
  stopCard: { flex: 1, gap: spacing.xs, marginBottom: spacing.md },
  stopTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  time: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
  },
  timeSet: { backgroundColor: colors.accent },
  doneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.success,
  },
  doneChipOn: { backgroundColor: colors.success },
  successText: { color: colors.success },
  timeText: { fontWeight: '600' },
  attribution: { writingDirection: 'ltr' },
  stopActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  wishlistHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.accentSoft,
  },
});
