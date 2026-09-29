import { describe, expect, it } from "vitest";
import { addWorkdays, coveredWorkdays, isOfficeHours, isWorkday, nextOfficeMorning, romeTime, workdaysBetween } from "./workdays";

describe("giorni lavorativi", () => {
  it("niente weekend e festività nazionali, Pasquetta compresa", () => {
    expect(isWorkday("2026-09-29")).toBe(true); // martedì
    expect(isWorkday("2026-10-03")).toBe(false); // sabato
    expect(isWorkday("2026-10-04")).toBe(false); // domenica
    expect(isWorkday("2026-12-08")).toBe(false); // Immacolata, martedì
    expect(isWorkday("2026-04-06")).toBe(false); // Pasquetta 2026
    expect(isWorkday("2027-03-29")).toBe(false); // Pasquetta 2027
    expect(isWorkday("2026-04-07")).toBe(true);
  });

  it("aggiunge giorni lavorativi saltando weekend e feste", () => {
    expect(addWorkdays("2026-09-29", 3)).toBe("2026-10-02"); // mar → ven
    expect(addWorkdays("2026-10-01", 3)).toBe("2026-10-06"); // gio → mar (salta il weekend)
    expect(addWorkdays("2026-12-04", 3)).toBe("2026-12-10"); // ven → gio (salta weekend e 8 dicembre)
  });

  it("le 9 di Roma con l'ora legale e con l'ora solare", () => {
    expect(romeTime("2026-09-29", 9).toISOString()).toBe("2026-09-29T07:00:00.000Z");
    expect(romeTime("2026-12-01", 9).toISOString()).toBe("2026-12-01T08:00:00.000Z");
    expect(nextOfficeMorning(new Date("2026-10-02T15:00:00Z"), 3).toISOString()).toBe("2026-10-07T07:00:00.000Z");
  });

  it("orario d'ufficio: giorni lavorativi, dalle 9 alle 18 di Roma", () => {
    expect(isOfficeHours(new Date("2026-09-29T07:00:00Z"))).toBe(true); // 9:00
    expect(isOfficeHours(new Date("2026-09-29T06:59:00Z"))).toBe(false); // 8:59
    expect(isOfficeHours(new Date("2026-09-29T16:00:00Z"))).toBe(false); // 18:00
    expect(isOfficeHours(new Date("2026-10-03T09:00:00Z"))).toBe(false); // sabato
  });

  it("conta i giorni lavorativi e non somma le attese in parallelo", () => {
    const d = (s: string) => new Date(`${s}T10:00:00Z`);
    expect(workdaysBetween(d("2026-09-29"), d("2026-09-29"))).toBe(0);
    expect(workdaysBetween(d("2026-10-02"), d("2026-10-06"))).toBe(2); // ven → mar: lun e mar
    expect(
      coveredWorkdays([
        { from: d("2026-09-28"), to: d("2026-10-01") }, // mar, mer, gio
        { from: d("2026-09-30"), to: d("2026-10-02") }, // gio, ven
      ]),
    ).toBe(4);
  });
});
