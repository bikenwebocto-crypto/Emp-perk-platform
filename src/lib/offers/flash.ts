// Flash offers: a MerchantOffer with isFlash = true. The active window is still
// startDate → endDate; the only extra rule is a maximum duration, kept here (not
// in the database) so the limit can change without a migration.

export const FLASH_MAX_DAYS = 15;
export const FLASH_MAX_HOURS = FLASH_MAX_DAYS * 24;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Latest allowed end for a flash offer, as a datetime-local value
 * ("YYYY-MM-DDTHH:mm"), for the end date input's `max`. Empty when unknown.
 */
export function flashMaxEndLocal(startLocal: string): string {
  const start = new Date(startLocal);
  if (!startLocal || Number.isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + FLASH_MAX_HOURS * HOUR_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

/** Error message for an invalid flash window, or null when it is fine (or not a flash offer). */
export function validateFlashWindow(
  isFlash: unknown,
  startDate: unknown,
  endDate: unknown,
): string | null {
  if (!isFlash || !startDate || !endDate) return null;
  const start = new Date(startDate as string).getTime();
  const end = new Date(endDate as string).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;

  const hours = (end - start) / HOUR_MS;
  if (hours <= 0) return "Flash offer end time must be after start time";
  if (hours > FLASH_MAX_HOURS) return `Flash offers cannot run for more than ${FLASH_MAX_DAYS} days`;
  return null;
}

export function isFlashActive(
  offer: { isFlash?: boolean | null; status?: string | null; startDate: string | Date; endDate: string | Date },
  now: Date = new Date(),
): boolean {
  return (
    !!offer.isFlash &&
    offer.status === "LIVE" &&
    now >= new Date(offer.startDate) &&
    now <= new Date(offer.endDate)
  );
}

/** "2h 14m", "45m", or null once ended. */
export function formatTimeLeft(endDate: string | Date, now: Date = new Date()): string | null {
  const ms = new Date(endDate).getTime() - now.getTime();
  if (!(ms > 0)) return null;
  const totalMinutes = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
