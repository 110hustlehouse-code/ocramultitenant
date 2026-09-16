import "server-only";
import { prisma } from "@/server/db/client";
import { hasValidAccess } from "@/server/auth/permissions";

/**
 * Trova l'utente OCRA per un'email che sta facendo login.
 * La stessa email può esistere in più tenant (es. un freelance esterno):
 * in quel caso decide il dominio da cui arriva la richiesta.
 * Solo utenti già invitati possono entrare: nessuna registrazione libera.
 */
export async function resolveLoginUser(rawEmail: string, host: string | null) {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return null;

  const candidates = await prisma.user.findMany({
    where: { email },
    include: { tenant: { select: { id: true, domain: true } } },
  });
  const allowed = candidates.filter((u) => hasValidAccess(u));
  if (allowed.length === 0) return null;
  if (allowed.length === 1) return allowed[0];

  const hostname = host?.split(":")[0]?.toLowerCase() ?? null;
  return allowed.find((u) => hostname !== null && u.tenant.domain === hostname) ?? null;
}
