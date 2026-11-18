import { visitMinutes, type LatLng, type TripDetail, type TripPlace } from '@travel-companion/shared';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { AppText, Button, Icon, InlineError, Sheet } from '@/components/ui';
import { useOfflineCoords } from '@/features/offline/OfflineProvider';
import { useGooglePlace, useGooglePlacePreviews, useGooglePlaces } from '@/features/places/queries';
import { fallbackName } from '@/features/places/use-place-display';
import { formatStartTime } from '@/features/trips/itinerary';
import { useReorderTripDay, useScheduleTripPlace } from '@/features/trips/queries';
import { formatDurationShort } from '@/features/trips/TimeSheet';
import { useLocale } from '@/i18n/LocaleProvider';
import { useErrorMessage } from '@/lib/use-error-message';
import { useRealRoutes, type PlannedLeg } from '@/features/companion/real-routes';
import { colors, radii, spacing } from '@/theme/tokens';
import {
  checkDay,
  optimizeOrder,
  projectDay,
  suggestTimes,
  toTime,
  type RouteFn,
  type DayWarning,
  type PlanStop,
} from './day-planner';
import { dayWindows } from './opening-hours';

interface DayPlanInput {
  planStops: PlanStop[];
  hotel: LatLng | null;
  /** The trip's time zone (pinned hotel), for transit timetables. */
  timeZone: string | null;
  nameOf: (id: string) => string;
  /** Opening hours: off until the user asks; then how many places have them. */
  hours: { requested: boolean; pending: boolean; checked: number; total: number; failed: number };
}

