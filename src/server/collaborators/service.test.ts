import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company, type User } from "@/generated/prisma/client";
import type { PartyKind } from "@/generated/prisma/enums";
import { testContext } from "@/test/context";
import { PartyConflictError } from "@/server/registry/service";
import { addEvaluation, CollaboratorError, collaboratorProjects, createCollaboratorWithAccess, listEvaluations, setLinkedUser } from "./service";

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

  describe("accesso dedicato alla creazione", () => {
    const partyBase = (overrides: Partial<Parameters<typeof createCollaboratorWithAccess>[1]> = {}) => ({
      kinds: ["COLLABORATORE_ESTERNO"] as PartyKind[],
      name: "Nuovo Collaboratore",
      address: null,
      vatNumber: null,
      taxCode: null,
      pec: null,
      sdiCode: null,
      contactName: null,
      email: null,
      phone: null,
      categories: [],
      notes: null,
      companyIds: [duit.id],
      availabilityNote: null,
      paymentIban: null,
      paymentHolder: null,
      fiscalDocumentType: null,
      paymentTerms: null,
      ...overrides,
    });

    it("crea Party + User + Membership in un colpo solo, con la password hashata e il cambio obbligatorio", async () => {
      const email = `collab-${suffix}@t.local`;
      const result = await createCollaboratorWithAccess(asCeo(), partyBase({ name: "Luca Esterno" }), {
        email,
        password: "una-password-robusta",
        role: "CREATIVE",
        companyIds: [duit.id],
        accessExpiresAt: null,
      });

      const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
      expect(user.email).toBe(email);
      expect(user.passwordHash).not.toBeNull();
      expect(user.passwordHash).not.toBe("una-password-robusta");
      expect(user.mustChangePassword).toBe(true);

      const membership = await prisma.membership.findUniqueOrThrow({ where: { userId_companyId: { userId: user.id, companyId: duit.id } } });
      expect(membership.role).toBe("CREATIVE");

      const party = await prisma.party.findUniqueOrThrow({ where: { id: result.partyId } });
      expect(party.linkedUserId).toBe(user.id);
    });

    it("un PM senza settings:manage non può creare un accesso, anche se gestisce i collaboratori", async () => {
      await expect(
        createCollaboratorWithAccess(asPm(), partyBase({ name: "Tentativo PM" }), {
          email: `pmtry-${suffix}@t.local`,
          password: "una-password-robusta",
          role: "CREATIVE",
          companyIds: [duit.id],
          accessExpiresAt: null,
        }),
      ).rejects.toThrow(CollaboratorError);
    });

    it("ruolo Esterno senza scadenza: rifiutato anche chiamando il servizio direttamente", async () => {
      await expect(
        createCollaboratorWithAccess(asCeo(), partyBase({ name: "Esterno Senza Scadenza" }), {
          email: `extnodate-${suffix}@t.local`,
          password: "una-password-robusta",
          role: "EXTERNAL",
          companyIds: [duit.id],
          accessExpiresAt: null,
        }),
      ).rejects.toThrow(/scadenza/);
    });

    it("email già in uso nel tenant: rifiutata prima di creare nulla", async () => {
      await expect(
        createCollaboratorWithAccess(asCeo(), partyBase({ name: "Email Duplicata" }), {
          email: ceo.email,
          password: "una-password-robusta",
          role: "CREATIVE",
          companyIds: [duit.id],
          accessExpiresAt: null,
        }),
      ).rejects.toThrow(/Email già in uso/);
    });

    it("P.IVA già di un'altra anagrafica con ruolo diverso: propone il conflitto, non crea un secondo account", async () => {
      await prisma.party.create({
        data: { tenantId, kinds: ["CLIENTE"], name: "Già Censito", vatNumber: "18051641001" },
      });

      await expect(
        createCollaboratorWithAccess(
          asCeo(),
          partyBase({ name: "Già Censito Bis", vatNumber: "18051641001", kinds: ["FORNITORE"] }),
          {
            email: `giacensito-${suffix}@t.local`,
            password: "una-password-robusta",
            role: "CREATIVE",
            companyIds: [duit.id],
            accessExpiresAt: null,
          },
        ),
      ).rejects.toThrow(PartyConflictError);
      expect(await prisma.user.count({ where: { email: `giacensito-${suffix}@t.local` } })).toBe(0);
    });
  });
});
