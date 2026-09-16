import type { Role } from "@/generated/prisma/enums";

/**
 * Ruolo = cosa puoi fare. La società NON sta qui: si sceglie in UI.
 * Aggiungi permessi quando nasce un modulo, mai controlli sul ruolo sparsi nel codice.
 */
export const PERMISSIONS = [
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
    "projects:read",
    "projects:write",
    "tasks:read:all",
    "meetings:read",
    "meetings:write",
    "reminders:read",
    "documents:read",
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
  role: Role;
  active: boolean;
  accessExpiresAt: Date | null;
};

/** Un utente può entrare? Gli esterni devono SEMPRE avere una scadenza. */
export function hasValidAccess(user: AccessSubject, now: Date = new Date()): boolean {
  if (!user.active) return false;
  if (user.role === "EXTERNAL" && !user.accessExpiresAt) return false;
  if (user.accessExpiresAt && user.accessExpiresAt.getTime() <= now.getTime()) return false;
  return true;
}
