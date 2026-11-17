import { tripDays, type TripDetail } from '@travel-companion/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useOfflineCoords } from '@/features/offline/OfflineProvider';
import { useGooglePlace, useGooglePlaces } from '@/features/places/queries';
import { fallbackName } from '@/features/places/use-place-display';
import { tripMode, placesForDay } from '@/features/trips/itinerary';
import { useTrip, useTrips } from '@/features/trips/queries';
import { useLocale } from '@/i18n/LocaleProvider';
import { toIsoDate } from '@/lib/dates';
import {
  cancelAllOurs,
  cancelReminder,
  configureForegroundPresentation,
  ensureAndroidChannel,
  getOurScheduled,
  getPermission,
  onReminderTapped,
  scheduleReminder,
} from './notifications';
import { useMutedStops, useReminderSettings } from './reminder-settings';
import { reminderText } from './reminder-text';
import {
  diffReminders,
  diffRemindersPreserving,
  planReminders,
  reminderFingerprint,
  reminderPlanKey,
  reminderSyncMode,
  type ReminderDay,
} from './reminders';

/** Last sync outcome, shown on the Reminders settings screen. */
export const reminderStatusKey = ['reminders', 'status'] as const;
export interface ReminderStatus {
  at: number;
  scheduled: number;
  permission: 'granted' | 'denied' | 'undetermined';
  /** The trip time zone used, or null when falling back to the phone's zone. */
  timeZone: string | null;
  tripId: string | null;
  error: string | null;
  /** Last sync ran without Google details (offline): earlier reminders were kept as they are. */
  preserved: boolean;
}

/** Wait for inputs (Google details, settings) to settle before touching the schedule. */
const DEBOUNCE_MS = 1500;

/**
 * Keeps the phone's local reminders in step with the itinerary. Mounted once at
 * the root. Runs when inputs change and when the app comes to the foreground;
 * each run computes the full desired set and applies only the difference, so
 * edits never leave duplicate or outdated reminders. It never edits the plan.
 */
export function ReminderSync({ signedIn }: { signedIn: boolean }) {
  // Signed out: remove everything this app scheduled (another account may sign in).
  useEffect(() => {
    if (!signedIn) void cancelAllOurs().catch(() => undefined);
  }, [signedIn]);

  useEffect(() => {
    configureForegroundPresentation();
    // A tapped reminder opens Today for its trip (also when the tap launched the app).
    return onReminderTapped((tripId) => {
      setTimeout(() => {
        if (tripId) router.push({ pathname: '/today', params: { tripId } });
      }, 400);
    });
  }, []);

  return signedIn ? <SignedInSync /> : null;
}

function SignedInSync() {
  const trips = useTrips();
  const today = toIsoDate(new Date());
  const mode = useMemo(() => tripMode(trips.data?.items ?? [], today), [trips.data, today]);
  const tripId = mode?.trip.id ?? '';
  const detail = useTrip(tripId);
  return (
    <Scheduler
      trip={mode ? (detail.data ?? null) : null}
      hasTrip={mode !== null}
      // Known = we have data (fresh or the saved copy), even if the last refresh failed.
      tripsKnown={trips.data !== undefined}
    />
  );
}

