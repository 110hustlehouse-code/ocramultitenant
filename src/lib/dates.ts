const DAY = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });
const DAY_YEAR = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome" });

/** «3 ott», con l'anno solo se diverso da quello corrente. */
export function formatDay(date: Date | null | undefined, now: Date = new Date()): string | null {
  if (!date) return null;
  return date.getUTCFullYear() === now.getUTCFullYear() ? DAY.format(date) : DAY_YEAR.format(date);
}
