import type { Role } from "@/generated/prisma/enums";

/**
 * Ruolo = cosa puoi fare in una società (il ruolo sta su Membership, non sull'utente).
 * Aggiungi permessi quando nasce un modulo, mai controlli sul ruolo sparsi nel codice.
 */
export const PERMISSIONS = [
  "registry:read",
  "registry:write",
  "projects:read",
  "projects:write",
  "tasks:read:all",
  "meetings:read",
  "meetings:write",
  "reminders:read",
  "documents:read",
  "finance:read",
  "quotes:write",
  "company:consolidated",
  "hardblock:manage",
  "settings:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  CEO: PERMISSIONS,
  PROJECT_MANAGER: [
    "registry:read",
    "registry:write",
    "projects:read",
    "projects:write",
    "tasks:read:all",
    "meetings:read",
    "meetings:write",
    "reminders:read",
    "documents:read",
    // Decisione 16 set: il PM può bloccare un account fino alla consegna.
    "hardblock:manage",
  ],
  CREATIVE: ["projects:read", "reminders:read", "documents:read"],
  EXTERNAL: ["projects:read", "documents:read"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  CEO: "CEO",
  PROJECT_MANAGER: "Project manager",
  CREATIVE: "Creativo",
  EXTERNAL: "Esterno",
};

type AccessSubject = {
  active: boolean;
  accessExpiresAt: Date | null;
  /** Ruoli dell'utente nelle società a cui ha accesso (uno per Membership). */
  roles: readonly Role[];
};

/**
 * Un utente può entrare?
 * • serve almeno una società accessibile
 * • chi è solo esterno deve SEMPRE avere una scadenza
 */
export function hasValidAccess(user: AccessSubject, now: Date = new Date()): boolean {
  if (!user.active) return false;
  if (user.roles.length === 0) return false;
  if (user.roles.every((r) => r === "EXTERNAL") && !user.accessExpiresAt) return false;
  if (user.accessExpiresAt && user.accessExpiresAt.getTime() <= now.getTime()) return false;
  return true;
}
