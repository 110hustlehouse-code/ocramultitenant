/**
 * Crea il primo utente CEO di produzione, con ruolo CEO su tutte le società del tenant
 * "masini". Nessuna password: l'accesso è via Google (Workspace del gruppo), come per
 * gli altri utenti interni — vedi /impostazioni/utenti.
 *
 * Uso: npx tsx scripts/create-ceo.ts <email> "<nome e cognome>"
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL mancante");

const [, , emailArg, nameArg] = process.argv;
if (!emailArg || !nameArg) {
  console.error('Uso: npx tsx scripts/create-ceo.ts <email> "<nome e cognome>"');
  process.exit(1);
}
const email = emailArg.trim().toLowerCase();
const name = nameArg.trim();

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "masini" } });
  const companies = await prisma.company.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true } });
  if (companies.length === 0) throw new Error('Nessuna società nel tenant "masini": lancia prima prisma/seed-production.ts');

  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email } },
    update: { name, active: true },
    create: { tenantId: tenant.id, email, name },
  });
  for (const company of companies) {
    await prisma.membership.upsert({
      where: { userId_companyId: { userId: user.id, companyId: company.id } },
      update: { role: "CEO" },
      create: { tenantId: tenant.id, userId: user.id, companyId: company.id, role: "CEO" },
    });
  }

  console.log(`✓ CEO creato: ${name} <${email}>, ruolo CEO su ${companies.map((c) => c.name).join(", ")}.`);
  console.log("  Login via Google con questa stessa email (AUTH_GOOGLE_ID/SECRET devono essere configurati).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
