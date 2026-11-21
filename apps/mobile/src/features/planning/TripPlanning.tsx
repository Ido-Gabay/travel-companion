import { tripDays, visitMinutes, type DiscoverResult, type LatLng, type PlaceCategory, type TripAssistantRequest } from '@travel-companion/shared';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { GoogleAttribution } from '@/components/GoogleAttribution';
import { AppText, Button, Icon, InlineError, Sheet } from '@/components/ui';
import { useOfflineCoords } from '@/features/offline/OfflineProvider';
import { useGooglePlacePreview, useGooglePlacePreviews, useGooglePlaces } from '@/features/places/queries';
import { fallbackName } from '@/features/places/use-place-display';
import { dayShort, dayTitle, formatStartTime, wishlistPlaces } from '@/features/trips/itinerary';
import { isUpcoming, stayForNight, storedZoneFor, visitsForDay, type TripItem, type TripView } from '@/features/trips/model';
import { useApplyTripPlan, useSaveFoundPlace } from '@/features/trips/queries';
import { AssistantPanel, type AssistantResult } from '@/features/assistant/AssistantPanel';
import { PlaceFinder } from '@/features/assistant/PlaceFinder';
import type { FindPlace } from '@/features/assistant/place-finder';
import { catchUpKey, durationKey, resolveRequest, shiftKey, shortenKey, skipKey, type AssistantItem, type DayShift, type DurationChange, type RequestNote } from '@/features/assistant/request';
import { alternativeFor } from '@/features/assistant/place-finder';
import { formatDurationShort } from '@/features/trips/TimeSheet';
import { useLocale } from '@/i18n/LocaleProvider';
import { useErrorMessage } from '@/lib/use-error-message';
import { colors, radii, spacing, weights } from '@/theme/tokens';
import type { PlanStop } from './day-planner';
import { dayWindows, type OpenWindow } from './opening-hours';
import { completePlan, isOn, orderKey, retimeKey, timesKey, type CompletePlan, type DayDraft, type PlannedVisit } from './complete-plan';
import { problemText, warningText } from './DayPlanning';
import { checkDay, DEFAULT_DAY_START_MIN, toTime, type Leg } from './day-planner';
import { compareDays, dayCapacity, planTrip, type DayStatus, type TripChange, type TripPlanInput, type Unplaced, type Why } from './trip-plan';
import { ChangeRow, LoadBar, Tag, Tags, type TagTone } from './PlanParts';
import { planOutcome } from './plan-summary';

const newTimeKey = (id: string) => `newTime:${id}`;

/** A place saved to the trip (not planned), offered from Today. */
export interface SavedToAdd {
  /** The trip item id (its saved-place membership). */
  id: string;
  name: string;
  category: PlaceCategory;
  location: LatLng | null;
}

interface TripPlanData {
  input: TripPlanInput;
  nameOf: (id: string) => string;
  zoneOf: (day: string) => string | null;
  /** Google place ids with no location in memory (looked up only when the user asks). */
  missingLocations: string[];
  hourIds: string[];
  hours: { requested: boolean; pending: boolean; checked: number; failed: number };
  /** For the trip assistant: every visit and wishlist place, as the phone knows it. */
  items: AssistantItem[];
  /** The trip for the AI: refs, categories, the user's own labels, times and stars (no Google content). */
  buildContext: () => { context: TripAssistantRequest['context']; refs: ReadonlyMap<string, string> };
}

const pinOf = (item: { latitude?: number | null; longitude?: number | null }): LatLng | null =>
  item.latitude != null && item.longitude != null ? { latitude: item.latitude, longitude: item.longitude } : null;

/**
 * The whole trip as planner input, from what's already on the phone: custom
 * pins, Google details already in memory, coordinates cached for the trip
 * (≤ 30 days), opening hours already checked. Google is asked only when the
 * user taps "Look up" or "Check opening hours".
 */
