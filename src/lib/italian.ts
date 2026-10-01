/**
 * Normalizzazione e controlli dei dati fiscali italiani.
 * Funzioni pure: usate da form, import CSV e test.
 */

const clean = (v: string) => v.replace(/[\s.\-_/]/g, "").toUpperCase();

/** P.IVA: toglie spazi, punti e il prefisso IT. */
export function normalizeVat(raw: string): string {
  const v = clean(raw);
  return v.startsWith("IT") && v.length === 13 ? v.slice(2) : v;
}

/** Partita IVA italiana: 11 cifre con cifra di controllo. */
export function isValidVat(raw: string): boolean {
  const v = normalizeVat(raw);
  if (!/^\d{11}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let d = Number(v[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10 === Number(v[10]);
}

export function normalizeTaxCode(raw: string): string {
  return clean(raw);
}

/** Codice fiscale: 16 caratteri (persona fisica) oppure 11 cifre (società). */
export function isValidTaxCode(raw: string): boolean {
  const v = normalizeTaxCode(raw);
  if (/^\d{11}$/.test(v)) return isValidVat(v);
  return /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(v);
}

export function normalizeSdi(raw: string): string {
  return clean(raw);
}

/** Codice destinatario SDI: 7 caratteri alfanumerici (0000000 = consegna via PEC). */
export function isValidSdi(raw: string): boolean {
  return /^[A-Z0-9]{7}$/.test(normalizeSdi(raw));
}

export function normalizeIban(raw: string): string {
  return clean(raw);
}

/** IBAN: formato (paese + cifre di controllo + BBAN) e cifra di controllo mod-97. */
export function isValidIban(raw: string): boolean {
  const v = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) return false;
  const rearranged = v.slice(4) + v.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const value = ch >= "0" && ch <= "9" ? ch : String(ch.charCodeAt(0) - 55);
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** Telefono: solo cifre e + iniziale; aggiunge +39 ai cellulari italiani senza prefisso. */
export function normalizePhone(raw: string): string {
  const v = raw.replace(/[^\d+]/g, "");
  if (v.startsWith("00")) return `+${v.slice(2)}`;
  if (/^3\d{8,9}$/.test(v)) return `+39${v}`;
  return v;
}
