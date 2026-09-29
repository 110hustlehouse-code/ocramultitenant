/**
 * Dati iniziali — idempotente: si può rilanciare senza duplicare nulla.
 * Primo tenant: il gruppo di Daniele Masini (Fulcro Lucem, Duit, St'Art Factory).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Role } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL mancante");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "masini" },
    update: {},
    create: {
      slug: "masini",
      name: "Gruppo Masini",
      domain: "ocra.fulcrolucem.it",
      modules: ["PROGETTI", "VERBALI", "RICHIAMO", "DOCUMENTI", "MARGINE", "PREVENTIVI"],
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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
