import type { CSSProperties } from "react";
import { readableOn, safeHex } from "@/lib/color";
import type { CompanyView } from "@/server/company/selection";

/** Variabili CSS del brand attivo. Nella vista consolidata il guscio resta neutro. */
export function brandStyle(view: CompanyView): CSSProperties | undefined {
  if (view.kind === "all") return undefined;
  const light = safeHex(view.company.colorLight, "#11151c");
  const dark = safeHex(view.company.colorDark, "#e8ecf1");
  return {
    "--brand-light": light,
    "--brand-dark": dark,
    "--on-brand-light": readableOn(light),
    "--on-brand-dark": readableOn(dark),
  } as CSSProperties;
}
