import { tripDays, visitMinutes, type LatLng } from '@travel-companion/shared';
import { stayForNight, storedZoneFor, type TripItem, type TripView } from '@/features/trips/model';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { AppText, Button, Icon, InlineError, Sheet } from '@/components/ui';
import { useOfflineCoords } from '@/features/offline/OfflineProvider';
import { useGooglePlace, useGooglePlacePreviews, useGooglePlaces } from '@/features/places/queries';
import { fallbackName } from '@/features/places/use-place-display';
import { dayTitle, formatStartTime } from '@/features/trips/itinerary';
import { useReorderTripDay, useScheduleTripPlace } from '@/features/trips/queries';
import { formatDurationShort } from '@/features/trips/TimeSheet';
import { useLocale } from '@/i18n/LocaleProvider';
import { useErrorMessage } from '@/lib/use-error-message';
import { useRealRoutes, type PlannedLeg } from '@/features/companion/real-routes';
import { colors, radii, spacing } from '@/theme/tokens';
import {
  checkDay,
  projectDay,
  toTime,
  type RouteFn,
  type DayWarning,
  type PlanStop,
} from './day-planner';
import { dayWindows, type OpenWindow } from './opening-hours';
import { applySuggestions, estimateDayLoad, planDay, smartOrder, type MoveSuggestion, type OtherDay, type PlanProblem, type RetimeSuggestion } from './smart-plan';

interface DayPlanInput {
  planStops: PlanStop[];
  hotel: LatLng | null;
  /** The trip's time zone (pinned hotel), for transit timetables. */
  timeZone: string | null;
  nameOf: (id: string) => string;
  /** Opening hours: off until the user asks; then how many places have them. */
  hours: { requested: boolean; pending: boolean; checked: number; total: number; failed: number };
  /** D1: a visit's opening windows on any trip day (undefined = not checked, null = unknown). */
  windowsOn: (stopId: string, day: string) => OpenWindow[] | null | undefined;
  /** D1: the trip's other days and how full they are (rough, no lookups). */
  otherDays: OtherDay[];
}

/** The day's stops as planner input: Google locations (or cached ≤ 30-day coordinates), visit lengths. */
function useDayPlanInput(trip: TripView, day: string, dayStops: readonly TripItem[], checkHours: boolean): DayPlanInput {
  const { t } = useTranslation();
  const coordsFor = useOfflineCoords();
  // D1: the stay for this night (its own pin, or its Google place), else the trip's main stay.
  const stay = stayForNight(trip.stays, day);
  const hotelId = stay ? (stay.place?.googlePlaceId ?? null) : trip.basePlaceId;
  const hotelPin =
    stay?.place?.latitude != null && stay.place.longitude != null
      ? { latitude: stay.place.latitude, longitude: stay.place.longitude }
      : null;
  const zone = storedZoneFor(trip, day);
  // D1: skipped visits are off the plan.
  const stops = useMemo(() => dayStops.filter((stop) => stop.status !== 'skipped'), [dayStops]);
  const hotelPlace = useGooglePlace(hotelId);
  const ids = useMemo(
    () => [...new Set(stops.flatMap((stop) => (stop.googlePlaceId ? [stop.googlePlaceId] : [])))],
    [stops],
  );
  const details = useGooglePlaces(ids);
  // Opening hours only after "Check opening hours" (one Enterprise lookup per place, in memory only).
  const previews = useGooglePlacePreviews(ids, checkHours);
  return useMemo(() => {
    const byId = new Map(stops.map((stop) => [stop.id, stop]));
    /** Opening windows of a visit on a day: only after "Check opening hours" (in memory, Google). */
    const windowsOn = (stopId: string, onDay: string): OpenWindow[] | null | undefined => {
      if (!checkHours) return undefined;
      const stop = byId.get(stopId);
      if (!stop?.googlePlaceId) return null;
      const preview = previews.byId.get(stop.googlePlaceId);
      if (!preview) return previews.pending ? undefined : null;
      return preview.detail === 'full' ? dayWindows(preview.openingPeriods, onDay) : null;
    };
    const otherDays = tripDays(trip.startDate, trip.endDate)
      .filter((other) => other !== day)
      .map((other) => ({
        day: other,
        loadMinutes: estimateDayLoad(
          trip.places.filter((item) => item.day === other && item.status !== 'skipped').map((item) => visitMinutes(item)),
        ),
      }));
    return {
      windowsOn,
      otherDays,
      hotel: hotelPin ?? hotelPlace.data?.location ?? coordsFor(hotelId),
      timeZone: zone ?? hotelPlace.data?.timeZone ?? null,
      planStops: stops.map((stop) => ({
        id: stop.id,
        startTime: stop.startTime,
        durationMinutes: visitMinutes(stop),
        location: stop.googlePlaceId
          ? (details.get(stop.googlePlaceId)?.location ?? coordsFor(stop.googlePlaceId))
          : // D1: a custom place's own pin.
            stop.latitude != null && stop.longitude != null
            ? { latitude: stop.latitude, longitude: stop.longitude }
            : null,
        visited: stop.status === 'completed',
        pinned: stop.status === 'in_progress',
        priority: stop.highlight,
        typicalDuration: stop.durationMinutes === null,
        hours: windowsOn(stop.id, day),
      })),
      hours: {
        requested: checkHours,
        pending: previews.pending,
        checked: [...previews.byId.values()].filter((preview) => preview.detail === 'full' && preview.openingPeriods.length > 0).length,
        total: ids.length,
        failed: previews.failed + [...previews.byId.values()].filter((preview) => preview.detail === 'basic').length,
      },
      nameOf: (id: string) => {
        const stop = byId.get(id);
        if (!stop) return '';
        const google = stop.googlePlaceId ? details.get(stop.googlePlaceId) : undefined;
        return google?.name ?? stop.name ?? fallbackName(stop, t);
      },
    };
  }, [stops, details, previews.byId, previews.pending, previews.failed, hotelPlace.data, coordsFor, hotelId, hotelPin?.latitude, hotelPin?.longitude, zone, t, checkHours, day, ids.length, trip.places, trip.startDate, trip.endDate]);
}

