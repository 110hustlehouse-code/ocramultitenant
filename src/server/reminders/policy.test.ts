import { describe, expect, it } from "vitest";
import { nextStep, onTimeRate, romeClock, type ReminderTask } from "./policy";

// A settembre Roma è UTC+2: 06:30Z = 08:30, 13:30Z = 15:30.
const at = (iso: string) => new Date(iso);
const base: ReminderTask = {
  status: "DA_FARE",
  assigneeId: "u1",
  dueDate: at("2026-09-29T12:00:00Z"),
  escalation: 0,
  lastReminderAt: null,
  blockerNote: null,
  projectStatus: "ATTIVO",
};

describe("orologio di Roma", () => {
  it("ora e giorno locali", () => {
    expect(romeClock(at("2026-09-29T06:30:00Z"))).toEqual({ day: "2026-09-29", hour: 8 });
    expect(romeClock(at("2026-09-29T22:30:00Z"))).toEqual({ day: "2026-09-30", hour: 0 });
  });
});

describe("sequenza dei richiami", () => {
  it("nessun richiamo prima della scadenza o prima delle 8", () => {
    expect(nextStep(base, at("2026-09-28T09:00:00Z"))).toBeNull();
    expect(nextStep(base, at("2026-09-29T05:00:00Z"))).toBeNull(); // 07:00 a Roma
  });

  it("mattina del giorno di scadenza: primo richiamo", () => {
    expect(nextStep(base, at("2026-09-29T06:30:00Z"))).toEqual({ level: 1 });
  });

  it("stesso giorno: il secondo solo dalle 15", () => {
    const first = { ...base, escalation: 1, lastReminderAt: at("2026-09-29T06:30:00Z") };
    expect(nextStep(first, at("2026-09-29T11:00:00Z"))).toBeNull(); // 13:00
    expect(nextStep(first, at("2026-09-29T13:30:00Z"))).toEqual({ level: 2 }); // 15:30
  });

  it("giorno dopo, se ancora aperto e scaduto: passa al PM", () => {
    const second = { ...base, escalation: 2, lastReminderAt: at("2026-09-29T13:30:00Z") };
    expect(nextStep(second, at("2026-09-29T16:00:00Z"))).toBeNull(); // stesso giorno
    expect(nextStep(second, at("2026-09-30T06:30:00Z"))).toEqual({ level: 3 });
  });

  it("task già scaduto e mai sollecitato: parte dal primo", () => {
    const old = { ...base, dueDate: at("2026-09-20T12:00:00Z") };
    expect(nextStep(old, at("2026-09-29T06:30:00Z"))).toEqual({ level: 1 });
  });

  it("si ferma: fatto, «non posso», progetto in pausa, senza persona, già al PM", () => {
    const now = at("2026-09-29T06:30:00Z");
    expect(nextStep({ ...base, status: "FATTO" }, now)).toBeNull();
    expect(nextStep({ ...base, blockerNote: "aspetto il materiale" }, now)).toBeNull();
    expect(nextStep({ ...base, projectStatus: "IN_PAUSA" }, now)).toBeNull();
    expect(nextStep({ ...base, assigneeId: null }, now)).toBeNull();
    expect(nextStep({ ...base, escalation: 3 }, now)).toBeNull();
  });
});

describe("puntualità", () => {
  it("quota di task chiusi entro la scadenza", () => {
    expect(
      onTimeRate([
        { dueDate: at("2026-09-10T12:00:00Z"), completedAt: at("2026-09-10T20:00:00Z") }, // 22:00 a Roma, stesso giorno
        { dueDate: at("2026-09-10T12:00:00Z"), completedAt: at("2026-09-11T09:00:00Z") },
        { dueDate: null, completedAt: at("2026-09-11T09:00:00Z") },
      ]),
    ).toBe(50);
    expect(onTimeRate([])).toBeNull();
  });
});
