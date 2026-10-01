import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company, type User } from "@/generated/prisma/client";
import { testContext } from "@/test/context";
import { listMembers, revokeMember, upsertMember, UserError } from "./service";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("gestione utenti", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenantId: string;
  let duit: Company, fulcro: Company;
  let ceoDuit: User, ceoBoth: User, pm: User;

  const asCeoDuit = () => testContext(prisma, tenantId, ceoDuit.id, [[duit, "CEO"]]);
  const asCeoBoth = () => testContext(prisma, tenantId, ceoBoth.id, [[duit, "CEO"], [fulcro, "CEO"]]);
  const asPm = () => testContext(prisma, tenantId, pm.id, [[duit, "PROJECT_MANAGER"]]);

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { slug: `usr-${suffix}`, name: "Utenti" } })).id;
    const co = (slug: string) => prisma.company.create({ data: { tenantId, slug, name: slug, colorLight: "#000000", colorDark: "#FFFFFF" } });
    duit = await co("duit");
    fulcro = await co("fulcro");
    ceoDuit = await prisma.user.create({ data: { tenantId, email: `ceo-duit-${suffix}@t.local`, name: "Daniele" } });
    ceoBoth = await prisma.user.create({ data: { tenantId, email: `ceo-both-${suffix}@t.local`, name: "Erika" } });
    pm = await prisma.user.create({ data: { tenantId, email: `pm-${suffix}@t.local`, name: "Giammarco" } });
    await prisma.membership.create({ data: { tenantId, userId: ceoDuit.id, companyId: duit.id, role: "CEO" } });
    await prisma.membership.create({ data: { tenantId, userId: ceoBoth.id, companyId: duit.id, role: "CEO" } });
    await prisma.membership.create({ data: { tenantId, userId: ceoBoth.id, companyId: fulcro.id, role: "CEO" } });
    await prisma.membership.create({ data: { tenantId, userId: pm.id, companyId: duit.id, role: "PROJECT_MANAGER" } });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("solo chi gestisce le impostazioni della società invita o modifica membri", async () => {
    await expect(
      upsertMember(asPm(), { email: "x@t.local", name: "X", role: "CREATIVE", companyId: duit.id, accessExpiresAt: null }),
    ).rejects.toThrow(UserError);
    await expect(
      upsertMember(asCeoDuit(), { email: "y@t.local", name: "Y", role: "CREATIVE", companyId: fulcro.id, accessExpiresAt: null }),
    ).rejects.toThrow(UserError);
  });

  it("nuovo utente: nome obbligatorio, poi crea User + Membership", async () => {
    const email = `nuovo-${suffix}@t.local`;
    await expect(
      upsertMember(asCeoDuit(), { email, name: null, role: "CREATIVE", companyId: duit.id, accessExpiresAt: null }),
    ).rejects.toThrow(UserError);

    await upsertMember(asCeoDuit(), { email, name: "Sara Conti", role: "CREATIVE", companyId: duit.id, accessExpiresAt: null });
    const user = await prisma.user.findUniqueOrThrow({ where: { tenantId_email: { tenantId, email } } });
    const membership = await prisma.membership.findUniqueOrThrow({ where: { userId_companyId: { userId: user.id, companyId: duit.id } } });
    expect(membership.role).toBe("CREATIVE");
  });

  it("utente esistente: aggiorna solo il ruolo nella società scelta, non serve rimandare il nome", async () => {
    const email = `esistente-${suffix}@t.local`;
    await upsertMember(asCeoDuit(), { email, name: "Mario Rossi", role: "CREATIVE", companyId: duit.id, accessExpiresAt: null });
    await upsertMember(asCeoDuit(), { email, name: null, role: "PROJECT_MANAGER", companyId: duit.id, accessExpiresAt: null });

    const user = await prisma.user.findUniqueOrThrow({ where: { tenantId_email: { tenantId, email } } });
    expect(user.name).toBe("Mario Rossi");
    const membership = await prisma.membership.findUniqueOrThrow({ where: { userId_companyId: { userId: user.id, companyId: duit.id } } });
    expect(membership.role).toBe("PROJECT_MANAGER");
  });

  it("Esterno richiede scadenza; ruolo diverso in un'altra società non la tocca", async () => {
    const email = `esterno-${suffix}@t.local`;
    await expect(
      upsertMember(asCeoBoth(), { email, name: "Fornitore", role: "EXTERNAL", companyId: duit.id, accessExpiresAt: null }),
    ).rejects.toThrow(UserError);

    const expiry = new Date(Date.now() + 30 * 86_400_000);
    await upsertMember(asCeoBoth(), { email, name: "Fornitore", role: "EXTERNAL", companyId: duit.id, accessExpiresAt: expiry });
    let user = await prisma.user.findUniqueOrThrow({ where: { tenantId_email: { tenantId, email } } });
    expect(user.accessExpiresAt?.getTime()).toBe(expiry.getTime());

    // stessa persona diventa Creativo anche a Fulcro: non è più "solo Esterno", ma la scadenza
    // resta finché ha ancora una Membership Esterno a Duit.
    await upsertMember(asCeoBoth(), { email, name: null, role: "CREATIVE", companyId: fulcro.id, accessExpiresAt: null });
    user = await prisma.user.findUniqueOrThrow({ where: { tenantId_email: { tenantId, email } } });
    expect(user.accessExpiresAt).not.toBeNull();

    // promossa a Creativo anche a Duit: nessuna Membership Esterno rimasta → scadenza azzerata.
    await upsertMember(asCeoBoth(), { email, name: null, role: "CREATIVE", companyId: duit.id, accessExpiresAt: null });
    user = await prisma.user.findUniqueOrThrow({ where: { tenantId_email: { tenantId, email } } });
    expect(user.accessExpiresAt).toBeNull();
  });

  it("revoca cancella solo la Membership, non l'utente; non ci si può chiudere fuori da soli", async () => {
    const email = `revoca-${suffix}@t.local`;
    await upsertMember(asCeoDuit(), { email, name: "Temp", role: "CREATIVE", companyId: duit.id, accessExpiresAt: null });
    const user = await prisma.user.findUniqueOrThrow({ where: { tenantId_email: { tenantId, email } } });
    const membership = await prisma.membership.findUniqueOrThrow({ where: { userId_companyId: { userId: user.id, companyId: duit.id } } });

    await revokeMember(asCeoDuit(), membership.id);
    expect(await prisma.membership.findUnique({ where: { id: membership.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();

    const own = await prisma.membership.findUniqueOrThrow({ where: { userId_companyId: { userId: ceoDuit.id, companyId: duit.id } } });
    await expect(revokeMember(asCeoDuit(), own.id)).rejects.toThrow(UserError);
  });

  it("listMembers mostra solo le società in scope del viewer", async () => {
    const members = await listMembers(asCeoDuit());
    expect(members.every((m) => m.company.id === duit.id)).toBe(true);
    expect(members.some((m) => m.company.id === fulcro.id)).toBe(false);

    const bothMembers = await listMembers(asCeoBoth());
    expect(bothMembers.some((m) => m.company.id === fulcro.id)).toBe(true);
  });
});