/**
 * M16: real routes (Google, online, capped) for the legs of this order, from the
 * hotel. Undefined offline, past a cap or until they arrive: estimates are used.
 */
function usePlanRoutes(stops: readonly PlanStop[], hotel: LatLng | null, day: string, timeZone: string | null): RouteFn | undefined {
  const legs = useMemo(() => {
    const timeline = projectDay(stops, hotel);
    const out: PlannedLeg[] = [];
    let previous = hotel;
    stops.forEach((stop, index) => {
      const entry = timeline[index];
      if ((index > 0 || hotel) && !stop.visited) {
        out.push({ from: previous, to: stop.location, departMinutes: entry?.travel ? entry.start - entry.travel.minutes : null });
      }
      previous = stop.location;
    });
    return out;
  }, [stops, hotel]);
  return useRealRoutes(legs, day, timeZone);
}

/**
 * M13: a quiet summary line for the day, warnings only when something's off, and
 * "Plan this day" (a proposal the user reviews and applies; nothing changes on its own).
 */
export function DayPlanning({ trip, day, stops }: { trip: TripView; day: string; stops: readonly TripItem[] }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [checkHours, setCheckHours] = useState(false);
  const input = useDayPlanInput(trip, day, stops, checkHours);
  const routeFor = usePlanRoutes(input.planStops, input.hotel, day, input.timeZone);
  const check = useMemo(() => checkDay(input.planStops, input.hotel, undefined, routeFor), [input, routeFor]);
  // D1: a much shorter (or more feasible) order is worth a quiet hint, even with no warning.
  const better = useMemo(() => smartOrder(input.planStops, input.hotel), [input]);
  const [showWarnings, setShowWarnings] = useState(false);
  const [planning, setPlanning] = useState(false);

  if (stops.length === 0) return null;
  const parts = [
    t('planning.stops', { count: check.stops }),
    t('planning.visits', { time: formatDurationShort(check.visitMinutes, t) }),
    t('planning.travel', { time: formatDurationShort(check.travelMinutes, t) }),
    check.endsAt !== null ? t('planning.endsAt', { time: formatStartTime(toTime(check.endsAt), locale) }) : null,
  ].filter(Boolean);
  const hint =
    better && better.problemsFixed > 0
      ? t('planning.betterOrderFixes', { count: better.problemsFixed })
      : better && better.saved >= INEFFICIENT_ROUTE_MIN
        ? t('planning.betterOrderSaves', { minutes: better.saved })
        : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.summaryRow}>
        <AppText variant="caption" color="secondary" style={styles.flex}>
          {parts.join(' · ')}
        </AppText>
        {stops.length >= 1 ? (
          <Button label={t('planning.planDay')} icon="options-outline" variant="ghost" size="sm" block={false} onPress={() => setPlanning(true)} />
        ) : null}
      </View>
      {check.warnings.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showWarnings }}
          onPress={() => setShowWarnings((value) => !value)}
          style={styles.warnings}
        >
          <View style={styles.summaryRow}>
            <Icon name="alert-circle-outline" size={16} color={colors.danger} />
            <AppText variant="caption" color="danger" style={[styles.flex, styles.bold]}>
              {t('planning.warningCount', { count: check.warnings.length })}
            </AppText>
            <Icon name={showWarnings ? 'chevron-up' : 'chevron-down'} size={16} color={colors.danger} />
          </View>
          {showWarnings
            ? check.warnings.map((warning, index) => (
                <AppText key={index} variant="caption" color="secondary">
                  {warningText(warning, input.nameOf, t, locale)}
                </AppText>
              ))
            : null}
          {/* Names and opening hours here come from Google. */}
          {showWarnings && input.hours.total > 0 ? <GoogleAttribution inline align="start" /> : null}
        </Pressable>
      ) : null}
      {hint ? (
        <Pressable accessibilityRole="button" onPress={() => setPlanning(true)} style={styles.summaryRow}>
          <Icon name="git-compare-outline" size={16} color={colors.accent} />
          <AppText variant="caption" color="accent" style={[styles.flex, styles.bold]}>
            {hint}
          </AppText>
        </Pressable>
      ) : null}
      {check.unknownLegs > 0 ? (
        <AppText variant="caption" color="tertiary">
          {t('planning.unknownLegs')}
        </AppText>
      ) : null}
      <PlanDaySheet
        visible={planning}
        onClose={() => setPlanning(false)}
        tripId={trip.id}
        day={day}
        input={input}
        onCheckHours={() => setCheckHours(true)}
      />
    </View>
  );
}