function useTripPlanData(
  trip: TripView,
  today: string | null,
  nowMinutes: number | null,
  lookUp: boolean,
  checkHours: boolean,
): TripPlanData {
  const { t } = useTranslation();
  const coordsFor = useOfflineCoords();
  const days = useMemo(() => tripDays(trip.startDate, trip.endDate), [trip.startDate, trip.endDate]);
  const wishlist = useMemo(() => wishlistPlaces(trip.places), [trip.places]);
  const visits = useMemo(
    () => new Map(days.map((day) => [day, visitsForDay(trip.places, day).filter((item) => item.status !== 'skipped')])),
    [days, trip.places],
  );
  const googleIds = useMemo(
    () => [
      ...new Set(
        [...wishlist, ...[...visits.values()].flat(), ...trip.stays.flatMap((stay) => (stay.place ? [stay.place] : []))].flatMap(
          (item) => (item.googlePlaceId ? [item.googlePlaceId] : []),
        ),
      ),
    ],
    [wishlist, visits, trip.stays],
  );
  const cached = useGooglePlaces(googleIds, false);
  const missingLocations = googleIds.filter((id) => !cached.get(id)?.location && !coordsFor(id));
  const fetched = useGooglePlaces(lookUp ? missingLocations : [], lookUp);
  const placeIds = useMemo(
    () => [...new Set([...wishlist, ...[...visits.values()].flat()].flatMap((item) => (item.googlePlaceId ? [item.googlePlaceId] : [])))],
    [wishlist, visits],
  );
  // Hours already checked stay in memory; new ones only after "Check opening hours".
  const previews = useGooglePlacePreviews(placeIds, checkHours);

  return useMemo(() => {
    const google = (id: string | null) => (id ? (cached.get(id) ?? fetched.get(id)) : undefined);
    const locationOf = (item: { googlePlaceId: string | null; latitude?: number | null; longitude?: number | null }) =>
      item.googlePlaceId ? (google(item.googlePlaceId)?.location ?? coordsFor(item.googlePlaceId)) : pinOf(item);
    const items = new Map<string, TripItem>([...wishlist, ...[...visits.values()].flat()].map((item) => [item.id, item]));
    const windowsOn = (id: string, day: string): OpenWindow[] | null | undefined => {
      const item = items.get(id);
      if (!item) return undefined;
      if (!item.googlePlaceId) return null;
      const preview = previews.byId.get(item.googlePlaceId);
      if (!preview) return checkHours && !previews.pending ? null : undefined;
      return preview.detail === 'full' ? dayWindows(preview.openingPeriods, day) : null;
    };
    const toStop = (item: TripItem): PlanStop => ({
      id: item.id,
      startTime: item.startTime,
      durationMinutes: visitMinutes(item),
      location: locationOf(item),
      visited: item.status === 'completed',
      pinned: item.status === 'in_progress',
      priority: item.highlight,
      typicalDuration: item.durationMinutes === null,
    });
    const input: TripPlanInput = {
      windowsOn,
      wishlist: wishlist.map(toStop),
      days: days.map((day) => {
        const stay = stayForNight(trip.stays, day);
        const hotelChange = trip.stays.some((other) => other.checkOut === day) && trip.stays.some((other) => other.checkIn === day);
        return {
          day,
          start: stay?.place ? locationOf(stay.place) : null,
          stops: (visits.get(day) ?? []).map(toStop),
          ...dayCapacity({ day, today, nowMinutes, hotelChange }),
          // Today: suggested times start a little after now.
          dayStart:
            day === today && nowMinutes !== null
              ? Math.max(DEFAULT_DAY_START_MIN, Math.ceil((nowMinutes + 15) / 5) * 5)
              : DEFAULT_DAY_START_MIN,
        };
      }),
    };
    const nameOf = (id: string) => {
      const item = items.get(id);
      if (!item) return '';
      return google(item.googlePlaceId)?.name ?? item.name ?? fallbackName(item, t);
    };
    // Only the user's own words: their label, or the name of a place they made.
    const ownLabel = (item: TripItem) => item.myLabel ?? (item.source === 'custom' ? item.name : null);
    const buildContext = () => {
      const refs = new Map<string, string>();
      const entry = (item: TripItem, ref: string) => {
        refs.set(ref, item.id);
        return {
          ref,
          category: item.category,
          label: ownLabel(item)?.slice(0, 80) ?? null,
          start: item.startTime,
          starred: item.highlight,
          status: item.status,
        };
      };
      let n = 0;
      const context: TripAssistantRequest['context'] = {
        today,
        days: days.slice(0, 31).map((day) => ({
          day,
          visits: (visits.get(day) ?? []).slice(0, 150).map((item) => entry(item, `v${(n += 1)}`)),
        })),
        wishlist: wishlist.slice(0, 150).map((item, index) => entry(item, `w${index + 1}`)),
      };
      return { context, refs };
    };
    return {
      input,
      buildContext,
      items: [...items.values()].map((item) => ({
        id: item.id,
        visit: item.stopId !== null,
        category: item.category,
        name: nameOf(item.id),
        day: item.day,
        done: item.status === 'completed',
      })),
      zoneOf: (day: string) => storedZoneFor(trip, day),
      missingLocations: missingLocations.filter((id) => !fetched.get(id)?.location),
      hourIds: placeIds,
      hours: {
        requested: checkHours,
        pending: previews.pending,
        checked: [...previews.byId.values()].filter((preview) => preview.detail === 'full' && preview.openingPeriods.length > 0).length,
        failed: previews.failed,
      },
      nameOf,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, wishlist, visits, cached, fetched, coordsFor, previews.byId, previews.pending, previews.failed, checkHours, trip.stays, trip.timeZone, today, nowMinutes, t, placeIds, missingLocations.length]);
}

/** D1: "Plan the whole trip" on the itinerary, with a one-line reason to open it. */
export function TripPlanning({ trip, today, nowMinutes }: { trip: TripView; today: string | null; nowMinutes: number | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wishlist = useMemo(() => wishlistPlaces(trip.places), [trip.places]);
  const days = tripDays(trip.startDate, trip.endDate);
  if (days.length < 1 || trip.places.length === 0) return null;
  const caption =
    wishlist.length > 0 ? t('tripPlan.wishlistCount', { count: wishlist.length }) : t('tripPlan.balanceHint');
  return (
    <View style={styles.entry}>
      <Icon name="calendar-outline" size={18} color={colors.accent} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{t('tripPlan.title')}</AppText>
        <AppText variant="caption" color="secondary">
          {caption}
        </AppText>
      </View>
      <Button label={t('tripPlan.open')} variant="secondary" size="sm" block={false} onPress={() => setOpen(true)} />
      {open ? <TripPlanSheet trip={trip} today={today} nowMinutes={nowMinutes} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}

const hours = (minutes: number) => Math.round(minutes / 6) / 10;

/** A reason as a short tag ("Near MoMA", "−12 min travel"). */
function whyTag(why: Why, nameOf: (id: string) => string, t: TFunction, locale: string): string {
  switch (why.kind) {
    case 'near':
      return t('tripPlan.tagNear', { name: nameOf(why.otherId), minutes: why.minutes });
    case 'nearStay':
      return t('tripPlan.tagNearStay', { minutes: why.minutes });
    case 'openThatDay':
      return t('tripPlan.tagOpen');
    case 'closedOn':
      return t('tripPlan.tagClosedOn', { day: dayShort(why.day, locale) });
    case 'overloaded':
      return t('tripPlan.tagOverloaded', { day: dayShort(why.day, locale) });
    case 'savesTravel':
      return t('tripPlan.tagSaves', { minutes: why.minutes });
    case 'lightest':
      return t('tripPlan.tagLightest');
    case 'room':
      return t('tripPlan.tagRoom', { hours: hours(why.freeMinutes) });
    case 'overBy':
      return t('tripPlan.tagOverBy', { minutes: why.minutes });
    case 'youAsked':
      return t('tripPlan.tagYouAsked');
  }
}

function statusTag(status: DayStatus, day: DayDraft, t: TFunction): { label: string; tone: TagTone } | null {
  switch (status) {
    case 'past':
      return { label: t('tripPlan.statusPast'), tone: 'neutral' };
    case 'overloaded':
      return { label: t('tripPlan.statusOverloaded'), tone: 'danger' };
    case 'inefficient':
      return { label: t('tripPlan.statusInefficient', { minutes: day.order?.saved ?? 0 }), tone: 'accent' };
    // Free time is on the load bar already.
    case 'unused':
    case 'ok':
      return null;
  }
}

function unplacedText(item: Unplaced, nameOf: (id: string) => string, t: TFunction): string {
  const name = nameOf(item.id);
  if (item.reason === 'closedAllDays') return t('tripPlan.unplacedClosed', { name });
  if (item.reason === 'noDays') return t('tripPlan.unplacedNoDays', { name });
  return t('tripPlan.unplacedNoRoom', { name });
}

/** Travel to a visit, always marked as an estimate (no paid routes here). */
function travelText(leg: Leg, t: TFunction): string {
  if (!leg.known) return t('tripPlan.travelUnknown', { minutes: leg.minutes });
  return leg.mode === 'transit' ? t('tripPlan.travelTransit', { minutes: leg.minutes }) : t('tripPlan.travelWalk', { minutes: leg.minutes });
}

/**
 * D1 complete trip plan: one proposal for the whole trip. trip-plan.ts puts
 * every place on a day; smart-plan.ts orders and times each day as it would
 * then be. Each suggestion is on its own switch; the preview is always what
 * Apply would do. Applied only on "Apply", through the change queue.
 * With `focusDay` (Today's "Replan the rest of today") only that day and the
 * days its changes reach are planned and shown.
 */
export function TripPlanSheet({
  trip,
  today,
  nowMinutes,
  onClose,
  focusDay = null,
  initialRequest = null,
  here = null,
  initialSaved = null,
}: {
  trip: TripView;
  today: string | null;
  nowMinutes: number | null;
  onClose: () => void;
  focusDay?: string | null;
  initialRequest?: AssistantResult | null;
  /** Where the user is (Today's one reading), for "something nearby". */
  here?: LatLng | null;
  /** Today's "Add to today" for a saved place nearby: proposed for focusDay, nothing else. */
  initialSaved?: SavedToAdd | null;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const errorMessage = useErrorMessage();
  const applyPlan = useApplyTripPlan(trip.id);
  const [lookUp, setLookUp] = useState(false);
  const [checkHours, setCheckHours] = useState(false);
  const data = useTripPlanData(trip, today, nowMinutes, lookUp, checkHours);
  // Each suggestion's on/off; unset = its default.
  const [choice, setChoice] = useState<Record<string, boolean>>({});
  const [applied, setApplied] = useState<number | null>(null);
  // D1 trip assistant: the user's request, shaping the planner input (never the trip itself).
  const [request, setRequest] = useState<AssistantResult | null>(initialRequest);
  const [picks, setPicks] = useState<Record<number, string>>({});

  // "I also want to visit …": the place found by a search (on tap) and the day the user picked.
  // A closed place (live) looks for an alternative of the same kind around it.
  const closed = useMemo(() => {
    if (!request?.instructions.some((item) => item.kind === 'closedVisit')) return null;
    const first = resolveRequest(request.instructions, data.input, data.items, { refs: request.refs, picks, today, nowMinutes });
    const note = first.notes.find((item): item is Extract<RequestNote, { kind: 'closed' }> => item.kind === 'closed');
    return note ?? null;
  }, [request, data.input, data.items, picks, today, nowMinutes]);
  const find =
    request?.instructions.find((item): item is FindPlace => item.kind === 'findPlace') ?? (closed ? alternativeFor(closed.category, closed.day) : null);
  const around = closed ? closed.location : find?.nearHere ? here : null;
  const [picked, setPicked] = useState<DiscoverResult | null>(null);
  const [planIt, setPlanIt] = useState(false);
  const [chosenDay, setChosenDay] = useState<{ day: string; allowOver: boolean } | null>(null);
  const [placeHours, setPlaceHours] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const saveFound = useSaveFoundPlace(trip.id);
  const keepFound = useSaveFoundPlace(trip.id);
  const preview = useGooglePlacePreview(placeHours && picked ? picked.placeId : null);
  const planning = find !== null && (find.intent === 'add' || planIt);
  const sameGoogle = picked ? trip.places.filter((item) => item.googlePlaceId === picked.placeId) : [];
  const alreadyPlanned = sameGoogle.find((item) => item.stopId !== null && isUpcoming(item.status))?.day ?? null;
  // Already saved to the trip but not planned: plan that one (no second copy).
  const waitingId = sameGoogle.find((item) => item.stopId === null)?.id ?? null;
  const newStop = useMemo<PlanStop | null>(
    () =>
      initialSaved && !picked
        ? {
            id: initialSaved.id,
            startTime: null,
            durationMinutes: visitMinutes({ durationMinutes: null, category: initialSaved.category }),
            location: initialSaved.location,
            visited: false,
            typicalDuration: true,
          }
        : picked && planning && !alreadyPlanned
        ? {
            id: waitingId ?? `new:${picked.placeId}`,
            startTime: null,
            durationMinutes: visitMinutes({ durationMinutes: null, category: picked.category }),
            location: picked.location,
            visited: false,
            typicalDuration: true,
          }
        : null,
    [picked, planning, alreadyPlanned, waitingId, initialSaved],
  );
  const placeHoursState: 'idle' | 'pending' | 'checked' | 'unknown' = !placeHours
    ? 'idle'
    : preview.isPending
      ? 'pending'
      : preview.data?.detail === 'full' && preview.data.openingPeriods.length > 0
        ? 'checked'
        : 'unknown';
  const baseInput = useMemo<TripPlanInput>(() => {
    if (!newStop) return data.input;
    const periods = preview.data?.detail === 'full' ? preview.data.openingPeriods : [];
    const own = (day: string) =>
      !placeHours || preview.isPending ? undefined : periods.length > 0 ? dayWindows(periods, day) : null;
    return { ...data.input, windowsOn: (id, day) => (id === newStop.id ? own(day) : data.input.windowsOn(id, day)) };
  }, [data.input, newStop, placeHours, preview.data, preview.isPending]);

  const effect = useMemo(
    () =>
      request
        ? resolveRequest(request.instructions, baseInput, data.items, {
            refs: request.refs,
            picks,
            durationOn: (id) => isOn(choice, durationKey(id), true),
            catchUpOn: (id) => isOn(choice, catchUpKey(id), true),
            skipOn: (id) => isOn(choice, skipKey(id), true),
            shortenOn: (id) => isOn(choice, shortenKey(id), false),
            shiftOn: (day) => isOn(choice, shiftKey(day), false),
            today,
            nowMinutes,
            newPlace: newStop
              ? { stop: newStop, toDay: chosenDay?.day ?? find?.day ?? focusDay ?? null, allowOver: chosenDay?.allowOver ?? false }
              : null,
          })
        : null,
    [request, baseInput, data.items, picks, choice, today, nowMinutes, newStop, chosenDay, find, focusDay],
  );
  const plannerInput = effect?.input ?? data.input;
  const fullPlan = useMemo(() => planTrip(plannerInput), [plannerInput]);
  const dayOptions = useMemo(
    () => (newStop && effect ? compareDays({ ...effect.input, addRequests: undefined }, newStop) : null),
    [newStop, effect],
  );
  const addChange = newStop ? (fullPlan.changes.find((change) => change.itemId === newStop.id) ?? null) : null;
  const placeFocus = addChange?.toDay ?? null;
  const focus = focusDay ?? placeFocus;
  // Only the place was asked about: show the trip's days once it has a day to go to.
  const placeOnly = request !== null && request.instructions.every((item) => item.kind === 'findPlace');
  const hideDays = placeOnly && !addChange;
  const plan = useMemo(
    () =>
      newStop
        ? { ...fullPlan, changes: addChange ? [addChange] : [] }
        : focusDay
          ? { ...fullPlan, changes: fullPlan.changes.filter((change) => change.fromDay === focusDay || change.toDay === focusDay) }
          : fullPlan,
    [fullPlan, focusDay, newStop, addChange],
  );
  // Adding one place: that day's other visits keep their order and times unless the user turns those on.
  const effectiveChoice = useMemo(
    () => (placeFocus ? { [orderKey(placeFocus)]: false, [timesKey(placeFocus)]: false, ...choice } : choice),
    [choice, placeFocus],
  );
  // Focused: other days get no order or times of their own (they aren't shown, so Apply leaves them).
  const completeInput = useMemo(() => {
    if (!focus) return plannerInput;
    const touched = new Set([focus, ...plan.changes.flatMap((change) => [change.toDay, change.fromDay ?? ''])]);
    return { ...plannerInput, days: plannerInput.days.map((day) => (touched.has(day.day) ? day : { ...day, available: false })) };
  }, [plannerInput, plan, focus]);
  const complete = useMemo(() => completePlan(completeInput, plan, effectiveChoice), [completeInput, plan, effectiveChoice]);
  const shownDays = focus ? complete.days.filter((day) => day.available) : complete.days;
  const overloaded = focus ? plan.stillOverloaded.filter((day) => day === focus) : plan.stillOverloaded;
  // The trip as it is now, for before → after.
  const before = useMemo(
    () => new Map(data.input.days.map((day) => [day.day, checkDay(day.stops, day.start, day.dayStart)])),
    [data.input],
  );
  const durationsOn = [
    ...(effect?.durations ?? []).filter((item) => isOn(choice, durationKey(item.id), true)),
    ...(effect?.shorten ?? []).filter((item) => isOn(choice, shortenKey(item.id), false)),
  ];
  const skipsOn = (effect?.skips ?? []).filter((id) => isOn(choice, skipKey(id), true));
  const shiftTimes = (effect?.shifts ?? [])
    .filter((shift) => isOn(choice, shiftKey(shift.day), false))
    .flatMap((shift) => shift.stops.map((stop) => ({ stopId: stop.id, startTime: stop.to })));
  const shifted = new Set(shiftTimes.map((item) => item.stopId));
  const addedIds = new Set(complete.apply.adds.map((add) => add.tripPlaceId));
  // The new place: its suggested time (its own switch) and its spot in the day's route.
  const newVisit =
    newStop && placeFocus ? (complete.days.find((day) => day.day === placeFocus)?.visits.find((visit) => visit.id === newStop.id) ?? null) : null;
  const newChosen = newStop !== null && complete.chosen.some((change) => change.itemId === newStop.id);
  const newTimeOn = newVisit !== null && newChosen && isOn(choice, newTimeKey(newVisit.id), true);
  const newDayVisits = placeFocus ? (complete.days.find((day) => day.day === placeFocus)?.visits ?? []) : [];
  const newIndex = newVisit ? newDayVisits.findIndex((visit) => visit.id === newVisit.id) : -1;
  const applyBody = {
    ...complete.apply,
    times: [...complete.apply.times.filter((item) => !shifted.has(item.stopId)), ...shiftTimes],
    adds: complete.apply.adds.map((add) => ({
      ...add,
      startTime: newVisit && add.tripPlaceId === newVisit.id && newTimeOn ? (add.startTime ?? toTime(newVisit.start)) : add.startTime,
      durationMinutes: durationsOn.find((item) => item.id === add.tripPlaceId)?.to ?? null,
    })),
    orders:
      newChosen && placeFocus && !complete.apply.orders.some((order) => order.day === placeFocus)
        ? [...complete.apply.orders, { day: placeFocus, ids: newDayVisits.map((visit) => visit.id) }]
        : complete.apply.orders,
    durations: durationsOn.filter((item) => !addedIds.has(item.id) && data.items.some((entry) => entry.id === item.id && entry.visit)).map((item) => ({ stopId: item.id, minutes: item.to })),
    skips: skipsOn,
  };
  const changeCount = complete.count + applyBody.durations.length + skipsOn.length + shiftTimes.length;
  const startRequest = (result: AssistantResult) => {
    setRequest(result);
    setPicks({});
    setChoice({});
    setApplied(null);
    setPicked(null);
    setPlanIt(false);
    setChosenDay(null);
    setPlaceHours(false);
  };

  const on = (key: string, defaultOn: boolean) => isOn(effectiveChoice, key, defaultOn);
  const set = (key: string) => (value: boolean) => setChoice((current) => ({ ...current, [key]: value }));
  const zones = new Set(data.input.days.map((day) => data.zoneOf(day.day)).filter(Boolean));
  const name = (id: string) =>
    newStop && picked && id === newStop.id ? picked.name : initialSaved && id === initialSaved.id ? initialSaved.name : data.nameOf(id);
  const dayName = (day: string) => dayTitle(day, locale);
  const clock = (minutes: number) => formatStartTime(toTime(minutes % 1440), locale);
  const byDay = plan.changes.filter((change) => change.cause !== 'alternative');
  const nothing =
    hideDays ||
    (complete.days.every((day) => !day.order && day.timesCount === 0 && day.retimes.length === 0) &&
      plan.changes.length === 0 &&
      (effect?.durations.length ?? 0) === 0 &&
      (effect?.shifts.length ?? 0) === 0);

  const apply = async () => {
    const count = changeCount;
    let body = applyBody;
    // A place found by search is saved (collection + trip, deduped) first, online; the visit then goes through the queue.
    if (newStop && picked && newStop.id.startsWith('new:') && body.adds.some((add) => add.tripPlaceId === newStop.id)) {
      const real = await saveFound.mutateAsync({ googlePlaceId: picked.placeId, category: picked.category });
      const swap = (id: string) => (id === newStop.id ? real : id);
      body = {
        ...body,
        adds: body.adds.map((add) => ({ ...add, tripPlaceId: swap(add.tripPlaceId) })),
        orders: body.orders.map((order) => ({ ...order, ids: order.ids.map(swap) })),
      };
    }
    await applyPlan.mutateAsync(body);
    setApplied(count);
  };

  const changeRow = (change: TripChange) => (
    <ChangeRow
      key={change.key}
      label={
        change.kind === 'add'
          ? t('tripPlan.add', { name: name(change.itemId) })
          : t('tripPlan.move', { name: name(change.itemId), day: dayName(change.fromDay ?? '') })
      }
      tags={[...change.why.map((why) => whyTag(why, name, t, locale)), change.cause === 'area' ? t('tripPlan.optional') : null]}
      value={on(change.key, change.defaultOn)}
      onChange={set(change.key)}
    />
  );

  const outcome = planOutcome(complete, { durations: applyBody.durations.length + shiftTimes.length, skips: skipsOn.length });
  // One new place and nothing else (Find a place, Today's "Add to today"): say exactly that.
  const onlyAdd =
    outcome.total === 1 && applyBody.adds.length === 1 && applyBody.adds[0] ? applyBody.adds[0] : null;
  const ctaLabel = onlyAdd
    ? t('tripPlan.ctaAddOne', { name: name(onlyAdd.tripPlaceId), day: dayShort(onlyAdd.day, locale) })
    : focusDay
      ? t('tripPlan.ctaToday')
      : t('tripPlan.ctaSave');

  const timeLabel = (visit: PlannedVisit) => {
    const time = clock(visit.start);
    if (visit.time === 'yours') return t('tripPlan.timeYours', { time });
    if (visit.time === 'approx') return t('tripPlan.timeApprox', { time });
    return time;
  };

  return (
    <Sheet
      visible
      title={focusDay ? t('replan.title') : t('tripPlan.title')}
      subtitle={focusDay ? t('replan.body') : t('tripPlan.sheetBody')}
      onClose={onClose}
      footer={
        applied !== null || nothing ? (
          <Button label={t('common.close')} variant="secondary" onPress={onClose} />
        ) : (
          <View style={styles.footer}>
            {outcome.total > 0 ? (
              <View style={styles.outcome} accessible accessibilityLabel={t('tripPlan.outcomeA11y', { count: outcome.total })}>
                {outcome.added > 0 ? <Tag label={t('tripPlan.outcomeAdded', { count: outcome.added })} tone="accent" /> : null}
                {outcome.moved > 0 ? <Tag label={t('tripPlan.outcomeMoved', { count: outcome.moved })} tone="accent" /> : null}
                {outcome.updated > 0 ? <Tag label={t('tripPlan.outcomeUpdated', { count: outcome.updated })} /> : null}
                {outcome.skipped > 0 ? <Tag label={t('tripPlan.outcomeSkipped', { count: outcome.skipped })} /> : null}
              </View>
            ) : (
              <AppText variant="caption" color="secondary" align="center">
                {t('tripPlan.outcomeNone')}
              </AppText>
            )}
            <Button
              testID="plan-apply"
              label={ctaLabel}
              onPress={() => void apply()}
              loading={applyPlan.isPending}
              disabled={changeCount === 0}
            />
          </View>
        )
      }
    >
      {applied !== null ? (
        <View style={styles.row}>
          <Icon name="checkmark-circle-outline" size={18} color={colors.accent} />
          <AppText variant="body" style={styles.flex}>
            {t('tripPlan.applied', { count: applied })}
          </AppText>
        </View>
      ) : null}

      <AssistantPanel
        days={data.input.days.map((day) => day.day)}
        today={today}
        buildContext={data.buildContext}
        onResult={startRequest}
        examples={focusDay ? t('replan.examples') : undefined}
      />
      {request && effect ? (
        <RequestBox
          request={request}
          notes={effect.notes}
          pick={effect.pick}
          durations={effect.durations}
          complete={complete}
          input={plannerInput}
          nameOf={name}
          today={today}
          tripId={trip.id}
          durationOn={(id) => on(durationKey(id), true)}
          onDuration={(id) => set(durationKey(id))}
          catchUpOn={(id) => on(catchUpKey(id), true)}
          onCatchUp={(id) => set(catchUpKey(id))}
          onPick={(index, id) => setPicks((current) => ({ ...current, [index]: id }))}
          placeFinder={
            find ? (
              <PlaceFinder
                find={find}
                tripId={trip.id}
                destination={trip.destination}
                visits={data.input.days.flatMap((day) =>
                  day.stops.filter((stop) => !stop.visited).map((stop) => ({ id: stop.id, day: day.day, location: stop.location })),
                )}
                stay={data.input.days.find((day) => day.available && day.start)?.start ?? null}
                nameOf={name}
                picked={picked}
                onPick={(result) => {
                  setPicked(result);
                  setChosenDay(null);
                  setPlaceHours(false);
                }}
                planning={planning}
                onPlan={() => setPlanIt(true)}
                days={dayOptions}
                chosenDay={chosenDay?.day ?? addChange?.toDay ?? null}
                onChooseDay={(day, allowOver) => setChosenDay({ day, allowOver })}
                alreadyPlanned={alreadyPlanned}
                hours={placeHoursState}
                onCheckHours={() => setPlaceHours(true)}
                onKeepInWishlist={() => picked && keepFound.mutate({ googlePlaceId: picked.placeId, category: picked.category })}
                keepingInWishlist={keepFound.isPending}
                keptInWishlist={waitingId !== null}
                around={around}
                aroundLabel={closed ? t('live.nearClosed', { name: name(closed.id) }) : find.nearHere && here ? t('live.nearYou') : null}
              />
            ) : null
          }
          skipOn={(id) => on(skipKey(id), true)}
          onSkip={(id) => set(skipKey(id))}
          shorten={effect.shorten}
          shortenOn={(id) => on(shortenKey(id), false)}
          onShorten={(id) => set(shortenKey(id))}
          shifts={effect.shifts}
          shiftOn={(day) => on(shiftKey(day), false)}
          onShift={(day) => set(shiftKey(day))}
          onClear={() => {
            setRequest(null);
            setPicks({});
            setChoice({});
            setPicked(null);
          }}
        />
      ) : null}
      {initialSaved && !picked && !addChange && applied === null ? (
        <View style={styles.problems}>
          <AppText variant="body" color="secondary">
            {t('live.savedNoRoom', { name: initialSaved.name, day: focusDay ? dayName(focusDay) : '' })}
          </AppText>
          {focusDay ? (
            <Button
              label={t('live.addAnyway')}
              variant="secondary"
              size="sm"
              block={false}
              onPress={() => setChosenDay({ day: focusDay, allowOver: true })}
            />
          ) : null}
        </View>
      ) : null}
      {newVisit && newChosen ? (
        <ChangeRow
          label={t('placeFind.timeRow', { name: name(newVisit.id), time: clock(newVisit.start) })}
          tags={[
            newIndex > 0
              ? t('placeFind.tagAfter', { name: name(newDayVisits[newIndex - 1]?.id ?? '') })
              : t('placeFind.tagFirst'),
            t('placeFind.tagLeastTravel'),
          ]}
          value={newTimeOn}
          onChange={set(newTimeKey(newVisit.id))}
        />
      ) : null}
      {saveFound.isError ? <InlineError message={errorMessage(saveFound.error)} /> : null}
      {keepFound.isError ? <InlineError message={errorMessage(keepFound.error)} /> : null}

      {hideDays ? null : (
        <>
      {/* Sharper with locations and hours; each is fetched only when tapped. */}
      {(data.missingLocations.length > 0 && !lookUp) || (data.hourIds.length > 0 && !checkHours && plan.missing.hoursNotChecked > 0) ? (
        <View style={styles.improve}>
          <AppText variant="caption" color="secondary">
            {t('tripPlan.improve')}
          </AppText>
          <View style={styles.options}>
            {data.missingLocations.length > 0 && !lookUp ? (
              <Button label={t('tripPlan.lookUp')} icon="location-outline" variant="secondary" size="sm" block={false} onPress={() => setLookUp(true)} />
            ) : null}
            {data.hourIds.length > 0 && !checkHours && plan.missing.hoursNotChecked > 0 ? (
              <Button label={t('planning.checkHours')} icon="time-outline" variant="secondary" size="sm" block={false} onPress={() => setCheckHours(true)} />
            ) : null}
          </View>
        </View>
      ) : null}
      {checkHours && data.hours.pending ? (
        <AppText variant="caption" color="secondary">
          {t('planning.checkingHours')}
        </AppText>
      ) : checkHours && data.hours.failed > 0 && data.hours.checked === 0 ? (
        <AppText variant="caption" color="secondary">
          {t('planning.hoursUnavailable')}
        </AppText>
      ) : null}

      {nothing && applied === null ? (
        <AppText variant="body" color="secondary">
          {focusDay ? t('replan.nothing') : plan.unplaced.length > 0 ? t('tripPlan.nothingFits') : t('tripPlan.alreadyGood')}
        </AppText>
      ) : null}

      {shownDays.map((day) => {
        const status = statusTag(day.status, day, t);
        const incoming = byDay.filter((change) => change.toDay === day.day);
        const outgoing = byDay.filter((change) => change.fromDay === day.day && on(change.key, change.defaultOn));
        const zone = zones.size > 1 ? data.zoneOf(day.day) : null;
        const load = day.check.visitMinutes + day.check.travelMinutes;
        const orderTags = day.order
          ? [
              day.order.saved >= 1 ? t('tripPlan.tagSaves', { minutes: day.order.saved }) : null,
              day.order.problemsFixed > 0 ? t('tripPlan.tagFixes', { count: day.order.problemsFixed }) : null,
            ]
          : [];
        const was = before.get(day.day);
        const wasLoad = was ? was.visitMinutes + was.travelMinutes : 0;
        const changed =
          was !== undefined && day.available && !(Math.abs(wasLoad - load) < 5 && was.endsAt === day.check.endsAt && was.stops === day.visits.length);
        return (
          <View key={day.day} style={styles.day}>
            <View style={styles.row}>
              <AppText variant="bodyStrong" style={styles.flex}>
                {dayName(day.day)}
                {zone ? ` · ${zone}` : ''}
              </AppText>
              {status ? <Tag label={status.label} tone={status.tone} /> : null}
            </View>
            <AppText variant="caption" color="secondary">
              {day.visits.length === 0
                ? t('tripPlan.dayEmpty')
                : day.available
                  ? t('tripPlan.dayLine', {
                      count: day.visits.length,
                      travel: formatDurationShort(day.check.travelMinutes, t),
                      end: day.check.endsAt !== null ? clock(day.check.endsAt) : '—',
                    })
                  : t('tripPlan.dayVisits', { count: day.visits.length })}
            </AppText>
            {day.available && day.capacityMinutes > 0 ? <LoadBar usedMinutes={load} capacityMinutes={day.capacityMinutes} /> : null}
            {changed && was ? (
              <AppText variant="caption" color="tertiary">
                {t('tripPlan.before', {
                  count: was.stops,
                  load: formatDurationShort(wasLoad, t),
                  end: was.endsAt !== null ? clock(was.endsAt) : '—',
                })}
              </AppText>
            ) : null}
            {outgoing.length > 0 ? (
              <AppText variant="caption" color="tertiary">
                {t('tripPlan.leaving', { names: outgoing.map((change) => name(change.itemId)).join(', ') })}
              </AppText>
            ) : null}

            {incoming.length > 0 || day.order || day.timesCount > 0 || day.retimes.length > 0 ? (
              <View style={styles.changes}>
                {incoming.map(changeRow)}
                {day.order ? (
                  <ChangeRow label={t('tripPlan.bestOrder')} tags={orderTags} value={day.orderOn} onChange={set(orderKey(day.day))} />
                ) : null}
                {day.timesCount > 0 ? (
                  <ChangeRow label={t('planning.fillTimes', { count: day.timesCount })} value={day.timesOn} onChange={set(timesKey(day.day))} />
                ) : null}
                {day.retimes.map((item) => (
                  <ChangeRow
                    key={item.stopId}
                    label={t('planning.retime', { name: name(item.stopId), from: formatStartTime(item.from, locale), to: formatStartTime(item.to, locale) })}
                    tags={[item.reason === 'opensAt' ? t('tripPlan.tagOpensAt', { time: formatStartTime(item.to, locale) }) : t('tripPlan.tagClosesEarly')]}
                    value={on(retimeKey(item.stopId), false)}
                    onChange={set(retimeKey(item.stopId))}
                  />
                ))}
              </View>
            ) : null}

            {day.visits.length > 0 ? (
              <View style={styles.timeline}>
                {day.visits.map((visit) => (
                  <View key={visit.id} style={styles.visitBlock}>
                    {visit.travel ? (
                      <View style={[styles.row, styles.travel]}>
                        <Icon name={visit.travel.mode === 'transit' ? 'train-outline' : 'walk-outline'} size={14} color={colors.textTertiary} />
                        <AppText variant="caption" color="tertiary">
                          {travelText(visit.travel, t)}
                        </AppText>
                      </View>
                    ) : null}
                    <View style={styles.visitRow}>
                      <AppText
                        variant="caption"
                        color={visit.time === 'suggested' || visit.time === 'retimed' ? 'accent' : visit.time === 'approx' ? 'tertiary' : 'secondary'}
                        style={[styles.time, visit.time === 'suggested' || visit.time === 'retimed' ? styles.bold : null]}
                      >
                        {timeLabel(visit)}
                      </AppText>
                      <View style={styles.visitText}>
                        <AppText variant="body" color={visit.done ? 'tertiary' : 'primary'} numberOfLines={1}>
                          {name(visit.id)}
                        </AppText>
                        <Tags
                          labels={[
                            visit.arriving === 'new' ? t('tripPlan.badgeNew') : visit.arriving === 'moved' ? t('tripPlan.badgeMoved') : null,
                            visit.starred ? t('planning.starred') : null,
                            visit.done ? t('tripPlan.badgeDone') : null,
                          ]}
                          tone="accent"
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {[...day.warnings.map((warning) => warningText(warning, name, t, locale)), ...day.problems.map((problem) => problemText(problem, name, t))].map(
              (text, index) => (
                <View key={index} style={styles.row}>
                  <Icon name="alert-circle-outline" size={14} color={colors.danger} />
                  <AppText variant="caption" color="secondary" style={styles.flex}>
                    {text}
                  </AppText>
                </View>
              ),
            )}
          </View>
        );
      })}

      {(!focus && (plan.unplaced.length > 0 || plan.closedNoDay.length > 0)) || overloaded.length > 0 ? (
        <View style={styles.problems}>
          <AppText variant="bodyStrong">{t('tripPlan.doesntFit')}</AppText>
          {(focus ? [] : plan.unplaced).map((item) => {
            const alternative = plan.changes.find((change) => change.key === `alt:${item.id}`);
            return (
              <View key={item.id} style={styles.problems}>
                <AppText variant="caption" color="secondary">
                  {unplacedText(item, name, t)}
                </AppText>
                {alternative ? (
                  <ChangeRow
                    label={t('tripPlan.addAnyway', { name: name(item.id), day: dayName(alternative.toDay) })}
                    tags={alternative.why.map((why) => whyTag(why, name, t, locale))}
                    value={on(alternative.key, alternative.defaultOn)}
                    onChange={set(alternative.key)}
                  />
                ) : null}
              </View>
            );
          })}
          {(focus ? [] : plan.closedNoDay).map((id) => (
            <AppText key={id} variant="caption" color="secondary">
              {t('planning.problemClosedNoDay', { name: name(id) })}
            </AppText>
          ))}
          {overloaded.map((day) => (
            <AppText key={day} variant="caption" color="secondary">
              {t('tripPlan.stillOverloaded', { day: dayName(day) })}
            </AppText>
          ))}
        </View>
      ) : null}

      <View style={styles.problems}>
        {/* What the plan assumed and the rules it follows: the same every time, so one tap away. */}
        <Button
          label={showHow ? t('tripPlan.hideHow') : t('tripPlan.showHow')}
          variant="ghost"
          size="sm"
          block={false}
          onPress={() => setShowHow((value) => !value)}
        />
        {showHow ? (
          <>
            {plan.missing.locationUnknown > 0 ? (
              <AppText variant="caption" color="tertiary">
                {t('tripPlan.limitLocations', { count: plan.missing.locationUnknown })}
              </AppText>
            ) : null}
            {plan.missing.hoursUnknown + plan.missing.hoursNotChecked > 0 ? (
              <AppText variant="caption" color="tertiary">
                {t('tripPlan.limitHours', { count: plan.missing.hoursUnknown + plan.missing.hoursNotChecked })}
              </AppText>
            ) : null}
            <AppText variant="caption" color="tertiary">
              {t('tripPlan.legend')}
            </AppText>
            <AppText variant="caption" color="tertiary">
              {t('tripPlan.timesHint')}
            </AppText>
            <AppText variant="caption" color="tertiary">
              {t('tripPlan.limitEstimates')}
            </AppText>
          </>
        ) : null}
        {data.hours.checked > 0 || data.missingLocations.length === 0 ? <GoogleAttribution inline align="start" /> : null}
      </View>
        </>
      )}

      {applyPlan.isError ? <InlineError message={errorMessage(applyPlan.error)} /> : null}
    </Sheet>
  );
}

/** Where a day ends in the proposal (its last visit with a known place), for "find dinner near there". */
function dayEndAnchor(complete: CompletePlan, input: TripPlanInput, day: string): { id: string; location: LatLng; end: number } | null {
  const draft = complete.days.find((item) => item.day === day);
  const located = new Map(
    [...input.wishlist, ...input.days.flatMap((item) => item.stops)].flatMap((stop) => (stop.location ? [[stop.id, stop.location] as const] : [])),
  );
  const last = [...(draft?.visits ?? [])].reverse().find((visit) => located.has(visit.id));
  return last ? { id: last.id, location: located.get(last.id) as LatLng, end: last.end } : null;
}

/**
 * D1 trip assistant: what was asked, what each part did to the proposal,
 * and what's left to choose (which visit, longer visits, a search to run).
 */
function RequestBox({
  request,
  notes,
  pick,
  durations,
  complete,
  input,
  nameOf,
  today,
  tripId,
  durationOn,
  onDuration,
  catchUpOn,
  onCatchUp,
  onPick,
  placeFinder,
  skipOn,
  onSkip,
  shorten,
  shortenOn,
  onShorten,
  shifts,
  shiftOn,
  onShift,
  onClear,
}: {
  request: AssistantResult;
  notes: RequestNote[];
  pick: { index: number; options: string[] } | null;
  durations: DurationChange[];
  complete: CompletePlan;
  input: TripPlanInput;
  nameOf: (id: string) => string;
  today: string | null;
  tripId: string;
  durationOn: (id: string) => boolean;
  onDuration: (id: string) => (value: boolean) => void;
  catchUpOn: (id: string) => boolean;
  onCatchUp: (id: string) => (value: boolean) => void;
  onPick: (index: number, id: string) => void;
  /** The search-and-pick step for "I also want to visit …" (rendered for findPlace). */
  placeFinder: ReactNode;
  skipOn: (id: string) => boolean;
  onSkip: (id: string) => (value: boolean) => void;
  shorten: DurationChange[];
  shortenOn: (id: string) => boolean;
  onShorten: (id: string) => (value: boolean) => void;
  shifts: DayShift[];
  shiftOn: (day: string) => boolean;
  onShift: (day: string) => (value: boolean) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dayName = (day: string) => dayTitle(day, locale);
  const clock = (minutes: number) => formatStartTime(toTime(minutes % 1440), locale);
  const category = (value: string) => t(`categories.${value}` as 'categories.other');
  const dayList = (days: string[]) => (days.length === 0 ? t('assistant.everyDay') : days.map(dayName).join(', '));
  const firstDay = (day: string | null) => {
    const available = input.days.filter((item) => item.available);
    return day ?? (today && available.some((item) => item.day === today) ? today : (available[0]?.day ?? null));
  };

  const noteView = (note: RequestNote, index: number) => {
    switch (note.kind) {
      case 'lighten': {
        const hours = Math.round(note.maxMinutes / 6) / 10;
        if (note.already) return t('assistant.noteLightenAlready', { day: dayName(note.day), hours });
        const moved = complete.chosen.filter((change) => change.fromDay === note.day).length;
        const draft = complete.days.find((item) => item.day === note.day);
        const still = draft ? draft.check.visitMinutes + draft.check.travelMinutes > note.maxMinutes : false;
        return [
          note.maxMinutes === 0 ? t('assistant.noteFree', { day: dayName(note.day), count: moved }) : t('assistant.noteLighten', { day: dayName(note.day), hours, count: moved }),
          still ? t('assistant.noteLightenShort') : null,
        ]
          .filter(Boolean)
          .join(' ');
      }
      case 'dayStart':
        // Say what the request can do here, not just what it asked.
        if (note.flexible > 0) return t('assistant.noteStart', { time: formatStartTime(note.time, locale), days: dayList(note.days) });
        if (note.shiftDays > 0) return t('assistant.noteStartTimed', { count: note.timed });
        if (note.timed > 0) return t('assistant.noteStartNone', { time: formatStartTime(note.time, locale) });
        return t('assistant.noteStartEmpty', { time: formatStartTime(note.time, locale) });
      case 'dayEnd':
        return t('assistant.noteEnd', { time: formatStartTime(note.time, locale), days: dayList(note.days) });
      case 'moreTime':
        return note.count === 0
          ? t('assistant.noteMoreTimeNone', { category: category(note.category) })
          : t('assistant.noteMoreTime', { count: note.count, category: category(note.category) });
      case 'keepFixed':
        return note.what === 'starred' ? t('assistant.noteKeepStarred', { count: note.count }) : t('assistant.noteKeepAll', { count: note.count });
      case 'move': {
        const change = complete.chosen.find((item) => item.itemId === note.id && item.cause === 'request');
        return change
          ? t('assistant.noteMove', { name: nameOf(note.id), day: dayName(change.toDay) })
          : t('assistant.noteMoveUnmet', { name: nameOf(note.id) });
      }
      case 'moveNotFound':
        return t('assistant.noteMoveNotFound', { text: note.text });
      case 'catchUpNotToday':
        return t('assistant.noteCatchUpNotToday');
      case 'findPlace':
        return <View key={index}>{placeFinder}</View>;
      case 'skip':
        return (
          <ChangeRow
            key={index}
            label={t('live.skipRow', { name: nameOf(note.id) })}
            tags={[t('live.skipTag')]}
            value={skipOn(note.id)}
            onChange={onSkip(note.id)}
          />
        );
      case 'closed':
        return (
          <View key={index} style={styles.problems}>
            <ChangeRow
              label={t('live.closedRow', { name: nameOf(note.id) })}
              tags={[t('live.skipTag')]}
              value={skipOn(note.id)}
              onChange={onSkip(note.id)}
            />
            <AppText variant="bodyStrong">{t('live.alternative')}</AppText>
            {placeFinder}
          </View>
        );
      case 'longer':
        return t('live.noteLonger', { name: nameOf(note.id), extra: formatDurationShort(note.extra, t), time: clock(note.until) });
      case 'liveNotToday':
        return t('live.notToday');
      case 'catchUp': {
        if (note.late.length === 0) return t('assistant.noteCatchUpNone');
        const visits = complete.days.find((item) => item.day === note.day)?.visits ?? [];
        return (
          <View key={index} style={styles.problems}>
            <AppText variant="caption" color="secondary">
              {t('assistant.noteCatchUp', { count: note.late.length })}
            </AppText>
            {note.late.map((item) => {
              const visit = visits.find((entry) => entry.id === item.id);
              const on = catchUpOn(item.id);
              const label =
                on && visit?.time === 'suggested'
                  ? t('assistant.catchUpRow', { name: nameOf(item.id), from: formatStartTime(item.from, locale), to: clock(visit.start) })
                  : t('assistant.catchUpKeep', { name: nameOf(item.id), from: formatStartTime(item.from, locale) });
              return <ChangeRow key={item.id} label={label} value={on} onChange={onCatchUp(item.id)} />;
            })}
          </View>
        );
      }
      case 'findNearby': {
        const day = firstDay(note.day);
        const stay = input.days.find((item) => item.day === day)?.start ?? null;
        const end = day && note.near === 'dayEnd' ? dayEndAnchor(complete, input, day) : null;
        const anchor = end ? { location: end.location, label: nameOf(end.id) } : stay ? { location: stay, label: t('assistant.yourStay') } : null;
        const what = category(note.category);
        return (
          <View key={index} style={styles.problems}>
            <AppText variant="caption" color="secondary">
              {!anchor
                ? t('assistant.noteNearbyUnknown', { what })
                : end && day
                  ? t('assistant.noteNearbyEnd', { what, day: dayName(day), name: anchor.label, time: clock(end.end) })
                  : t('assistant.noteNearbyStay', { what })}
            </AppText>
            {anchor ? (
              <Button
                label={t('assistant.searchNear', { name: anchor.label })}
                icon="search"
                variant="secondary"
                size="sm"
                block={false}
                onPress={() =>
                  router.push({
                    pathname: '/trips/[id]/discover',
                    params: {
                      id: tripId,
                      q: note.query,
                      cat: note.category,
                      lat: String(anchor.location.latitude),
                      lng: String(anchor.location.longitude),
                      label: t('assistant.nearLabel', { what, name: anchor.label }),
                    },
                  })
                }
              />
            ) : null}
          </View>
        );
      }
    }
  };

  return (
    <View style={styles.request}>
      <View style={styles.row}>
        <Icon name="chatbubble-ellipses-outline" size={18} color={colors.accent} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            “{request.message}”
          </AppText>
          <AppText variant="caption" color="tertiary">
            {request.source === 'ai' ? t('assistant.readByAi') : t('assistant.readOnPhone')}
            {request.summary ? ` · ${request.summary}` : ''}
          </AppText>
        </View>
        <Button label={t('assistant.clear')} variant="ghost" size="sm" block={false} onPress={onClear} />
      </View>
      {notes.map((note, index) => {
        const view = noteView(note, index);
        return typeof view === 'string' ? (
          <View key={index} style={styles.row}>
            <Icon name="checkmark" size={14} color={colors.accent} />
            <AppText variant="caption" color="secondary" style={styles.flex}>
              {view}
            </AppText>
          </View>
        ) : (
          view
        );
      })}
      {pick ? (
        <View style={styles.problems}>
          <AppText variant="bodyStrong">{t('assistant.whichOne')}</AppText>
          <View style={styles.options}>
            {pick.options.map((id) => (
              <Button key={id} label={nameOf(id)} variant="secondary" size="sm" block={false} onPress={() => onPick(pick.index, id)} />
            ))}
          </View>
        </View>
      ) : null}
      {durations.map((item) => (
        <ChangeRow
          key={item.id}
          label={t('assistant.longer', { name: nameOf(item.id), from: formatDurationShort(item.from, t), to: formatDurationShort(item.to, t) })}
          tags={[t('tripPlan.tagYouAsked')]}
          value={durationOn(item.id)}
          onChange={onDuration(item.id)}
        />
      ))}
      {shorten.map((item) => (
        <ChangeRow
          key={item.id}
          label={t('live.shortenRow', { name: nameOf(item.id), from: formatDurationShort(item.from, t), to: formatDurationShort(item.to, t) })}
          tags={[t('live.shortenTag')]}
          value={shortenOn(item.id)}
          onChange={onShorten(item.id)}
        />
      ))}
      {shifts.map((shift) => (
        <ChangeRow
          key={shift.day}
          label={t('assistant.shiftRow', {
            day: dayName(shift.day),
            to: formatStartTime(shift.to, locale),
            from: formatStartTime(shift.from, locale),
          })}
          tags={[
            t(shift.minutes < 0 ? 'assistant.shiftEarlier' : 'assistant.shiftLater', {
              count: shift.stops.length,
              time: formatDurationShort(Math.abs(shift.minutes), t),
            }),
          ]}
          value={shiftOn(shift.day)}
          onChange={onShift(shift.day)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.card, backgroundColor: colors.surface },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  day: { gap: spacing.sm, padding: spacing.lg, borderRadius: radii.card, backgroundColor: colors.surface },
  changes: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.xs },
  problems: { gap: spacing.xs },
  improve: { gap: spacing.sm },
  timeline: { gap: spacing.sm, paddingTop: spacing.xs },
  request: { gap: spacing.sm, padding: spacing.lg, borderRadius: radii.card, backgroundColor: colors.accentSoft },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: { gap: spacing.sm },
  outcome: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  visitBlock: { gap: spacing.xxs },
  travel: { paddingStart: 76 + spacing.sm },
  visitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  visitText: { flex: 1, gap: spacing.xxs },
  time: { width: 76 },
  bold: { fontWeight: weights.semibold },
});
