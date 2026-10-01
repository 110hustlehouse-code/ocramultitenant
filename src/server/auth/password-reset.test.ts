import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Tenant } from "@/generated/prisma/client";
import type { Email } from "@/server/notify/email";
import { hashPassword } from "./password";
import { PasswordResetError, requestPasswordReset, resetPassword } from "./password-reset";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("reset password", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenant: Tenant;

  /** Finto invio: non deve mai uscire una vera email durante i test. */
  function fakeSender() {
    const sent: Email[] = [];
    return { send: async (email: Email) => (sent.push(email), { delivered: true }), sent };
  }

  function tokenFromLink(text: string): string {
    const match = text.match(/\/password\/reimposta\/(\S+)/);
    if (!match) throw new Error("link non trovato nell'email");
    return match[1]!;
  }

  beforeAll(async () => {
    tenant = await prisma.tenant.create({ data: { slug: `reset-${suffix}`, name: "Reset" } });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  });

  it("utente con login a password: riceve il link, il token funziona una sola volta", async () => {
    const user = await prisma.user.create({
      data: { tenantId: tenant.id, email: `conpwd-${suffix}@t.local`, name: "Con Password", passwordHash: await hashPassword("vecchia-password") },
    });
    const company = await prisma.company.create({
      data: { tenantId: tenant.id, slug: `c-${suffix}`, name: "C", colorLight: "#000000", colorDark: "#FFFFFF" },
    });
    await prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, companyId: company.id, role: "CEO" } });

    const { send, sent } = fakeSender();
    await requestPasswordReset(user.email, null, send);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(user.email);

    const token = tokenFromLink(sent[0]!.text);
    await resetPassword(token, "password-nuova-1");
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.passwordHash).not.toBe(await hashPassword("vecchia-password"));
    expect(updated.mustChangePassword).toBe(false);

    // Stesso token una seconda volta: rifiutato.
    await expect(resetPassword(token, "password-nuova-2")).rejects.toThrow(PasswordResetError);
  });

  it("nessun login a password configurato (solo OAuth): nessuna email, nessun token", async () => {
    const user = await prisma.user.create({ data: { tenantId: tenant.id, email: `soloauth-${suffix}@t.local`, name: "Solo OAuth" } });
    const company = await prisma.company.create({
      data: { tenantId: tenant.id, slug: `c2-${suffix}`, name: "C2", colorLight: "#000000", colorDark: "#FFFFFF" },
    });
    await prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, companyId: company.id, role: "CEO" } });

    const { send, sent } = fakeSender();
    await requestPasswordReset(user.email, null, send);
    expect(sent).toHaveLength(0);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it("email non registrata: nessun errore, nessuna email (anti-enumerazione)", async () => {
    const { send, sent } = fakeSender();
    await expect(requestPasswordReset(`sconosciuto-${suffix}@t.local`, null, send)).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it("token scaduto: rifiutato anche con l'hash giusto", async () => {
    const user = await prisma.user.create({
      data: { tenantId: tenant.id, email: `scaduto-${suffix}@t.local`, name: "Scaduto", passwordHash: await hashPassword("x") },
    });
    const company = await prisma.company.create({
      data: { tenantId: tenant.id, slug: `c3-${suffix}`, name: "C3", colorLight: "#000000", colorDark: "#FFFFFF" },
    });
    await prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, companyId: company.id, role: "CEO" } });

    const { send, sent } = fakeSender();
    await requestPasswordReset(user.email, null, send);
    const token = tokenFromLink(sent[0]!.text);

    await prisma.passwordResetToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(resetPassword(token, "qualunque-password-1")).rejects.toThrow(PasswordResetError);
  });

  it("token inesistente: rifiutato", async () => {
    await expect(resetPassword("ocra_pwd_non-esiste", "qualunque-password-1")).rejects.toThrow(PasswordResetError);
  });
});
