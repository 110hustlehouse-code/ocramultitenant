/**
 * Giorni lavorativi a Roma: niente sabato, domenica e festività nazionali (Pasquetta compresa).
 * Funzioni pure: l'orario è sempre un parametro.
 */

const TZ = "Europe/Rome";

/** AAAA-MM-GG del giorno di Roma. */
export function romeDay(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: TZ });
}

function romeHour(d: Date): number {
  const h = Number(d.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ }));
  return h === 24 ? 0 : h;
}

/** L'istante in cui a Roma è `day` alle `hour`:00 (tiene conto dell'ora legale). */
export function romeTime(day: string, hour: number): Date {
  const guess = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
  const diff = romeHour(guess) - hour;
  return new Date(guess.getTime() - diff * 3_600_000);
}

/** Domenica di Pasqua (algoritmo di Gauss/Meeus, calendario gregoriano). */
function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const FIXED = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"];

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isWorkday(day: string): boolean {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  if (FIXED.includes(day.slice(5))) return false;
  return day !== addDays(easter(Number(day.slice(0, 4))), 1);
}

/** Il giorno lavorativo che viene `n` giorni lavorativi dopo `day`. */
export function addWorkdays(day: string, n: number): string {
  let d = day;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isWorkday(d)) left--;
  }
  return d;
}

/** Orario d'ufficio a Roma: giorno lavorativo, dalle 9 alle 18. */
export const OFFICE_START = 9;
export const OFFICE_END = 18;

export function isOfficeHours(now: Date): boolean {
  const h = romeHour(now);
  return isWorkday(romeDay(now)) && h >= OFFICE_START && h < OFFICE_END;
}

/** Quando parte il prossimo promemoria: fra `n` giorni lavorativi, all'apertura dell'ufficio. */
export function nextOfficeMorning(from: Date, n: number): Date {
  return romeTime(addWorkdays(romeDay(from), n), OFFICE_START);
}

/** Giorni lavorativi trascorsi da `from` a `to` (il giorno di partenza non conta). */
export function workdaysBetween(from: Date, to: Date): number {
  const end = romeDay(to);
  let d = romeDay(from);
  let count = 0;
  while (d < end) {
    d = addDays(d, 1);
    if (isWorkday(d)) count++;
  }
  return count;
}

/**
 * Giorni lavorativi coperti da almeno un intervallo (i solleciti in parallelo sullo stesso progetto
 * non si sommano): è il tempo in cui il progetto è rimasto fermo per il cliente.
 */
export function coveredWorkdays(intervals: Array<{ from: Date; to: Date }>): number {
  const days = new Set<string>();
  for (const { from, to } of intervals) {
    const end = romeDay(to);
    let d = romeDay(from);
    while (d < end) {
      d = addDays(d, 1);
      if (isWorkday(d)) days.add(d);
    }
  }
  return days.size;
}
