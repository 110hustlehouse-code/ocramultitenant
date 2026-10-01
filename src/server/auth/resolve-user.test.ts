import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company, type Tenant } from "@/generated/prisma/client";
import { MAX_FAILED_ATTEMPTS } from "./password";
import { recordFailedLogin, recordSuccessfulLogin, resolveLoginUser } from "./resolve-user";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("login: risoluzione utente e lockout", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenant: Tenant;
  let company: Company;

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { slug: `auth-${suffix}`, name: "Auth" } });
    company = await prisma.company.create({
      data: { tenantId: tenant.id, slug: "fulcro", name: "Fulcro", colorLight: "#000000", colorDark: "#FFFFFF" },
    });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it("nessun accesso valido (nessuna società): non risolve l'utente", async () => {
    const user = await prisma.user.create({ data: { tenantId: tenant.id, email: `orfano-${suffix}@t.local`, name: "Orfano" } });
    expect(await resolveLoginUser(user.email, null)).toBeNull();
  });

  it("CEO con una società attiva: risolve", async () => {
    const user = await prisma.user.create({ data: { tenantId: tenant.id, email: `ceo-${suffix}@t.local`, name: "Ceo" } });
    await prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, companyId: company.id, role: "CEO" } });
    const resolved = await resolveLoginUser(user.email, null);
    expect(resolved?.id).toBe(user.id);
  });

  it("Esterno senza scadenza: non entra; con scadenza passata: non entra; con scadenza futura: entra", async () => {
    const user = await prisma.user.create({ data: { tenantId: tenant.id, email: `est-${suffix}@t.local`, name: "Esterno" } });
    await prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, companyId: company.id, role: "EXTERNAL" } });
    expect(await resolveLoginUser(user.email, null)).toBeNull();

    await prisma.user.update({ where: { id: user.id }, data: { accessExpiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveLoginUser(user.email, null)).toBeNull();

    await prisma.user.update({ where: { id: user.id }, data: { accessExpiresAt: new Date(Date.now() + 1000 * 60 * 60) } });
    expect((await resolveLoginUser(user.email, null))?.id).toBe(user.id);
  });

  it("lockout: dopo troppi tentativi falliti blocca e azzera il contatore; un successo pulisce tutto", async () => {
    const user = await prisma.user.create({ data: { tenantId: tenant.id, email: `lock-${suffix}@t.local`, name: "Lock" } });

    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) await recordFailedLogin(user.id);
    let fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(fresh.failedLoginAttempts).toBe(MAX_FAILED_ATTEMPTS - 1);
    expect(fresh.lockedUntil).toBeNull();

    await recordFailedLogin(user.id);
    fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(fresh.failedLoginAttempts).toBe(0);
    expect(fresh.lockedUntil).not.toBeNull();
    expect(fresh.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    await recordSuccessfulLogin(user.id);
    fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(fresh.failedLoginAttempts).toBe(0);
    expect(fresh.lockedUntil).toBeNull();
  });
});
