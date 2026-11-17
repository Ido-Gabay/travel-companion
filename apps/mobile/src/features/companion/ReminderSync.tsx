import { tripDays, type TripDetail } from '@travel-companion/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useGooglePlace, useGooglePlaces } from '@/features/places/queries';
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
import { diffReminders, planReminders, reminderFingerprint, type ReminderDay } from './reminders';

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
  return <Scheduler trip={mode ? (detail.data ?? null) : null} hasTrip={mode !== null} />;
}

function Scheduler({ trip, hasTrip }: { trip: TripDetail | null; hasTrip: boolean }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const settings = useReminderSettings();
  const muted = useMutedStops();
  const hotel = useGooglePlace(trip?.basePlaceId ?? null);

  const timedStops = useMemo(
    () => (trip ? trip.places.filter((place) => place.day !== null && place.startTime !== null && place.visitedAt === null) : []),
    [trip],
  );
  // Locations for timed stops and the stops just before them (travel is measured from the previous stop).
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
    const reminderDays: ReminderDay[] = tripDays(trip.startDate, trip.endDate).map((day) => ({
      day,
      stops: placesForDay(trip.places, day).map((place) => ({
        id: place.id,
        name: (place.googlePlaceId ? details.get(place.googlePlaceId)?.name : place.name) ?? place.name ?? '',
        category: place.category,
        startTime: place.startTime,
        visited: place.visitedAt !== null,
        location: place.googlePlaceId ? (details.get(place.googlePlaceId)?.location ?? null) : null,
        google: place.googlePlaceId !== null,
      })),
    }));
    return {
      tripId: trip.id,
      timeZone: hotel.data?.timeZone ?? null,
      hotel: hotel.data?.location ?? null,
      days: reminderDays,
      muted: mutedSet,
      settings: settings.data,
    };
  }, [trip, settings.data, muted.data, details, hotel.data]);

  const running = useRef(false);
  const latest = useRef<{ inputs: typeof inputs; hasTrip: boolean; locale: string }>({ inputs, hasTrip, locale });
  latest.current = { inputs, hasTrip, locale };

  useEffect(() => {
    const sync = async () => {
      if (running.current) return;
      running.current = true;
      const { inputs: current, hasTrip: anyTrip, locale: lang } = latest.current;
      try {
        const enabled = settings.data?.enabled ?? false;
        const permission = await getPermission();
        if (!enabled || permission !== 'granted' || (!current && !anyTrip)) {
          // Off, not allowed, or no current/upcoming trip: nothing of ours should stay scheduled.
          if (settings.data) await cancelAllOurs();
          queryClient.setQueryData<ReminderStatus>(reminderStatusKey, {
            at: Date.now(),
            scheduled: 0,
            permission,
            timeZone: current?.timeZone ?? null,
            tripId: current?.tripId ?? null,
            error: null,
          });
          return;
        }
        if (!current) return; // Trip still loading.
        await ensureAndroidChannel(t('reminders.channel'));
        const desired = planReminders({ ...current, nowMs: Date.now() });
        const scheduled = await getOurScheduled();
        // Reminders from another trip are not in the plan: the diff cancels them too.
        const { cancel, schedule } = diffReminders(scheduled, desired, lang);
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
            tripId: reminder.tripId,
            placeId: reminder.placeId,
          });
        }
        queryClient.setQueryData<ReminderStatus>(reminderStatusKey, {
          at: Date.now(),
          scheduled: desired.length,
          permission,
          timeZone: current.timeZone,
          tripId: current.tripId,
          error: null,
        });
      } catch (error) {
        queryClient.setQueryData<ReminderStatus>(reminderStatusKey, (previous) => ({
          at: Date.now(),
          scheduled: previous?.scheduled ?? 0,
          permission: previous?.permission ?? 'undetermined',
          timeZone: previous?.timeZone ?? null,
          tripId: previous?.tripId ?? null,
          error: error instanceof Error ? error.message : String(error),
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
  }, [inputs, hasTrip, locale, settings.data, queryClient, t]);

  return null;
}
