import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { ScheduledReminder } from './reminders';

/**
 * Thin wrapper over expo-notifications for LOCAL notifications only (no push
 * token, no server, no Apple push entitlement). Every notification this app
 * schedules carries `data.tc = 1`, so we never touch anything else.
 */

export type PermissionState = 'granted' | 'denied' | 'undetermined';

let foregroundConfigured = false;

/** Show reminders as banners even while the app is open. Safe to call more than once. */
export function configureForegroundPresentation(): void {
  if (foregroundConfigured) return;
  foregroundConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function toState(status: Notifications.NotificationPermissionsStatus): PermissionState {
  if (status.granted) return 'granted';
  const ios = status.ios?.status;
  if (ios === Notifications.IosAuthorizationStatus.PROVISIONAL || ios === Notifications.IosAuthorizationStatus.EPHEMERAL) {
    return 'granted';
  }
  return status.canAskAgain ? 'undetermined' : 'denied';
}

export async function getPermission(): Promise<PermissionState> {
  try {
    return toState(await Notifications.getPermissionsAsync());
  } catch {
    return 'denied';
  }
}

/** Asks only when the user turns reminders on (never at app launch). */
export async function requestPermission(): Promise<PermissionState> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (toState(current) !== 'undetermined') return toState(current);
    return toState(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      }),
    );
  } catch {
    return 'denied';
  }
}

export interface OurScheduled extends ScheduledReminder {
  title: string;
  fireAtMs: number | null;
  tripId: string | null;
}

/** This app's pending reminders (ignores anything not created by us). */
export async function getOurScheduled(): Promise<OurScheduled[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all.flatMap((request) => {
    const data = request.content.data as Record<string, unknown> | undefined;
    if (!data || data.tc !== 1) return [];
    return [
      {
        id: request.identifier,
        fingerprint: typeof data.fp === 'string' ? data.fp : '',
        title: request.content.title ?? '',
        fireAtMs: typeof data.fireAtMs === 'number' ? data.fireAtMs : null,
        tripId: typeof data.tripId === 'string' ? data.tripId : null,
      },
    ];
  });
}

export async function cancelReminder(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}

export async function cancelAllOurs(): Promise<number> {
  const ours = await getOurScheduled();
  await Promise.all(ours.map((item) => cancelReminder(item.id)));
  return ours.length;
}

export interface ReminderContent {
  id: string;
  title: string;
  body: string;
  /** iOS subtitle line; "Google Maps" when the text names a Google place. */
  subtitle?: string;
  fireAtMs: number;
  fingerprint: string;
  tripId: string;
  placeId: string | null;
}

export async function scheduleReminder(content: ReminderContent): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: content.id,
    content: {
      title: content.title,
      body: content.body,
      ...(content.subtitle ? { subtitle: content.subtitle } : {}),
      sound: 'default',
      data: {
        tc: 1,
        fp: content.fingerprint,
        fireAtMs: content.fireAtMs,
        tripId: content.tripId,
        placeId: content.placeId,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: content.fireAtMs,
      ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
    },
  });
}

/** A one-off reminder a few seconds from now, to check that reminders work on this phone. */
export async function sendTestReminder(title: string, body: string, tripId: string | null): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: `tc:test:${Date.now()}`,
    content: { title, body, sound: 'default', data: { tc: 1, fp: 'test', tripId } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
  });
}

/** Android needs a channel before anything can show (iOS ignores this). */
export async function ensureAndroidChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name,
    importance: Notifications.AndroidImportance.HIGH,
  });
}

/** Called with the trip of a tapped reminder (also when the tap launched the app). */
export function onReminderTapped(handler: (tripId: string | null) => void): () => void {
  const read = (response: Notifications.NotificationResponse | null) => {
    const data = response?.notification.request.content.data as Record<string, unknown> | undefined;
    if (data?.tc === 1) handler(typeof data.tripId === 'string' ? data.tripId : null);
  };
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    read(response);
    if (response) void Notifications.clearLastNotificationResponseAsync();
  });
  const subscription = Notifications.addNotificationResponseReceivedListener(read);
  return () => subscription.remove();
}
