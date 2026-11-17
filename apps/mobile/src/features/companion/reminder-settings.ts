import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_REMINDER_SETTINGS, LEAD_OPTIONS, type ReminderSettings } from './reminders';

/**
 * Reminder settings and muted stops, stored on this phone: reminders are
 * scheduled by and shown on this device, so they are a device preference,
 * not account data. (A future multi-device version could sync them.)
 */
const SETTINGS_KEY = 'reminders:settings:v1';
const MUTED_KEY = 'reminders:muted:v1';
export const reminderSettingsKey = ['reminders', 'settings'] as const;
export const mutedStopsKey = ['reminders', 'muted'] as const;

/** Muted stops are stored as "tripId:placeId". */
export const muteKey = (tripId: string, placeId: string) => `${tripId}:${placeId}`;

function parseSettings(raw: string | null): ReminderSettings {
  if (!raw) return DEFAULT_REMINDER_SETTINGS;
  try {
    const value = JSON.parse(raw) as Partial<ReminderSettings>;
    const lead = LEAD_OPTIONS.find((option) => option === value.leadMinutes) ?? DEFAULT_REMINDER_SETTINGS.leadMinutes;
    const bool = (key: keyof ReminderSettings, fallback: boolean) =>
      typeof value[key] === 'boolean' ? (value[key] as boolean) : fallback;
    return {
      enabled: bool('enabled', DEFAULT_REMINDER_SETTINGS.enabled),
      leaveSoon: bool('leaveSoon', DEFAULT_REMINDER_SETTINGS.leaveSoon),
      leadMinutes: lead,
      leaveNow: bool('leaveNow', DEFAULT_REMINDER_SETTINGS.leaveNow),
      headsUp: bool('headsUp', DEFAULT_REMINDER_SETTINGS.headsUp),
      morningSummary: bool('morningSummary', DEFAULT_REMINDER_SETTINGS.morningSummary),
    };
  } catch {
    return DEFAULT_REMINDER_SETTINGS;
  }
}

export function useReminderSettings() {
  return useQuery({
    queryKey: reminderSettingsKey,
    queryFn: async () => parseSettings(await AsyncStorage.getItem(SETTINGS_KEY)),
    staleTime: Infinity,
  });
}

export function useUpdateReminderSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ReminderSettings>) => {
      const current = queryClient.getQueryData<ReminderSettings>(reminderSettingsKey) ?? DEFAULT_REMINDER_SETTINGS;
      const next = { ...current, ...patch };
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    },
    onSuccess: (next) => queryClient.setQueryData(reminderSettingsKey, next),
  });
}

export function useMutedStops() {
  return useQuery({
    queryKey: mutedStopsKey,
    queryFn: async (): Promise<string[]> => {
      try {
        const raw = await AsyncStorage.getItem(MUTED_KEY);
        const value: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
      } catch {
        return [];
      }
    },
    staleTime: Infinity,
  });
}

export function useToggleMuted() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const current = queryClient.getQueryData<string[]>(mutedStopsKey) ?? [];
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      await AsyncStorage.setItem(MUTED_KEY, JSON.stringify(next));
      return next;
    },
    onSuccess: (next) => queryClient.setQueryData(mutedStopsKey, next),
  });
}