/** A route this much shorter is worth a hint on the day. */
const INEFFICIENT_ROUTE_MIN = 15;

export function warningText(
  warning: DayWarning,
  nameOf: (id: string) => string,
  t: TFunction,
  locale: string,
): string {
  switch (warning.kind) {
    case 'tight':
      return t('planning.tight', { name: nameOf(warning.stopId), minutes: warning.lateBy });
    case 'outOfOrder':
      return t('planning.outOfOrder', { name: nameOf(warning.stopId) });
    case 'longLeg':
      return t('planning.longLeg', { name: nameOf(warning.stopId), minutes: warning.minutes });
    case 'lateEnd':
      return t('planning.lateEnd', { time: formatStartTime(toTime(warning.endsAt), locale) });
    case 'overloaded':
      return t('planning.overloaded', { hours: Math.round(warning.minutes / 6) / 10 });
    case 'hours': {
      const name = nameOf(warning.stopId);
      const { issue } = warning;
      if (issue.kind === 'closedAllDay') return t('planning.closedAllDay', { name });
      if (issue.kind === 'notOpenYet') return t('planning.notOpenYet', { name, time: formatStartTime(toTime(issue.opensAt), locale) });
      if (issue.kind === 'closesEarly') return t('planning.closesEarly', { name, time: formatStartTime(toTime(issue.closesAt % 1440), locale) });
      return t('planning.closedThen', { name });
    }
  }
}

export function problemText(problem: PlanProblem, nameOf: (id: string) => string, t: TFunction): string {
  switch (problem.kind) {
    case 'closedNoOtherDay':
      return t('planning.problemClosedNoDay', { name: nameOf(problem.stopId) });
    case 'stillOverloaded':
      return t('planning.problemStillOverloaded', { hours: Math.round(problem.minutes / 6) / 10 });
    case 'timedClosed':
      return t('planning.problemTimedClosed', { name: nameOf(problem.stopId) });
    case 'hoursUnknown':
      return t('planning.problemHoursUnknown', { count: problem.count });
    case 'locationUnknown':
      return t('planning.problemLocationUnknown', { count: problem.count });
  }
}

/**
 * D1 smart plan: every suggested change with its reason, each on its own switch,
 * and the day as it would be. Applied only on "Apply"; the user's own times,
 * done visits and starred visits are never changed without being asked.
 */
