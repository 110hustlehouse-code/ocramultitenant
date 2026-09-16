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
      update: { colorLight: c.colorLight, colorDark: c.colorDark, logoUrl: c.logoUrl, logoBg: c.logoBg },
      create: { ...c, tenantId: tenant.id },
    });
  }

  const users: Array<{ email: string; name: string; role: Role; accessExpiresAt?: Date }> = [
    { email: "daniele@ocra.local", name: "Daniele Masini", role: "CEO" },
    { email: "erika@ocra.local", name: "Erika Nardini", role: "PROJECT_MANAGER" },
    { email: "creativo@ocra.local", name: "Videomaker Demo", role: "CREATIVE" },
    {
      email: "esterno@ocra.local",
      name: "Fornitore Esterno",
      role: "EXTERNAL",
      accessExpiresAt: new Date(Date.now() + 30 * DAY),
    },
  ];

  const owner = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  if (owner) users.push({ email: owner, name: "Carlo", role: "CEO" });

  for (const u of users) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: { role: u.role, accessExpiresAt: u.accessExpiresAt ?? null, active: true },
      create: { ...u, tenantId: tenant.id },
    });
  }

  console.log(`✓ Seed completato: tenant "${tenant.name}", ${companies.length} società, ${users.length} utenti.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
