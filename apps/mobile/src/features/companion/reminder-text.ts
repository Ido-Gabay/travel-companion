import type { TFunction } from 'i18next';
import { formatStartTime } from '@/features/trips/itinerary';
import type { PlannedReminder } from './reminders';

/** The notification title and body for a planned reminder, in the app language. */
export function reminderText(
  reminder: PlannedReminder,
  t: TFunction,
  locale: string,
): { title: string; body: string; subtitle?: string } {
  const { vars } = reminder;
  const name = vars.name ?? '';
  const time = vars.time ? formatStartTime(vars.time, locale) : '';
  const travel =
    vars.travelMode === 'walk'
      ? t('reminders.travelWalk', { min: vars.travelMinutes ?? 0 })
      : vars.travelMode === 'transit'
        ? t('reminders.travelTransit', { min: vars.travelMinutes ?? 0 })
        : t('reminders.travelUnknown', { min: vars.travelMinutes ?? 0 });

  // Google place names need Google's attribution; the subtitle line carries it (never translated).
  const attribution = vars.google ? { subtitle: 'Google Maps' } : {};

  switch (reminder.kind) {
    case 'leaveSoon':
      return {
        title: t('reminders.leaveSoonTitle', { min: vars.lead ?? 0, name }),
        body: t('reminders.leaveSoonBody', { name, time, travel }),
        ...attribution,
      };
    case 'leaveNow':
      return {
        title: t('reminders.leaveNowTitle', { name }),
        body: t('reminders.leaveNowBody', { time, travel }),
        ...attribution,
      };
    case 'headsUp':
      return { title: t('reminders.headsUpTitle', { time }), body: name, ...attribution };
    case 'morning':
      return {
        title: t('reminders.morningTitle', { count: vars.count ?? 0 }),
        body: vars.name ? t('reminders.morningBody', { name, time }) : t('reminders.morningBodyNoTime'),
        ...(vars.name ? attribution : {}),
      };
  }
}
