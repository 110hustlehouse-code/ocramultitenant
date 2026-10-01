import "server-only";
import bcrypt from "bcryptjs";

/**
 * Login con password (accanto a Google OAuth). bcryptjs: pura JS, nessun modulo nativo —
 * niente rischi di build su Vercel (già capitato con altre librerie).
 */
const COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export const MIN_PASSWORD_LENGTH = 10;

/** Oltre questi tentativi falliti consecutivi, l'account si blocca per `LOCK_DURATION_MS`. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

export function isLockedOut(user: { lockedUntil: Date | null }, now: Date = new Date()): boolean {
  return user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();
}