function PlanDaySheet({
  visible,
  onClose,
  tripId,
  day,
  input,
  onCheckHours,
}: {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  day: string;
  input: DayPlanInput;
  onCheckHours: () => void;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const errorMessage = useErrorMessage();
  const reorder = useReorderTripDay(tripId);
  const schedule = useScheduleTripPlace(tripId);
  const plan = useMemo(
    () =>
      planDay({
        day,
        stops: input.planStops,
        start: input.hotel,
        otherDays: input.otherDays,
        windowsOn: input.windowsOn,
      }),
    [day, input],
  );
  const [useOrder, setUseOrder] = useState(true);
  const [fillTimes, setFillTimes] = useState(true);
  // Moves are on (they're the fix); new times for the user's own times are off until chosen.
  const [skippedMoves, setSkippedMoves] = useState<Set<string>>(new Set());
  const [chosenRetimes, setChosenRetimes] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const moves = plan.moves.filter((move) => !skippedMoves.has(move.stopId));
  const retimes = plan.retimes.filter((item) => chosenRetimes.has(item.stopId));
  const orderOn = plan.order !== null && useOrder;
  const draft = useMemo(
    () => applySuggestions(input.planStops, input.hotel, { order: orderOn ? (plan.order?.order ?? null) : null, moves, retimes }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, plan, orderOn, skippedMoves, chosenRetimes],
  );
  // The times use real routes when online (M16); the order is judged on estimates.
  const routeFor = usePlanRoutes(draft.stops, input.hotel, day, input.timeZone);
  const final = useMemo(
    () => applySuggestions(draft.stops, input.hotel, { order: null, moves: [], retimes: [] }, routeFor),
    [draft.stops, input.hotel, routeFor],
  );
  const times = final.times;
  const timesOn = times.size > 0 && fillTimes;
  const nothing = plan.order === null && plan.moves.length === 0 && plan.retimes.length === 0 && times.size === 0;
  const anyOn = orderOn || timesOn || moves.length > 0 || retimes.length > 0;
  const dayName = (other: string) => dayTitle(other, locale);
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const apply = async () => {
    setApplying(true);
    try {
      // Through the change queue: shows at once, works offline, synced with conflict checks.
      for (const move of moves) await schedule.mutateAsync({ placeId: move.stopId, day: move.toDay });
      if (orderOn) await reorder.mutateAsync({ day, placeIds: final.stops.map((stop) => stop.id) });
      for (const item of retimes) await schedule.mutateAsync({ placeId: item.stopId, startTime: item.to });
      if (timesOn) {
        for (const [placeId, startTime] of times) await schedule.mutateAsync({ placeId, startTime });
      }
      onClose();
    } finally {
      setApplying(false);
    }
  };

  const orderReason = plan.order
    ? [
        plan.order.saved >= 1 ? t('planning.reasonSaves', { minutes: plan.order.saved }) : null,
        plan.order.problemsFixed > 0 ? t('planning.reasonFixes', { count: plan.order.problemsFixed }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const after = final.check;

  return (
    <Sheet
      visible={visible}
      title={t('planning.sheetTitle')}
      subtitle={t('planning.sheetBody')}
      onClose={onClose}
      footer={
        nothing ? (
          <Button label={t('common.close')} variant="secondary" onPress={onClose} />
        ) : (
          <Button label={t('planning.apply')} onPress={() => void apply()} loading={applying} disabled={!anyOn} />
        )
      }
    >
      <HoursRow input={input} onCheck={onCheckHours} />
      {nothing ? (
        <AppText variant="body" color="secondary">
          {t('planning.alreadyGood')}
        </AppText>
      ) : (
        <>
          {plan.order ? (
            <ToggleRow label={t('planning.useOrderSmart')} hint={`${orderReason}. ${t('planning.useOrderHint')}`} value={useOrder} onChange={setUseOrder} />
          ) : null}
          {plan.moves.map((move: MoveSuggestion) => (
            <ToggleRow
              key={`move-${move.stopId}`}
              label={t('planning.moveTo', { name: input.nameOf(move.stopId), day: dayName(move.toDay) })}
              hint={
                move.reason === 'closed'
                  ? t('planning.moveClosed', { day: dayName(move.toDay) })
                  : t('planning.moveOverloaded', { hours: Math.round((plan.before.visitMinutes + plan.before.travelMinutes) / 6) / 10, day: dayName(move.toDay) })
              }
              value={!skippedMoves.has(move.stopId)}
              onChange={() => setSkippedMoves((set) => toggle(set, move.stopId))}
            />
          ))}
          {plan.retimes.map((item: RetimeSuggestion) => (
            <ToggleRow
              key={`retime-${item.stopId}`}
              label={t('planning.retime', {
                name: input.nameOf(item.stopId),
                from: formatStartTime(item.from, locale),
                to: formatStartTime(item.to, locale),
              })}
              hint={item.reason === 'opensAt' ? t('planning.retimeOpens', { time: formatStartTime(item.to, locale) }) : t('planning.retimeCloses')}
              value={chosenRetimes.has(item.stopId)}
              onChange={() => setChosenRetimes((set) => toggle(set, item.stopId))}
            />
          ))}
          {times.size > 0 ? (
            <ToggleRow
              label={t('planning.fillTimes', { count: times.size })}
              hint={t('planning.fillTimesBuffer')}
              value={fillTimes}
              onChange={setFillTimes}
            />
          ) : null}
          <View style={styles.preview}>
            {final.stops.map((stop, index) => {
              const suggested = timesOn ? times.get(stop.id) : undefined;
              const time = stop.startTime ?? suggested ?? null;
              const retimed = retimes.some((item) => item.stopId === stop.id);
              return (
                <View key={stop.id} style={styles.previewRow}>
                  <AppText variant="caption" color="tertiary" style={styles.number}>
                    {index + 1}
                  </AppText>
                  <View style={styles.flex}>
                    <AppText variant="body" numberOfLines={1}>
                      {input.nameOf(stop.id)}
                    </AppText>
                    <AppText variant="caption" color="tertiary">
                      {formatDurationShort(stop.durationMinutes, t)}
                      {stop.typicalDuration ? ` · ${t('planning.typicalLength')}` : ''}
                      {stop.priority ? ` · ${t('planning.starred')}` : ''}
                    </AppText>
                  </View>
                  {time ? (
                    <AppText variant="caption" color={suggested || retimed ? 'accent' : 'secondary'} style={suggested || retimed ? styles.bold : undefined}>
                      {formatStartTime(time, locale)}
                      {suggested ? ` · ${t('planning.suggested')}` : ''}
                    </AppText>
                  ) : null}
                </View>
              );
            })}
            <AppText variant="caption" color="secondary">
              {t('planning.dayAfter', {
                visits: formatDurationShort(after.visitMinutes, t),
                travel: formatDurationShort(after.travelMinutes, t),
                end: after.endsAt !== null ? formatStartTime(toTime(after.endsAt), locale) : '—',
              })}
            </AppText>
            <AppText variant="caption" color="tertiary">
              {routeFor ? t('planning.realRoutes') : t('planning.estimatedRoutes')}
            </AppText>
            {input.hours.total > 0 || routeFor ? <GoogleAttribution inline align="start" /> : null}
          </View>
        </>
      )}
      {plan.problems.length > 0 ? (
        <View style={styles.problems}>
          {plan.problems.map((problem, index) => (
            <View key={index} style={styles.summaryRow}>
              <Icon name="information-circle-outline" size={16} color={colors.textSecondary} />
              <AppText variant="caption" color="secondary" style={styles.flex}>
                {problemText(problem, input.nameOf, t)}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
      {reorder.isError || schedule.isError ? (
        <InlineError message={errorMessage(reorder.error ?? schedule.error)} />
      ) : null}
    </Sheet>
  );
}

/** "Check opening hours": an explicit, counted Google lookup; then what it found. */
function HoursRow({ input, onCheck }: { input: DayPlanInput; onCheck: () => void }) {
  const { t } = useTranslation();
  const { hours } = input;
  if (hours.total === 0) return null;
  if (!hours.requested) {
    return (
      <View style={styles.toggle}>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{t('planning.checkHours')}</AppText>
          <AppText variant="caption" color="secondary">
            {t('planning.checkHoursHint', { count: hours.total })}
          </AppText>
        </View>
        <Button label={t('planning.check')} variant="secondary" size="sm" block={false} onPress={onCheck} />
      </View>
    );
  }
  return (
    <View style={styles.summaryRow}>
      <Icon name="time-outline" size={16} color={colors.textSecondary} />
      <AppText variant="caption" color="secondary" style={styles.flex}>
        {hours.pending
          ? t('planning.checkingHours')
          : hours.failed > 0 && hours.checked === 0
            ? t('planning.hoursUnavailable')
            : t('planning.hoursChecked', { checked: hours.checked, total: hours.total })}
      </AppText>
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{label}</AppText>
        <AppText variant="caption" color="secondary">
          {hint}
        </AppText>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.surfaceMuted }}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  warnings: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.dangerSoft },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radii.card, backgroundColor: colors.surface },
  preview: { padding: spacing.lg, borderRadius: radii.card, backgroundColor: colors.surface, gap: spacing.sm },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  number: { width: 20, textAlign: 'center' },
  problems: { gap: spacing.xs },
});
