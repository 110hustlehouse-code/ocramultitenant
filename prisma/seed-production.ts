/**
 * Seed di produzione: SOLO tenant, società e listino reali del gruppo Masini
 * (da seedMasiniCore in prisma/seed.ts). Nessun utente, nessun tenant demo,
 * nessun dato di test — mai un utente @ocra.local in produzione.
 *
 * Dopo questo seed, in questo ordine:
 *  1. `npx tsx scripts/import-anagrafiche-reali.ts` (richiede i file reali in
 *     docs/riferimenti/, solo in locale, mai committati) per clienti e fornitori
 *  2. `npx tsx scripts/create-ceo.ts <email> <nome>` per il primo utente CEO
 *     (login poi via Google, nessuna password da gestire)
 *
 * Uso: npx tsx prisma/seed-production.ts
 */
import "dotenv/config";
import { prisma, seedMasiniCore } from "./seed";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
    throw new Error(
      "NODE_ENV=production: per sicurezza serve ALLOW_PROD_SEED=true esplicito per lanciare un seed contro produzione.",
    );
  }
  const { tenant, companiesCount } = await seedMasiniCore();
  console.log(`✓ Seed di produzione completato: tenant "${tenant.name}", ${companiesCount} società, 0 utenti.`);
  console.log("  Prossimi passi: scripts/import-anagrafiche-reali.ts, poi scripts/create-ceo.ts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
