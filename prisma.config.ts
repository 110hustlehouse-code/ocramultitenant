import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Connessione DIRETTA (non il pooler): le migrazioni fanno DDL e lock di avviso che un
    // pooler in transaction mode (Supabase Supavisor) non supporta. Il runtime dell'app usa
    // invece DATABASE_URL (il pooler) direttamente via @prisma/adapter-pg — vedi
    // src/server/db/client.ts — indipendente da questo file. In locale e in CI, senza pooler,
    // DIRECT_URL e DATABASE_URL sono la stessa connessione (vedi .env.example).
    // `prisma generate` non ha bisogno del DB: il fallback evita errori in CI.
    url: process.env.DIRECT_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
});