/** The day's stops as planner input: Google locations (or cached ≤ 30-day coordinates), visit lengths. */
function useDayPlanInput(trip: TripDetail, day: string, stops: readonly TripPlace[], checkHours: boolean): DayPlanInput {
  const { t } = useTranslation();
  const coordsFor = useOfflineCoords();
  const hotelPlace = useGooglePlace(trip.basePlaceId);
  const ids = useMemo(
    () => [...new Set(stops.flatMap((stop) => (stop.googlePlaceId ? [stop.googlePlaceId] : [])))],
    [stops],
  );
  const details = useGooglePlaces(ids);
  // Opening hours only after "Check opening hours" (one Enterprise lookup per place, in memory only).
  const previews = useGooglePlacePreviews(ids, checkHours);
  return useMemo(() => {
    const byId = new Map(stops.map((stop) => [stop.id, stop]));
    return {
      hotel: hotelPlace.data?.location ?? coordsFor(trip.basePlaceId),
      timeZone: hotelPlace.data?.timeZone ?? null,
      planStops: stops.map((stop) => ({
        id: stop.id,
        startTime: stop.startTime,
        durationMinutes: visitMinutes(stop),
        location: stop.googlePlaceId
          ? (details.get(stop.googlePlaceId)?.location ?? coordsFor(stop.googlePlaceId))
          : null,
        visited: stop.visitedAt !== null,
        hours: (() => {
          if (!checkHours || !stop.googlePlaceId) return undefined;
          const preview = previews.byId.get(stop.googlePlaceId);
          return preview && preview.detail === 'full' ? dayWindows(preview.openingPeriods, day) : undefined;
        })(),
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
  }, [stops, details, previews.byId, previews.pending, previews.failed, hotelPlace.data, coordsFor, trip.basePlaceId, t, checkHours, day, ids.length]);
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
export function DayPlanning({ trip, day, stops }: { trip: TripDetail; day: string; stops: readonly TripPlace[] }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [checkHours, setCheckHours] = useState(false);
  const input = useDayPlanInput(trip, day, stops, checkHours);
  const routeFor = usePlanRoutes(input.planStops, input.hotel, day, input.timeZone);
  const check = useMemo(() => checkDay(input.planStops, input.hotel, undefined, routeFor), [input, routeFor]);
  const [showWarnings, setShowWarnings] = useState(false);
  const [planning, setPlanning] = useState(false);

  if (stops.length === 0) return null;
  const parts = [
    t('planning.stops', { count: check.stops }),
    t('planning.visits', { time: formatDurationShort(check.visitMinutes, t) }),
    t('planning.travel', { time: formatDurationShort(check.travelMinutes, t) }),
    check.endsAt !== null ? t('planning.endsAt', { time: formatStartTime(toTime(check.endsAt), locale) }) : null,
  ].filter(Boolean);

  return (
    <View style={styles.wrap}>
      <View style={styles.summaryRow}>
        <AppText variant="caption" color="secondary" style={styles.flex}>
          {parts.join(' · ')}
        </AppText>
        {stops.length >= 2 ? (
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

function warningText(
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

/** The proposal: a better order and/or times for flexible stops. Applied only on "Apply". */
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
  const proposal = useMemo(() => optimizeOrder(input.planStops, input.hotel), [input]);
  const [useOrder, setUseOrder] = useState(true);
  const [fillTimes, setFillTimes] = useState(true);
  const [applying, setApplying] = useState(false);

  const ordered = useMemo(() => {
    if (!proposal || !useOrder) return input.planStops;
    const byId = new Map(input.planStops.map((stop) => [stop.id, stop]));
    return proposal.order.flatMap((id) => (byId.has(id) ? [byId.get(id) as PlanStop] : []));
  }, [proposal, useOrder, input.planStops]);
  // Shorter order is still judged on estimates; the times use real routes when online (M16).
  const routeFor = usePlanRoutes(ordered, input.hotel, day, input.timeZone);
  const times = useMemo(() => suggestTimes(ordered, input.hotel, undefined, routeFor), [ordered, input.hotel, routeFor]);
  const orderOn = proposal !== null && useOrder;
  const timesOn = times.size > 0 && fillTimes;
  const nothing = proposal === null && times.size === 0;

  const apply = async () => {
    setApplying(true);
    try {
      // Through the change queue: shows at once, works offline, synced with conflict checks.
      if (orderOn) await reorder.mutateAsync({ day, placeIds: ordered.map((stop) => stop.id) });
      if (timesOn) {
        for (const [placeId, startTime] of times) await schedule.mutateAsync({ placeId, startTime });
      }
      onClose();
    } finally {
      setApplying(false);
    }
  };

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
          <Button label={t('planning.apply')} onPress={() => void apply()} loading={applying} disabled={!orderOn && !timesOn} />
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
          {proposal ? (
            <ToggleRow
              label={t('planning.useOrder', { minutes: proposal.saved })}
              hint={t('planning.useOrderHint')}
              value={useOrder}
              onChange={setUseOrder}
            />
          ) : null}
          {times.size > 0 ? (
            <ToggleRow
              label={t('planning.fillTimes', { count: times.size })}
              hint={t('planning.fillTimesHint')}
              value={fillTimes}
              onChange={setFillTimes}
            />
          ) : null}
          <View style={styles.preview}>
            {ordered.map((stop, index) => {
              const suggested = timesOn ? times.get(stop.id) : undefined;
              const time = stop.startTime ?? suggested ?? null;
              return (
                <View key={stop.id} style={styles.previewRow}>
                  <AppText variant="caption" color="tertiary" style={styles.number}>
                    {index + 1}
                  </AppText>
                  <AppText variant="body" style={styles.flex} numberOfLines={1}>
                    {input.nameOf(stop.id)}
                  </AppText>
                  {time ? (
                    <AppText variant="caption" color={suggested ? 'accent' : 'secondary'} style={suggested ? styles.bold : undefined}>
                      {formatStartTime(time, locale)}
                      {suggested ? ` · ${t('planning.suggested')}` : ''}
                    </AppText>
                  ) : null}
                </View>
              );
            })}
            <AppText variant="caption" color="tertiary">
              {routeFor ? t('planning.realRoutes') : t('planning.estimatedRoutes')}
            </AppText>
            {input.hours.total > 0 || routeFor ? <GoogleAttribution inline align="start" /> : null}
          </View>
        </>
      )}
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
});
