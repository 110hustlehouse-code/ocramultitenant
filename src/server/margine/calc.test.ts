import { describe, expect, it } from "vitest";
import { accruedCost, summarizeMargin } from "./calc";

describe("accruedCost", () => {
  it("nessun costo previsto o nessun task collegato: zero", () => {
    expect(accruedCost({ plannedCost: null, tasksDone: 0, tasksTotal: 0 })).toBe(0);
    expect(accruedCost({ plannedCost: 1000, tasksDone: 0, tasksTotal: 0 })).toBe(0);
  });

  it("proporzionale ai task chiusi, arrotondato", () => {
    expect(accruedCost({ plannedCost: 1000, tasksDone: 1, tasksTotal: 3 })).toBe(333);
    expect(accruedCost({ plannedCost: 1000, tasksDone: 3, tasksTotal: 3 })).toBe(1000);
  });
});

describe("summarizeMargin", () => {
  const lines = [
    { revenue: 100_000, plannedCost: 40_000, tasksDone: 2, tasksTotal: 4 },
    { revenue: 50_000, plannedCost: null, tasksDone: 1, tasksTotal: 1 },
  ];

  it("margine previsto vs attuale, con costi manuali sommati", () => {
    const s = summarizeMargin(lines, 5_000, "ATTIVO");
    expect(s.revenue).toBe(150_000);
    expect(s.plannedCost).toBe(40_000);
    expect(s.accruedCost).toBe(20_000); // metà della prima riga, la seconda non ha plannedCost
    expect(s.manualCost).toBe(5_000);
    expect(s.actualCost).toBe(25_000);
    expect(s.marginPlanned).toBe(110_000);
    expect(s.marginActual).toBe(125_000);
  });

  it("segnala solo un progetto attivo dove la spesa corre più del lavoro consegnato", () => {
    // 50% dei task fatti ma già speso il 90% del costo previsto: a rischio.
    const rischio = summarizeMargin([{ revenue: 100_000, plannedCost: 40_000, tasksDone: 1, tasksTotal: 2 }], 36_000 - 20_000, "ATTIVO");
    expect(rischio.atRisk).toBe(true);

    const chiuso = summarizeMargin([{ revenue: 100_000, plannedCost: 40_000, tasksDone: 1, tasksTotal: 2 }], 36_000 - 20_000, "CHIUSO");
    expect(chiuso.atRisk).toBe(false); // non più «aperto»: principio 2 vale solo mentre il progetto è in corso

    const inLinea = summarizeMargin([{ revenue: 100_000, plannedCost: 40_000, tasksDone: 2, tasksTotal: 4 }], 0, "ATTIVO");
    expect(inLinea.atRisk).toBe(false);
  });

  it("nessun budget previsto: niente segnale (non c'è nulla da confrontare)", () => {
    const s = summarizeMargin([{ revenue: 10_000, plannedCost: null, tasksDone: 0, tasksTotal: 0 }], 5_000, "ATTIVO");
    expect(s.atRisk).toBe(false);
  });
});
