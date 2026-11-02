/**
 * Local-calendar day-key helpers.
 *
 * All persistent day keys in the app use the format YYYY-MM-DD and MUST be
 * computed from the device's LOCAL calendar (a new day starts at exactly
 * 00:00 local / device time), not from UTC.
 *
 * Never use `new Date().toISOString().split('T')[0]` for day keys: it
 * returns the UTC date, which lags the local date by the UTC offset — e.g.
 * in UTC+3 the UTC day rolls over at 03:00 local time, so between 00:00 and
 * 03:00 the app would treat "today" as yesterday.
 */

/** Format a Date as a YYYY-MM-DD key in the device's LOCAL calendar. */
export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today's day key (local calendar). */
export function todayKey(): string {
  return dateKey(new Date());
}

/** Yesterday's day key (local calendar; DST-safe — setDate, not 86400000 math). */
export function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d);
}
