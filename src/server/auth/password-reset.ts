import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { env } from "@/env";
import { hashPassword } from "@/server/auth/password";
import { resolveLoginUser } from "@/server/auth/resolve-user";
import { sendEmail, type EmailSender } from "@/server/notify/email";
import { prisma } from "@/server/db/client";

const RESET_TOKEN_PREFIX = "ocra_pwd_";
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Richiesta di reset: se l'email corrisponde a un utente con login a password abilitato,
 * genera un token (solo l'hash va nel DB) e manda il link via email. La risposta a schermo è
 * sempre la stessa in ogni caso — altrimenti si rivelerebbe se un indirizzo è registrato.
 */
export async function requestPasswordReset(rawEmail: string, host: string | null, send: EmailSender = sendEmail): Promise<void> {
  const user = await resolveLoginUser(rawEmail, host);
  if (!user || !user.passwordHash) return;

  const token = RESET_TOKEN_PREFIX + randomBytes(24).toString("base64url");
  await prisma.passwordResetToken.create({
    data: { tenantId: user.tenantId, userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const link = `${env().APP_URL}/password/reimposta/${token}`;
  await send({
    to: user.email,
    subject: "Reimposta la tua password OCRA",
    text: `Per reimpostare la password apri questo link (valido un'ora): ${link}\n\nSe non sei stato tu, ignora questa email.`,
  });
}

export class PasswordResetError extends Error {}

/** Consuma il token (monouso) e imposta la nuova password. */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw new PasswordResetError("Link scaduto o già usato. Richiedine uno nuovo.");
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Gli altri token pendenti dello stesso utente non devono restare utilizzabili.
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null, id: { not: record.id } },
      data: { usedAt: new Date() },
    }),
  ]);
}
