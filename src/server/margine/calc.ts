/**
 * Margine: calcoli puri, senza DB (si testano da soli). Importi sempre in centesimi.
 *
 * Costo reale = costi registrati a mano (fatture, esterni) + lavoro interno stimato dai task
 * chiusi (mai dalle ore, decisione di Daniele: "in soldi e in task").
 */

export type BudgetLineCalc = {
  revenue: number;
  plannedCost: number | null;
  tasksDone: number;
  tasksTotal: number;
};

/** Quota di plannedCost "consumata": proporzionale ai task collegati già chiusi. */
export function accruedCost(line: Pick<BudgetLineCalc, "plannedCost" | "tasksDone" | "tasksTotal">): number {
  if (!line.plannedCost || line.tasksTotal === 0) return 0;
  return Math.round((line.plannedCost * line.tasksDone) / line.tasksTotal);
}

export type MarginSummary = {
  revenue: number;
  plannedCost: number;
  manualCost: number;
  accruedCost: number;
  actualCost: number;
  marginPlanned: number;
  marginActual: number;
  /** Il costo reale corre più veloce del lavoro consegnato: il software segnala, non blocca (principio 3). */
  atRisk: boolean;
};

/** Soglia di scarto fra ritmo di spesa e ritmo di consegna oltre la quale si segnala. */
export const RISK_THRESHOLD = 0.15;

export function summarizeMargin(
  lines: BudgetLineCalc[],
  manualCost: number,
  projectStatus: "ATTIVO" | "IN_PAUSA" | "CHIUSO" | "ANNULLATO",
): MarginSummary {
  const revenue = lines.reduce((s, l) => s + l.revenue, 0);
  const plannedCost = lines.reduce((s, l) => s + (l.plannedCost ?? 0), 0);
  const accrued = lines.reduce((s, l) => s + accruedCost(l), 0);
  const actualCost = accrued + manualCost;
  const tasksDone = lines.reduce((s, l) => s + l.tasksDone, 0);
  const tasksTotal = lines.reduce((s, l) => s + l.tasksTotal, 0);
  const doneRatio = tasksTotal > 0 ? tasksDone / tasksTotal : null;
  const costRatio = plannedCost > 0 ? actualCost / plannedCost : null;
  const atRisk = projectStatus === "ATTIVO" && doneRatio !== null && costRatio !== null && costRatio - doneRatio > RISK_THRESHOLD;
  return {
    revenue,
    plannedCost,
    manualCost,
    accruedCost: accrued,
    actualCost,
    marginPlanned: revenue - plannedCost,
    marginActual: revenue - actualCost,
    atRisk,
  };
}
