import "server-only";
import { prisma } from "@/server/db/client";
import { hasValidAccess } from "@/server/auth/permissions";
import { LOCK_DURATION_MS, MAX_FAILED_ATTEMPTS } from "@/server/auth/password";

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
    include: {
      tenant: { select: { id: true, domain: true } },
      memberships: { where: { company: { active: true } }, select: { role: true } },
    },
  });
  const allowed = candidates.filter((u) => hasValidAccess({ ...u, roles: u.memberships.map((m) => m.role) }));
  if (allowed.length === 0) return null;
  if (allowed.length === 1) return allowed[0];

  const hostname = host?.split(":")[0]?.toLowerCase() ?? null;
  return allowed.find((u) => hostname !== null && u.tenant.domain === hostname) ?? null;
}

/**
 * Login a password sbagliata: incrementa il contatore; oltre la soglia blocca l'account per
 * `LOCK_DURATION_MS` e azzera il contatore (un nuovo giro di tentativi parte da zero al termine
 * del blocco). Conservativo per scelta: niente store condiviso in più (Redis ecc.) da gestire —
 * il contatore vive sul record `User`, già l'unico store condiviso fra le istanze serverless.
 */
export async function recordFailedLogin(userId: string): Promise<void> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });
  if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) },
    });
  }
}

export async function recordSuccessfulLogin(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { failedLoginAttempts: 0, lockedUntil: null } });
}
