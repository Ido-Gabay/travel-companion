/**
 * Wall-clock times in a trip's time zone. Reminders are scheduled before the
 * trip (the phone is still on home time), so "Nov 23, 10:00" must mean 10:00
 * in New York, not on the phone's clock. Uses Intl only (no library).
 */

/** True when the runtime knows this IANA time zone. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of a time zone from UTC at a given instant. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wall - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant (ms since epoch) of a calendar day + "HH:MM" in a time zone.
 * Without a (valid) zone, the phone's own zone is used.
 */
export function zonedDateTimeToUtc(day: string, time: string, timeZone: string | null): number {
  const [y, mo, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  if (!timeZone || !isValidTimeZone(timeZone)) {
    return new Date(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0).getTime();
  }
  const asUtc = Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
  // Two passes settle the offset around daylight-saving changes.
  let instant = asUtc - offsetAt(asUtc, timeZone);
  instant = asUtc - offsetAt(instant, timeZone);
  return instant;
}
