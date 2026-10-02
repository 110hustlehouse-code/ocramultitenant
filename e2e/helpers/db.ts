import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Fixture dei test E2E: creare/eliminare tenant, società e utenti di prova prima e dopo
 * ogni scenario. Il lavoro vero è in db-cli.mts (sottoprocesso tsx): vedi lì il perché.
 */
function run<T>(command: string, args: Record<string, unknown> = {}): T {
  const out = execFileSync(path.resolve("node_modules/.bin/tsx"), ["e2e/helpers/db-cli.mts", command, JSON.stringify(args)], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return JSON.parse(out.trim().split("\n").pop()!) as T;
}

export function createTestTenant(suffix: string) {
  return run<{ tenantId: string; companyId: string }>("create-tenant", { suffix });
}

export function createCeo(tenantId: string, companyId: string, suffix: string) {
  return run<{ userId: string; email: string }>("create-ceo", { tenantId, companyId, email: `ceo-${suffix}@e2e.local` });
}

export function createLoginUser(
  tenantId: string,
  companyId: string,
  opts: {
    email: string;
    password: string;
    role: "CEO" | "PROJECT_MANAGER" | "CREATIVE" | "EXTERNAL";
    accessExpiresAt?: Date | null;
    mustChangePassword?: boolean;
    active?: boolean;
  },
) {
  return run<{ userId: string; email: string }>("create-login-user", {
    tenantId,
    companyId,
    email: opts.email,
    password: opts.password,
    role: opts.role,
    accessExpiresAt: opts.accessExpiresAt ? opts.accessExpiresAt.toISOString() : null,
    mustChangePassword: opts.mustChangePassword ?? false,
    active: opts.active ?? true,
  });
}

export function createProjectWithMember(tenantId: string, companyId: string, name: string, userId: string) {
  return run<{ projectId: string }>("create-project-with-member", { tenantId, companyId, name, userId });
}

export function getUserLockState(userId: string) {
  return run<{ lockedUntil: string | null; active: boolean }>("get-user", { userId });
}

export function expireLock(userId: string) {
  return run<{ ok: true }>("expire-lock", { userId });
}

export function cleanupTenant(tenantId: string) {
  return run<{ ok: true }>("cleanup-tenant", { tenantId });
}
