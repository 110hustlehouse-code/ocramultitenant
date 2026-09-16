import { describe, expect, it } from "vitest";
import { contrastRatio, readableOn, safeHex } from "./color";

describe("colori", () => {
  it("accetta solo #RRGGBB", () => {
    expect(safeHex("#8F0AFF", "#000000")).toBe("#8F0AFF");
    expect(safeHex("red;background:url(x)", "#000000")).toBe("#000000");
    expect(safeHex("#fff", "#000000")).toBe("#000000");
    expect(safeHex(null, "#000000")).toBe("#000000");
  });

  it("sceglie il testo leggibile", () => {
    expect(readableOn("#FFFFFF")).toBe("#000000");
    expect(readableOn("#8F0AFF")).toBe("#FFFFFF");
    expect(readableOn("#3ED7FB")).toBe("#000000");
  });

  // I colori brand del seed per il tema chiaro devono reggere il testo su fondo bianco (AA large ≥ 3)
  it.each(["#8F0AFF", "#C24A00", "#1195BC"])("%s è leggibile sul tema chiaro", (hex) => {
    expect(contrastRatio(hex, "#FFFFFF")).toBeGreaterThanOrEqual(3);
  });

  it.each(["#B066FF", "#FF6304", "#3ED7FB"])("%s è leggibile sul tema scuro", (hex) => {
    expect(contrastRatio(hex, "#141920")).toBeGreaterThanOrEqual(3);
  });
});
