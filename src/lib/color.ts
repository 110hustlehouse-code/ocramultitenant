const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/**
 * I colori arrivano dal DB e finiscono in CSS inline:
 * accettiamo solo #RRGGBB, altrimenti fallback. Nessuna iniezione possibile.
 */
export function safeHex(value: unknown, fallback: string): string {
  return isHexColor(value) ? value : fallback;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Testo leggibile sopra un colore brand: nero o bianco. */
export function readableOn(hex: string): "#000000" | "#FFFFFF" {
  return contrastRatio(hex, "#000000") >= contrastRatio(hex, "#FFFFFF") ? "#000000" : "#FFFFFF";
}
