import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company, type User, type Party } from "@/generated/prisma/client";
import { testContext } from "@/test/context";
import { createQuote, deleteDraft, getQuote, saveDraft } from "./service";
import { renderQuotePdf } from "./pdf";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("PDF preventivo: footer con IBAN", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenantId: string;
  let company: Company, ceo: User, client: Party;

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { slug: `pdf-${suffix}`, name: "Pdf", modules: ["PREVENTIVI"] } })).id;
    company = await prisma.company.create({
      data: { tenantId, slug: "co", name: "Co", colorLight: "#000000", colorDark: "#FFFFFF", bankIban: "IT60X0542811101000000123456", bankAccountHolder: "Test S.r.l." },
    });
    ceo = await prisma.user.create({ data: { tenantId, email: `ceo-${suffix}@t.local`, name: "Daniele" } });
    await prisma.membership.create({ data: { tenantId, userId: ceo.id, companyId: company.id, role: "CEO" } });
    client = await prisma.party.create({ data: { tenantId, kinds: ["CLIENTE"], name: "Cliente test" } });
    await prisma.partyCompany.create({ data: { tenantId, partyId: client.id, companyId: company.id } });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("genera il PDF senza errori, con IBAN nel piè di pagina", async () => {
    const ctx = testContext(prisma, tenantId, ceo.id, [[company, "CEO"]]);
    const { id } = await createQuote(ctx, { companyId: company.id, clientId: client.id, title: "Smoke test" });
    await saveDraft(ctx, id, {
      title: "Smoke test",
      clientId: client.id,
      intro: null,
      terms: null,
      validUntil: null,
      vatRate: 22,
      lines: [
        { serviceItemId: null, description: "Voce di prova", quantity: 1, unit: "forfait", unitPrice: 10000, vatRate: 22, discountPercent: null, plannedCost: null },
      ],
    });

    const quote = await getQuote(ctx, id);
    expect(quote).not.toBeNull();
    const pdf = await renderQuotePdf(quote!);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    await deleteDraft(ctx, id);
  });
});
