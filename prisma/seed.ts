/**
 * Dati iniziali — idempotente: si può rilanciare senza duplicare nulla.
 * Tenant 1: il gruppo di Daniele Masini (Fulcro Lucem, Duit, St'Art Factory).
 * Tenant 2: «Aurora», agenzia inventata per le demo di vendita (ocragency.shop).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type ModuleKey, type Role } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL mancante");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const DAY = 24 * 60 * 60 * 1000;

const MODULES: ModuleKey[] = ["ANAGRAFICHE", "PROGETTI", "VERBALI", "RICHIAMO", "DOCUMENTI", "MARGINE", "PREVENTIVI"];

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "masini" },
    update: { modules: MODULES },
    create: {
      slug: "masini",
      name: "Gruppo Masini",
      domain: "ocra.fulcrolucem.it",
      modules: MODULES,
    },
  });

  // Colori: *Light per tema chiaro (scuriti per contrasto), *Dark per tema scuro.
  const companies = [
    {
      slug: "fulcro-lucem",
      name: "Fulcro Lucem",
      legalName: "Fulcro Lucem S.r.l.",
      vatNumber: "16633211004",
      pec: "fulcrolucem@pec.it",
      sdiCode: "M5UXCR1",
      reaNumber: "RM-1666755",
      legalAddress: "Via Antonio Bennicelli 50, 00151 Roma (RM)",
      legalRepresentative: "Chiara Giovagnorio",
      poPrefix: "FL",
      colorLight: "#8F0AFF",
      colorDark: "#B066FF",
      logoUrl: "/brands/fulcro-lucem.png",
      logoBg: "#FFFFFF",
      sortOrder: 1,
    },
    {
      slug: "duit",
      name: "Duit",
      legalName: "Duit S.r.l.",
      vatNumber: "18051641001",
      pec: "duitsrl@pec.it",
      sdiCode: "M5UXCR1",
      reaNumber: "RM-1758535",
      legalAddress: "Via Antonio Bennicelli 50, 00151 Roma (RM)",
      legalRepresentative: "Daniele Masini",
      poPrefix: "DT",
      colorLight: "#C24A00",
      colorDark: "#FF6304",
      logoUrl: "/brands/duit.png",
      logoBg: "#FF6301",
      sortOrder: 2,
    },
    {
      slug: "start-factory",
      name: "St'Art Factory",
      legalName: "St'Art Factory",
      colorLight: "#1195BC",
      colorDark: "#3ED7FB",
      logoUrl: "/brands/start-factory.png",
      logoBg: "#090909",
      sortOrder: 3,
    },
  ];

  for (const c of companies) {
    await prisma.company.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: c.slug } },
      update: c,
      create: { ...c, tenantId: tenant.id },
    });
  }
  const bySlug = new Map(
    (await prisma.company.findMany({ where: { tenantId: tenant.id } })).map((c) => [c.slug, c.id]),
  );

  // Ruoli per società (decisioni del 23 set). Email @ocra.local = accesso di sviluppo;
  // le email vere si aggiungono all'onboarding.
  const ALL = ["fulcro-lucem", "duit", "start-factory"] as const;
  type Seat = { email: string; name: string; access: Partial<Record<(typeof ALL)[number], Role>>; accessExpiresAt?: Date };
  const everywhere = (role: Role) => Object.fromEntries(ALL.map((slug) => [slug, role]));

  const users: Seat[] = [
    { email: "daniele@ocra.local", name: "Daniele Masini", access: everywhere("CEO") },
    // Erika è "CEOO" di Fulcro e St'Art (e PM di Fulcro): da CEO vede anche i numeri. Duit no.
    { email: "erika@ocra.local", name: "Erika Nardini", access: { "fulcro-lucem": "CEO", "start-factory": "CEO" } },
    { email: "miele@ocra.local", name: "Miele", access: { "start-factory": "PROJECT_MANAGER" } },
    { email: "giammarco@ocra.local", name: "Giammarco", access: { duit: "PROJECT_MANAGER" } },
    { email: "creativo@ocra.local", name: "Videomaker Demo", access: everywhere("CREATIVE") },
    {
      email: "esterno@ocra.local",
      name: "Fornitore Esterno",
      access: { duit: "EXTERNAL" },
      accessExpiresAt: new Date(Date.now() + 30 * DAY),
    },
  ];

  const owner = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  if (owner) users.push({ email: owner, name: "Carlo", access: everywhere("CEO") });

  for (const { access, ...u } of users) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: { name: u.name, accessExpiresAt: u.accessExpiresAt ?? null, active: true },
      create: { ...u, tenantId: tenant.id },
    });
    // Le società del seed sono la verità: via gli accessi non previsti, poi upsert.
    await prisma.membership.deleteMany({
      where: { userId: user.id, company: { slug: { notIn: Object.keys(access) } } },
    });
    for (const [slug, role] of Object.entries(access)) {
      const companyId = bySlug.get(slug);
      if (!companyId) throw new Error(`Società "${slug}" mancante nel seed`);
      await prisma.membership.upsert({
        where: { userId_companyId: { userId: user.id, companyId } },
        update: { role },
        create: { tenantId: tenant.id, userId: user.id, companyId, role },
      });
    }
  }

  console.log(`✓ Seed completato: tenant "${tenant.name}", ${companies.length} società, ${users.length} utenti.`);
}

/**
 * Demo di vendita: stesso prodotto, dati inventati. Nomi e referenti sono di fantasia;
 * le P.IVA restano vuote per non mostrare per sbaglio numeri di aziende reali.
 */
