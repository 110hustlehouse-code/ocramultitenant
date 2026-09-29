import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { scopeArgs, TENANT_MODELS, tenantExtension, TenantScopeError } from "./tenant";

describe("scopeArgs (puro)", () => {
  it("aggiunge tenantId alle letture", () => {
    expect(scopeArgs("findMany", { where: { slug: "x" } }, "t1")).toEqual({ where: { slug: "x", tenantId: "t1" } });
    expect(scopeArgs("count", undefined, "t1")).toEqual({ where: { tenantId: "t1" } });
  });

  it("sovrascrive un tenantId diverso nel where", () => {
    expect(scopeArgs("findFirst", { where: { tenantId: "altro" } }, "t1")).toEqual({ where: { tenantId: "t1" } });
  });

  it("imposta tenantId nelle creazioni, anche multiple", () => {
    expect(scopeArgs("create", { data: { name: "a" } }, "t1")).toEqual({ data: { name: "a", tenantId: "t1" } });
    expect(scopeArgs("createMany", { data: [{ name: "a" }, { name: "b" }] }, "t1")).toEqual({
      data: [
        { name: "a", tenantId: "t1" },
        { name: "b", tenantId: "t1" },
      ],
    });
  });

  it("rifiuta scritture verso un altro tenant", () => {
    expect(() => scopeArgs("create", { data: { tenantId: "altro" } }, "t1")).toThrow(TenantScopeError);
    expect(() => scopeArgs("update", { where: { id: "1" }, data: { tenantId: "altro" } }, "t1")).toThrow(
      TenantScopeError,
    );
    expect(() => scopeArgs("create", { data: { tenant: { connect: { id: "altro" } } } }, "t1")).toThrow(
      TenantScopeError,
    );
  });

  it("fail closed sulle operazioni sconosciute", () => {
    expect(() => scopeArgs("operazioneFutura", {}, "t1")).toThrow(TenantScopeError);
  });
});

describe("registro modelli tenant", () => {
  it("ogni modello con tenantId nello schema è registrato in TENANT_MODELS", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
      .filter(([, , body]) => /^\s+tenantId\s/m.test(body))
      .map(([, name]) => name);
    expect(models.length).toBeGreaterThan(0);
    for (const name of models) expect(TENANT_MODELS.has(name), `aggiungi "${name}" a TENANT_MODELS`).toBe(true);
  });
});

// Integrazione: gira solo se c'è un database (Codespaces, CI).
const url = process.env.DATABASE_URL;
describe.skipIf(!url)("isolamento sul database", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let a: string;
  let b: string;

  beforeAll(async () => {
    a = (await prisma.tenant.create({ data: { slug: `test-a-${suffix}`, name: "Test A" } })).id;
    b = (await prisma.tenant.create({ data: { slug: `test-b-${suffix}`, name: "Test B" } })).id;
    await prisma.company.create({
      data: { tenantId: b, slug: "segreta", name: "Segreta", colorLight: "#000000", colorDark: "#FFFFFF" },
    });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [a, b] } } });
    await prisma.$disconnect();
  });

  it("un tenant non vede, non modifica e non cancella i dati di un altro", async () => {
    const dbA = prisma.$extends(tenantExtension(a));

    expect(await dbA.company.findMany()).toEqual([]);
    expect(await dbA.company.findFirst({ where: { slug: "segreta" } })).toBeNull();
    expect(await dbA.company.findUnique({ where: { tenantId_slug: { tenantId: b, slug: "segreta" } } })).toBeNull();
    expect((await dbA.company.updateMany({ data: { name: "Hackerata" } })).count).toBe(0);
    expect((await dbA.company.deleteMany()).count).toBe(0);

    const intact = await prisma.company.findFirst({ where: { tenantId: b } });
    expect(intact?.name).toBe("Segreta");
  });

  it("le creazioni finiscono nel tenant della sessione", async () => {
    const dbA = prisma.$extends(tenantExtension(a));
    const created = await dbA.company.create({
      data: { tenantId: a, slug: "nuova", name: "Nuova", colorLight: "#000000", colorDark: "#FFFFFF" },
    });
    expect(created.tenantId).toBe(a);
    await expect(
      dbA.company.create({
        data: { tenantId: b, slug: "intrusa", name: "Intrusa", colorLight: "#000000", colorDark: "#FFFFFF" },
      }),
    ).rejects.toThrow(TenantScopeError);
  });

  it("un accesso (Membership) non può collegare utente e società di tenant diversi", async () => {
    const user = await prisma.user.create({ data: { tenantId: a, email: `u-${suffix}@test.local`, name: "U" } });
    const foreign = await prisma.company.findFirstOrThrow({ where: { tenantId: b } });
    // Anche aggirando l'estensione (client di base), il database rifiuta.
    await expect(
      prisma.membership.create({ data: { tenantId: a, userId: user.id, companyId: foreign.id, role: "CEO" } }),
    ).rejects.toThrow(/tenant diversi/);
    await expect(
      prisma.membership.create({ data: { tenantId: b, userId: user.id, companyId: foreign.id, role: "CEO" } }),
    ).rejects.toThrow(/tenant diversi/);
  });

  it("gli accessi di un altro tenant non sono visibili", async () => {
    const dbA = prisma.$extends(tenantExtension(a));
    const userB = await prisma.user.create({ data: { tenantId: b, email: `v-${suffix}@test.local`, name: "V" } });
    const companyB = await prisma.company.findFirstOrThrow({ where: { tenantId: b } });
    await prisma.membership.create({ data: { tenantId: b, userId: userB.id, companyId: companyB.id, role: "CEO" } });
    expect(await dbA.membership.findMany()).toEqual([]);
  });
});
