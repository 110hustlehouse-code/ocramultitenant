import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company, type User } from "@/generated/prisma/client";
import { ALL_COMPANIES } from "@/server/company/selection";
import { testContext } from "@/test/context";
import { addCost, budgetLineLabels, deleteCost, MarginError, marginBoard, projectMargin } from "./service";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("margine sul database", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenantId: string;
  let duit: Company, fulcro: Company;
  let ceo: User, pm: User;
  let projectId: string, lineA: string, lineB: string;

  const ctxFor = (u: User, roles: Array<[Company, "CEO" | "PROJECT_MANAGER"]>, view?: string) => {
    const c = testContext(prisma, tenantId, u.id, roles, view);
    return { ...c, user: { id: u.id, name: u.name, email: u.email }, tenant: { ...c.tenant, modules: ["PROGETTI", "MARGINE"] } } as typeof c;
  };
  // Vista «Tutte le società»: così il cruscotto Margine può davvero consolidare (principio: la vista
  // consolidata si sceglie nel selettore società, come per ogni altro modulo — non è un caso speciale qui).
  const asCeo = () => ctxFor(ceo, [[duit, "CEO"], [fulcro, "CEO"]], ALL_COMPANIES);
  const asPm = () => ctxFor(pm, [[duit, "PROJECT_MANAGER"]]);

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { slug: `mar-${suffix}`, name: "Mar", modules: ["PROGETTI", "MARGINE"] } })).id;
    duit = await prisma.company.create({ data: { tenantId, slug: "duit", name: "Duit", colorLight: "#000000", colorDark: "#FFFFFF" } });
    fulcro = await prisma.company.create({ data: { tenantId, slug: "fulcro", name: "Fulcro", colorLight: "#000000", colorDark: "#FFFFFF" } });
    const user = async (name: string, role: "CEO" | "PROJECT_MANAGER", companies: Company[]) => {
      const u = await prisma.user.create({ data: { tenantId, email: `${name.toLowerCase()}-${suffix}@t.local`, name } });
      for (const c of companies) await prisma.membership.create({ data: { tenantId, userId: u.id, companyId: c.id, role } });
      return u;
    };
    ceo = await user("Daniele", "CEO", [duit, fulcro]);
    pm = await user("Giammarco", "PROJECT_MANAGER", [duit]);

    projectId = (await prisma.project.create({ data: { tenantId, companyId: duit.id, name: "Videoclip", managerId: pm.id } })).id;
    lineA = (await prisma.projectBudgetLine.create({ data: { tenantId, projectId, description: "Riprese", revenue: 100_000, plannedCost: 40_000 } })).id;
    lineB = (await prisma.projectBudgetLine.create({ data: { tenantId, projectId, description: "Montaggio", revenue: 50_000, plannedCost: null } })).id;

    const task = (title: string, status: "DA_FARE" | "FATTO", budgetLineId: string) =>
      prisma.task.create({ data: { tenantId, projectId, title, status, budgetLineId, completedAt: status === "FATTO" ? new Date() : null } });
    await task("Girato 1", "FATTO", lineA);
    await task("Girato 2", "DA_FARE", lineA);
    await task("Export", "FATTO", lineB);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("solo chi ha finance:read vede il margine; il PM no", async () => {
    await expect(projectMargin(asPm(), projectId)).rejects.toThrow(/dati economici/);
    const margin = await projectMargin(asCeo(), projectId);
    expect(margin.project.name).toBe("Videoclip");
  });

  it("il PM può vedere le etichette delle righe di budget (senza importi) per collegare i task", async () => {
    const labels = await budgetLineLabels(asPm(), projectId, duit.id);
    expect(labels).toEqual([{ id: lineA, description: "Riprese" }, { id: lineB, description: "Montaggio" }]);
  });

  it("costo interno stimato dai task chiusi, non dalle ore; costi manuali sommati", async () => {
    await addCost(asCeo(), projectId, { description: "Service audio esterno", amount: 5_000, incurredAt: "2026-09-20", budgetLineId: lineA });
    const margin = await projectMargin(asCeo(), projectId);

    expect(margin.revenue).toBe(150_000);
    expect(margin.plannedCost).toBe(40_000);
    expect(margin.accruedCost).toBe(20_000); // 1 task su 2 chiuso sulla riga A (40.000/2)
    expect(margin.manualCost).toBe(5_000);
    expect(margin.actualCost).toBe(25_000);
    expect(margin.marginPlanned).toBe(110_000);
    expect(margin.marginActual).toBe(125_000);

    const lineARow = margin.lines.find((l) => l.id === lineA)!;
    expect(lineARow).toMatchObject({ tasksDone: 1, tasksTotal: 2 });
    expect(margin.costs).toHaveLength(1);
    expect(margin.costs[0]).toMatchObject({ description: "Service audio esterno", amount: 5_000 });
  });

  it("registrare o cancellare un costo reale è azione del CEO, mai del PM", async () => {
    await expect(
      addCost(asPm(), projectId, { description: "x", amount: 100, incurredAt: "2026-09-20", budgetLineId: null }),
    ).rejects.toThrow(MarginError);
    const cost = await addCost(asCeo(), projectId, { description: "Trasferta", amount: 3_000, incurredAt: "2026-09-21", budgetLineId: null });
    await expect(deleteCost(asPm(), cost.id)).rejects.toThrow(MarginError);
    await deleteCost(asCeo(), cost.id);
    expect(await prisma.projectCost.findUnique({ where: { id: cost.id } })).toBeNull();
  });

  it("rifiuta una riga di budget di un altro progetto", async () => {
    // CHIUSO: fuori dai progetti aperti, non deve alterare i totali del test successivo.
    const other = await prisma.project.create({ data: { tenantId, companyId: duit.id, name: "Altro", status: "CHIUSO" } });
    const otherLine = await prisma.projectBudgetLine.create({ data: { tenantId, projectId: other.id, description: "x", revenue: 1000 } });
    await expect(
      addCost(asCeo(), projectId, { description: "voce", amount: 100, incurredAt: "2026-09-20", budgetLineId: otherLine.id }),
    ).rejects.toThrow(/non valida/);
  });

  it("cruscotto: totale per società e per gruppo (CEO su più società)", async () => {
    const project2 = await prisma.project.create({ data: { tenantId, companyId: fulcro.id, name: "Spot TV" } });
    await prisma.projectBudgetLine.create({ data: { tenantId, projectId: project2.id, description: "Tutto", revenue: 20_000, plannedCost: 10_000 } });

    const board = await marginBoard(asCeo());
    expect(board.rows.some((r) => r.id === projectId)).toBe(true);
    expect(board.rows.some((r) => r.id === project2.id)).toBe(true);
    const duitTotal = board.byCompany.find((c) => c.companyId === duit.id)!;
    expect(duitTotal.revenue).toBe(150_000);
    expect(board.group).not.toBeNull();
    expect(board.group!.revenue).toBe(170_000);

    // Il PM vede solo le società dove ha finance:read: nessuna.
    const pmBoard = await marginBoard(asPm());
    expect(pmBoard.rows).toEqual([]);
    expect(pmBoard.group).toBeNull();
  });
});