async function seedDemo() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: { modules: MODULES },
    create: { slug: "demo", name: "Aurora (demo)", domain: "ocragency.shop", modules: MODULES },
  });

  const companies = [
    { slug: "aurora-studio", name: "Aurora Studio", legalName: "Aurora Studio S.r.l.", poPrefix: "AS", colorLight: "#6D28D9", colorDark: "#A78BFA", sortOrder: 1 },
    { slug: "aurora-produzioni", name: "Aurora Produzioni", legalName: "Aurora Produzioni S.r.l.", poPrefix: "AP", colorLight: "#C2410C", colorDark: "#FB923C", sortOrder: 2 },
    { slug: "aurora-music", name: "Aurora Music", legalName: "Aurora Music S.r.l.", poPrefix: "AM", colorLight: "#0E7490", colorDark: "#22D3EE", sortOrder: 3 },
  ];
  const ids = new Map<string, string>();
  for (const c of companies) {
    const row = await prisma.company.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: c.slug } },
      update: c,
      create: { ...c, tenantId: tenant.id },
    });
    ids.set(c.poPrefix, row.id);
  }

  const users: Array<{ email: string; name: string; role: Role }> = [
    { email: "ceo@demo.ocra.local", name: "Giulia Ferri", role: "CEO" },
    { email: "pm@demo.ocra.local", name: "Luca Moretti", role: "PROJECT_MANAGER" },
    { email: "creativo@demo.ocra.local", name: "Sara Conti", role: "CREATIVE" },
  ];
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: { name: u.name, active: true },
      create: { tenantId: tenant.id, email: u.email, name: u.name },
    });
    for (const companyId of ids.values()) {
      await prisma.membership.upsert({
        where: { userId_companyId: { userId: user.id, companyId } },
        update: { role: u.role },
        create: { tenantId: tenant.id, userId: user.id, companyId, role: u.role },
      });
    }
  }

  type DemoParty = { name: string; contact: string; email: string; cats: string[]; at: string[] };
  const clients: DemoParty[] = [
    { name: "Fondazione Teatro Nuovo", contact: "Elena Galli", email: "eventi@teatronuovo.example", cats: ["Cultura", "Eventi"], at: ["AS", "AP"] },
    { name: "Birrificio Monteverde", contact: "Paolo Riva", email: "marketing@birrificio.example", cats: ["Food & beverage"], at: ["AS"] },
    { name: "Comune di Valleverde", contact: "Ufficio Cultura", email: "cultura@valleverde.example", cats: ["Pubblica amministrazione"], at: ["AP"] },
    { name: "Nora Vale", contact: "Nora Vale", email: "nora@noravale.example", cats: ["Artista"], at: ["AM"] },
    { name: "Atelier Sartori", contact: "Marta Sartori", email: "marta@ateliersartori.example", cats: ["Moda"], at: ["AS"] },
    { name: "Festival Luci d'Estate", contact: "Davide Bassi", email: "info@lucidestate.example", cats: ["Eventi", "Musica"], at: ["AP", "AM"] },
  ];
  const suppliers: DemoParty[] = [
    { name: "Service Audio Luci Roma", contact: "Franco Leoni", email: "preventivi@servicealr.example", cats: ["Service", "Noleggi"], at: ["AP"] },
    { name: "Tipografia Rapida", contact: "Silvia Neri", email: "ordini@tiporapida.example", cats: ["Stampa"], at: ["AS", "AP"] },
    { name: "Marco Villa", contact: "Marco Villa", email: "marco@villavideo.example", cats: ["Videomaker"], at: ["AP"] },
    { name: "Studio Grafico Linea", contact: "Irene Fabbri", email: "irene@linea.example", cats: ["Grafica"], at: ["AS"] },
    { name: "Catering Tavola Viva", contact: "Rosa Greco", email: "eventi@tavolaviva.example", cats: ["Catering"], at: ["AP"] },
  ];
  for (const [kind, list] of [["CLIENTE", clients], ["FORNITORE", suppliers]] as const) {
    for (const p of list) {
      const existing = await prisma.party.findFirst({ where: { tenantId: tenant.id, kind, name: p.name } });
      const data = { name: p.name, contactName: p.contact, email: p.email, categories: p.cats };
      const party = existing
        ? await prisma.party.update({ where: { id: existing.id }, data })
        : await prisma.party.create({ data: { ...data, kind, tenantId: tenant.id } });
      await prisma.partyCompany.createMany({
        data: p.at.map((prefix) => ({ tenantId: tenant.id, partyId: party.id, companyId: ids.get(prefix)! })),
        skipDuplicates: true,
      });
    }
  }
  console.log(`✓ Demo: tenant "${tenant.name}", ${clients.length} clienti, ${suppliers.length} fornitori.`);
}

main()
  .then(seedDemo)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