function Scheduler({ trip, hasTrip, tripsKnown }: { trip: TripDetail | null; hasTrip: boolean; tripsKnown: boolean }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const settings = useReminderSettings();
  const muted = useMutedStops();
  const hotel = useGooglePlace(trip?.basePlaceId ?? null);
  const coordsFor = useOfflineCoords();

  const timedStops = useMemo(
    () => (trip ? trip.places.filter((place) => place.day !== null && place.startTime !== null && place.visitedAt === null) : []),
    [trip],
  );
  const googleIds = useMemo(
    () =>
      trip
        ? [...new Set(trip.places.filter((place) => place.day !== null).map((place) => place.googlePlaceId))].filter(
            (id): id is string => id !== null,
          )
        : [],
    [trip],
  );
  const details = useGooglePlaces(timedStops.length > 0 ? googleIds : []);

  const inputs = useMemo(() => {
    if (!trip || !settings.data || !muted.data) return null;
    const mutedSet = new Set(muted.data.filter((key) => key.startsWith(`${trip.id}:`)).map((key) => key.slice(trip.id.length + 1)));
    let missing = false;
    const reminderDays: ReminderDay[] = tripDays(trip.startDate, trip.endDate).map((day) => ({
      day,
      stops: placesForDay(trip.places, day).map((place) => {
        const google = place.googlePlaceId ? details.get(place.googlePlaceId) : undefined;
        if (place.googlePlaceId && !google && place.startTime && place.visitedAt === null) missing = true;
        return {
          id: place.id,
          // Without Google details (offline): never a blank name. Category until M12a labels.
          name: google?.name ?? place.name ?? fallbackName(place, t),
          category: place.category,
          startTime: place.startTime,
          visited: place.visitedAt !== null,
          location: google?.location ?? coordsFor(place.googlePlaceId),
          // Attribution only when the text really contains Google's name.
          google: google !== undefined,
        };
      }),
    }));
    if (trip.basePlaceId && !hotel.data) missing = true;
    return {
      tripId: trip.id,
      timeZone: hotel.data?.timeZone ?? null,
      hotel: hotel.data?.location ?? coordsFor(trip.basePlaceId),
      days: reminderDays,
      muted: mutedSet,
      settings: settings.data,
      degraded: missing,
    };
  }, [trip, settings.data, muted.data, details, hotel.data, t, coordsFor]);

  const running = useRef(false);
  const latest = useRef({ inputs, hasTrip, tripsKnown, locale });
  latest.current = { inputs, hasTrip, tripsKnown, locale };

  useEffect(() => {
    const sync = async () => {
      if (running.current) return;
      running.current = true;
      const { inputs: current, hasTrip: anyTrip, tripsKnown: known, locale: lang } = latest.current;
      try {
        const permission = await getPermission();
        const mode = reminderSyncMode({
          settingsLoaded: settings.data !== undefined,
          enabled: settings.data?.enabled ?? false,
          permission,
          tripsKnown: known,
          hasTrip: anyTrip,
          tripKnown: current !== null,
          degraded: current?.degraded ?? false,
        });
        // Data not loaded (offline, server asleep): leave the phone's reminders exactly as they are.
        if (mode === 'wait') return;
        if (mode === 'cancelAll' || !current) {
          // Off, not allowed, or the trip list is known and has no current/upcoming trip.
          await cancelAllOurs();
          queryClient.setQueryData<ReminderStatus>(reminderStatusKey, {
            at: Date.now(),
            scheduled: 0,
            permission,
            timeZone: current?.timeZone ?? null,
            tripId: current?.tripId ?? null,
            error: null,
            preserved: false,
          });
          return;
        }
        await ensureAndroidChannel(t('reminders.channel'));
        const plan = { ...current, nowMs: Date.now() };
        const desired = planReminders(plan);
        const scheduled = await getOurScheduled();
        // Reminders from another trip are not in the plan: both diffs cancel them too.
        const { cancel, schedule } =
          mode === 'preserve'
            ? diffRemindersPreserving(scheduled, planReminders(plan, { raw: true }), desired)
            : diffReminders(scheduled, desired, lang);
        for (const id of cancel) await cancelReminder(id);
        for (const reminder of schedule) {
          const text = reminderText(reminder, t, lang);
          await scheduleReminder({
            id: reminder.id,
            title: text.title,
            body: text.body,
            ...(text.subtitle ? { subtitle: text.subtitle } : {}),
            fireAtMs: reminder.fireAtMs,
            fingerprint: reminderFingerprint(reminder, lang),
            planKey: reminderPlanKey(reminder),
            tripId: reminder.tripId,
            placeId: reminder.placeId,
          });
        }
        queryClient.setQueryData<ReminderStatus>(reminderStatusKey, {
          at: Date.now(),
          scheduled: scheduled.length - cancel.length + schedule.length,
          permission,
          timeZone: current.timeZone,
          tripId: current.tripId,
          error: null,
          preserved: mode === 'preserve',
        });
      } catch (error) {
        queryClient.setQueryData<ReminderStatus>(reminderStatusKey, (previous) => ({
          at: Date.now(),
          scheduled: previous?.scheduled ?? 0,
          permission: previous?.permission ?? 'undetermined',
          timeZone: previous?.timeZone ?? null,
          tripId: previous?.tripId ?? null,
          error: error instanceof Error ? error.message : String(error),
          preserved: previous?.preserved ?? false,
        }));
      } finally {
        running.current = false;
      }
    };

    const timer = setTimeout(() => void sync(), DEBOUNCE_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [inputs, hasTrip, tripsKnown, locale, settings.data, queryClient, t]);

  return null;
}
