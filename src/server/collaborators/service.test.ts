import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company, type User } from "@/generated/prisma/client";
import { testContext } from "@/test/context";
import { addEvaluation, CollaboratorError, collaboratorProjects, listEvaluations, setLinkedUser } from "./service";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("collaboratori sul database", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenantId: string;
  let duit: Company, fulcro: Company;
  let ceo: User, pm: User, teamMember: User;
  let collaboratorId: string;
  let paidProjectId: string, memberProjectId: string;

  const ctxFor = (u: User, roles: Array<["CEO" | "PROJECT_MANAGER", Company]>) => {
    const c = testContext(
      prisma,
      tenantId,
      u.id,
      roles.map(([role, company]) => [company, role]),
    );
    return { ...c, user: { id: u.id, name: u.name, email: u.email }, tenant: { ...c.tenant, modules: ["PROGETTI", "MARGINE", "COLLABORATORI"] } } as typeof c;
  };
  const asCeo = () => ctxFor(ceo, [["CEO", duit]]);
  const asPm = () => ctxFor(pm, [["PROJECT_MANAGER", duit]]);
  const asCeoFulcro = () => ctxFor(ceo, [["CEO", fulcro]]);
  const asCeoBoth = () => ctxFor(ceo, [["CEO", duit], ["CEO", fulcro]]);

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { slug: `collab-${suffix}`, name: "Collab" } })).id;
    duit = await prisma.company.create({ data: { tenantId, slug: "duit", name: "Duit", colorLight: "#000000", colorDark: "#FFFFFF" } });
    fulcro = await prisma.company.create({ data: { tenantId, slug: "fulcro", name: "Fulcro", colorLight: "#000000", colorDark: "#FFFFFF" } });
    const user = async (name: string, role: "CEO" | "PROJECT_MANAGER", companies: Company[]) => {
      const u = await prisma.user.create({ data: { tenantId, email: `${name.toLowerCase()}-${suffix}@t.local`, name } });
      for (const c of companies) await prisma.membership.create({ data: { tenantId, userId: u.id, companyId: c.id, role } });
      return u;
    };
    ceo = await user("Daniele", "CEO", [duit, fulcro]);
    pm = await user("Giammarco", "PROJECT_MANAGER", [duit]);
    teamMember = await user("Sara", "PROJECT_MANAGER", [duit]);

    const party = await prisma.party.create({ data: { tenantId, kinds: ["COLLABORATORE_ESTERNO"], name: "Marco Freelance" } });
    collaboratorId = party.id;
    await prisma.partyCompany.create({ data: { tenantId, partyId: collaboratorId, companyId: duit.id } });

    paidProjectId = (await prisma.project.create({ data: { tenantId, companyId: duit.id, name: "Videoclip" } })).id;
    await prisma.projectCost.create({
      data: { tenantId, projectId: paidProjectId, partyId: collaboratorId, description: "Service audio", amount: 50_000, incurredAt: new Date() },
    });

    memberProjectId = (await prisma.project.create({ data: { tenantId, companyId: duit.id, name: "Rebranding" } })).id;
    await prisma.projectMember.create({ data: { tenantId, projectId: memberProjectId, userId: teamMember.id } });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("i progetti collegati si derivano dai costi pagati, non da una relazione salvata", async () => {
    const projects = await collaboratorProjects(asCeo(), collaboratorId);
    expect(projects.map((p) => p.name)).toEqual(["Videoclip"]);
    expect(projects[0]).toMatchObject({ totalPaid: 50_000, paymentsCount: 1, asTeamMember: false });

    // Il PM (senza finance:read) vede il progetto ma non l'importo.
    const pmView = await collaboratorProjects(asPm(), collaboratorId);
    expect(pmView[0]).toMatchObject({ totalPaid: null, paymentsCount: 1 });
  });

  it("collegando il collaboratore a un utente con accesso, compaiono anche i progetti dove lavora come membro", async () => {
    await setLinkedUser(asCeo(), collaboratorId, teamMember.id);
    const projects = await collaboratorProjects(asCeo(), collaboratorId);
    expect(projects.map((p) => p.name).sort()).toEqual(["Rebranding", "Videoclip"]);
    const rebranding = projects.find((p) => p.name === "Rebranding")!;
    expect(rebranding.asTeamMember).toBe(true);

    await setLinkedUser(asCeo(), collaboratorId, null);
    expect((await collaboratorProjects(asCeo(), collaboratorId)).map((p) => p.name)).toEqual(["Videoclip"]);
  });

  it("solo chi vede i dati economici legge o scrive le valutazioni", async () => {
    await expect(listEvaluations(asPm(), collaboratorId)).resolves.toEqual([]);
    await expect(
      addEvaluation(asPm(), collaboratorId, { companyId: duit.id, projectId: null, rating: 5, notes: null }),
    ).rejects.toThrow(CollaboratorError);

    await addEvaluation(asCeo(), collaboratorId, { companyId: duit.id, projectId: paidProjectId, rating: 4, notes: "Puntuale e preciso" });
    const evals = await listEvaluations(asCeo(), collaboratorId);
    expect(evals).toHaveLength(1);
    expect(evals[0]).toMatchObject({ rating: 4, notes: "Puntuale e preciso", project: { id: paidProjectId } });
  });

  it("non si può valutare un collaboratore per una società a cui non è collegato", async () => {
    // Erika come CEO di Fulcro non vede nemmeno il collaboratore: è collegato solo a Duit.
    await expect(
      addEvaluation(asCeoFulcro(), collaboratorId, { companyId: fulcro.id, projectId: null, rating: 3, notes: null }),
    ).rejects.toThrow(/non trovato/);

    // Un CEO con accesso a entrambe le società non può comunque valutarlo "per Fulcro": il party non è collegato lì.
    await expect(
      addEvaluation(asCeoBoth(), collaboratorId, { companyId: fulcro.id, projectId: null, rating: 3, notes: null }),
    ).rejects.toThrow(/non valida/);
  });
});
