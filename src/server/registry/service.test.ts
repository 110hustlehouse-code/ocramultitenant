import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company } from "@/generated/prisma/client";
import type { PartyKind, Role } from "@/generated/prisma/enums";
import type { AppContext } from "@/server/context";
import { tenantExtension } from "@/server/db/tenant";
import { canInView, resolveCompanyView, type CompanyAccess } from "@/server/company/selection";
import { parsePartiesCsv } from "./csv";
import {
  addPartyKinds,
  checkPartyConflict,
  createParty,
  deleteParty,
  importParties,
  listParties,
  PartyConflictError,
  RegistryError,
  updateParty,
} from "./service";

const adminNulls = { availabilityNote: null, paymentIban: null, paymentHolder: null, fiscalDocumentType: null, paymentTerms: null };

// Integrazione: gira solo se c'è un database (Codespaces, CI).
const url = process.env.DATABASE_URL;
describe.skipIf(!url)("anagrafiche sul database", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenantId: string;
  let otherTenantId: string;
  let fulcro: Company;
  let duit: Company;

  /** Contesto minimo, come lo costruisce getContext(). */
  function ctxFor(roles: Array<[Company, Role]>, view?: string): AppContext {
    const access: CompanyAccess[] = roles.map(([company, role]) => ({ company, role }));
    const v = resolveCompanyView(access, view)!;
    return {
      user: { id: "u", name: "Test", email: "t@test.local" },
      tenant: { id: tenantId } as AppContext["tenant"],
      access,
      companies: access.map((a) => a.company),
      view: v,
      role: v.kind === "company" ? v.role : null,
      canConsolidate: false,
      can: (p) => canInView(v, access, p),
      db: prisma.$extends(tenantExtension(tenantId)),
    } as AppContext;
  }

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { slug: `reg-${suffix}`, name: "Reg" } })).id;
    otherTenantId = (await prisma.tenant.create({ data: { slug: `reg-o-${suffix}`, name: "Altro" } })).id;
    const mk = (slug: string, name: string, poPrefix: string) =>
      prisma.company.create({ data: { tenantId, slug, name, poPrefix, colorLight: "#000000", colorDark: "#FFFFFF" } });
    fulcro = await mk("fulcro", "Fulcro Lucem", "FL");
    duit = await mk("duit", "Duit", "DT");
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  it("import: crea, poi al secondo giro aggiorna senza duplicare né cancellare dati", async () => {
    const ceo = ctxFor([[fulcro, "CEO"], [duit, "CEO"]], "fulcro");
    const first = parsePartiesCsv(
      "Ragione sociale;P.IVA;Email;Società\nZetema;16633211004;a@z.it;FL\nMario Rossi;;;FL",
      "CLIENTE",
      [fulcro, duit],
      [fulcro.id],
    );
    expect(await importParties(ceo, "CLIENTE", first.rows)).toEqual({ created: 2, updated: 0 });

    const second = parsePartiesCsv(
      "Ragione sociale;P.IVA;Referente;Società\nZetema S.p.A.;IT16633211004;Anna;DT\nmario rossi;;Mario;",
      "CLIENTE",
      [fulcro, duit],
      [fulcro.id],
    );
    expect(await importParties(ceo, "CLIENTE", second.rows)).toEqual({ created: 0, updated: 2 });

    const z = await prisma.party.findFirstOrThrow({ where: { tenantId, vatNumber: "16633211004" }, include: { companies: true } });
    expect(z).toMatchObject({ name: "Zetema S.p.A.", email: "a@z.it", contactName: "Anna" });
    expect(z.companies.map((c) => c.companyId).sort()).toEqual([duit.id, fulcro.id].sort());
    expect(await prisma.party.count({ where: { tenantId } })).toBe(2);
  });

  it("ogni società vede solo le sue anagrafiche", async () => {
    const pmDuit = ctxFor([[duit, "PROJECT_MANAGER"]]);
    const names = (await listParties(pmDuit, "CLIENTE", "")).map((p) => p.name);
    expect(names).toEqual(["Zetema S.p.A."]);
  });

  it("un PM di Duit non può assegnare anagrafiche a Fulcro", async () => {
    const pmDuit = ctxFor([[duit, "PROJECT_MANAGER"]]);
    const base = { kinds: ["FORNITORE"] as PartyKind[], name: "Noleggi Srl", address: null, vatNumber: null, taxCode: null, pec: null, sdiCode: null, contactName: null, email: null, phone: null, categories: [], notes: null, ...adminNulls };
    await expect(createParty(pmDuit, { ...base, companyIds: [fulcro.id] })).rejects.toThrow(RegistryError);
    const created = await createParty(pmDuit, { ...base, companyIds: [duit.id] });
    expect(created.tenantId).toBe(tenantId);
  });

  it("P.IVA duplicata nello stesso ruolo: bloccata con messaggio chiaro", async () => {
    const ceo = ctxFor([[fulcro, "CEO"]]);
    const base = { kinds: ["CLIENTE"] as PartyKind[], name: "Doppione", address: null, vatNumber: "16633211004", taxCode: null, pec: null, sdiCode: null, contactName: null, email: null, phone: null, categories: [], notes: null, companyIds: [fulcro.id], ...adminNulls };
    await expect(createParty(ceo, base)).rejects.toThrow(/Esiste già/);
  });

  it("controllo anticipato: trova il conflitto anche a form incompleto (solo P.IVA, senza nome)", async () => {
    const ceo = ctxFor([[fulcro, "CEO"]]);
    // Chi scrive solo la P.IVA per vedere se l'anagrafica esiste già non ha ancora
    // compilato il nome: il conflitto deve comunque emergere, non restare nascosto
    // dietro "ragione sociale obbligatoria".
    const conflict = await checkPartyConflict(ceo, { vatNumber: "16633211004", taxCode: null }, ["FORNITORE"]);
    expect(conflict).toBeInstanceOf(PartyConflictError);
    expect(conflict?.missingKinds).toEqual(["FORNITORE"]);
    expect(conflict?.partyName).toBe("Zetema S.p.A.");
  });

  it("P.IVA duplicata in un ruolo diverso: propone di aggiungere il ruolo invece di duplicare", async () => {
    const ceo = ctxFor([[fulcro, "CEO"]]);
    const base = {
      kinds: ["FORNITORE"] as PartyKind[],
      name: "Zetema come fornitore",
      address: null,
      vatNumber: "16633211004", // stessa P.IVA di "Zetema S.p.A.", oggi solo CLIENTE
      taxCode: null,
      pec: null,
      sdiCode: null,
      contactName: null,
      email: null,
      phone: null,
      categories: [],
      notes: null,
      companyIds: [fulcro.id],
      ...adminNulls,
    };
    const err = await createParty(ceo, base).catch((e) => e);
    expect(err).toBeInstanceOf(PartyConflictError);
    expect((err as PartyConflictError).missingKinds).toEqual(["FORNITORE"]);
    const partyId = (err as PartyConflictError).partyId;

    await addPartyKinds(ceo, partyId, ["FORNITORE"]);
    const updated = await prisma.party.findUniqueOrThrow({ where: { id: partyId } });
    expect(updated.kinds.sort()).toEqual(["CLIENTE", "FORNITORE"]);
    // Non si è creata una seconda riga.
    expect(await prisma.party.count({ where: { tenantId, vatNumber: "16633211004" } })).toBe(1);
  });

  it("modifica: P.IVA duplicata in un ruolo diverso propone di aggiungere il ruolo (come in creazione)", async () => {
    const ceo = ctxFor([[fulcro, "CEO"]]);
    const base = { address: null, taxCode: null, pec: null, sdiCode: null, contactName: null, email: null, phone: null, categories: [] as string[], notes: null, companyIds: [fulcro.id], ...adminNulls };
    const supplier = await createParty(ceo, { ...base, kinds: ["FORNITORE"], name: "Service Provider", vatNumber: "18051641001" });
    const other = await createParty(ceo, { ...base, kinds: ["CLIENTE"], name: "Altro cliente", vatNumber: null });

    // Modifico "Altro cliente" per diventare anche fornitore con la P.IVA di "Service Provider":
    // stessa persona reale, non deve creare una seconda riga né un errore generico.
    const err = await updateParty(ceo, other.id, { ...base, kinds: ["CLIENTE", "FORNITORE"], name: "Altro cliente", vatNumber: "18051641001" }).catch((e) => e);
    expect(err).toBeInstanceOf(PartyConflictError);
    expect((err as PartyConflictError).partyId).toBe(supplier.id);
    expect((err as PartyConflictError).missingKinds).toEqual(["CLIENTE"]);
  });

  it("modifica ed eliminazione toccano solo le società dell'utente", async () => {
    const z = await prisma.party.findFirstOrThrow({ where: { tenantId, vatNumber: "16633211004" } });
    const pmDuit = ctxFor([[duit, "PROJECT_MANAGER"]]);
    const data = { kinds: ["CLIENTE"] as PartyKind[], name: "Zetema", address: null, vatNumber: "16633211004", taxCode: null, pec: null, sdiCode: null, contactName: null, email: null, phone: null, categories: [], notes: null, ...adminNulls };
    // Il PM di Duit toglie Duit: Fulcro resta collegata anche se non la vede.
    await expect(updateParty(pmDuit, z.id, { ...data, companyIds: [] as string[] })).resolves.toBeUndefined();
    const links = await prisma.partyCompany.findMany({ where: { partyId: z.id } });
    expect(links.map((l) => l.companyId)).toEqual([fulcro.id]);

    const ceoFulcro = ctxFor([[fulcro, "CEO"], [duit, "CEO"]]);
    await updateParty(ceoFulcro, z.id, { ...data, companyIds: [fulcro.id, duit.id] });
    expect(await deleteParty(pmDuit, z.id)).toBe("unlinked");
    expect(await prisma.party.findUnique({ where: { id: z.id } })).not.toBeNull();
    expect(await deleteParty(ceoFulcro, z.id)).toBe("deleted");
    expect(await prisma.party.findUnique({ where: { id: z.id } })).toBeNull();
  });

  it("il database rifiuta collegamenti fra tenant diversi", async () => {
    const party = await prisma.party.findFirstOrThrow({ where: { tenantId } });
    const foreign = await prisma.company.create({
      data: { tenantId: otherTenantId, slug: "x", name: "X", colorLight: "#000000", colorDark: "#FFFFFF" },
    });
    await expect(
      prisma.partyCompany.create({ data: { tenantId, partyId: party.id, companyId: foreign.id } }),
    ).rejects.toThrow(/tenant diversi/);
  });
});
