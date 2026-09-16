import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/env";

/**
 * Client Prisma di base, SENZA filtro tenant.
 * Usalo solo per: autenticazione, risoluzione tenant, health check.
 * Per i dati di dominio usa `ctx.db` da getContext() (vedi tenant.ts).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: env().DATABASE_URL }),
    log: env().NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
