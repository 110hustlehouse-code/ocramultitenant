/**
 * Preventivi: calcoli e formati puri, condivisi da server, UI e PDF.
 * Importi sempre in centesimi (interi): niente virgola mobile sui soldi.
 */

export const QUOTE_STATUS = {
  BOZZA: { label: "Bozza", tone: "text-muted" },
  INVIATO: { label: "Inviato", tone: "text-warn" },
  ACCETTATO: { label: "Accettato", tone: "text-ok" },
  RIFIUTATO: { label: "Rifiutato", tone: "text-danger" },
} as const;

export const DEFAULT_VAT_RATE = 22;

// Separatore delle migliaia sempre («5.002,00 €»): di default l'italiano lo omette sotto le 10.000.
const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" });

export function formatEuro(cents: number): string {
  return EURO.format(cents / 100);
}

const AMOUNT = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });

/** Importo senza simbolo, per i campi da modificare e i prompt («2.400,00»). */
export function formatAmount(cents: number): string {
  return AMOUNT.format(cents / 100);
}

/** «1.234,50», «1234.5», «€ 1.234» → centesimi; null se non è un importo. */
export function parseEuro(value: string): number | null {
  let v = value.replace(/[€\s]/g, "");
  if (!v) return null;
  // Formato italiano: il punto separa le migliaia, la virgola i decimali.
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}

/** Quantità: «2», «1,5», «0.25» → numero con al massimo due decimali; null se non valida. */
export function parseQuantity(value: string): number | null {
  const v = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
}

export function lineTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice);
}

export function quoteTotals(lines: Array<{ quantity: number; unitPrice: number }>, vatRate: number) {
  const subtotal = lines.reduce((sum, l) => sum + lineTotal(l.quantity, l.unitPrice), 0);
  const vat = Math.round((subtotal * vatRate) / 100);
  return { subtotal, vat, total: subtotal + vat };
}

/** «n. 30/2026»: numero progressivo della società e anno di emissione. */
export function quoteLabel(number: number, issueDate: Date): string {
  return `n. ${number}/${issueDate.toLocaleDateString("it-IT", { year: "numeric", timeZone: "Europe/Rome" })}`;
}

/** Parole che non identificano il cliente nel codice PO («Fondazione Teatro Nuovo» → TEATRONUOVO). */
const GENERIC = new Set([
  "srl", "srls", "spa", "snc", "sas", "sapa", "scarl", "soc", "coop", "societa", "società", "cooperativa",
  "fondazione", "associazione", "ass", "atelier", "studio", "gruppo", "group", "agenzia", "ditta", "impresa",
  "di", "del", "della", "dei", "degli", "delle", "e", "and", "the", "il", "lo", "la", "i", "gli", "le",
]);

/** Sigla del cliente per il codice PO: maiuscole, senza spazi né forme societarie, massimo 12 caratteri. */
export function clientCode(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const meaningful = words.filter((w) => !GENERIC.has(w));
  const code = (meaningful.length ? meaningful : words).join("").toUpperCase();
  return code.slice(0, 12) || "CLIENTE";
}

const segment = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");

/**
 * Codice PO: SOCIETÀ/SERVIZIO/MM-AAAA/CLIENTE/E. I progetti nati da un preventivo sono sempre
 * «E» (entrata); «U» è per gli acquisti da fornitori.
 */
export function projectCode(input: { companyPrefix: string; serviceCode: string; date: Date; clientCode: string }): string {
  const [year, month] = input.date.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }).split("-");
  return [segment(input.companyPrefix), segment(input.serviceCode), `${month}-${year}`, segment(input.clientCode), "E"].join("/");
}
