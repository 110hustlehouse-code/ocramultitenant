import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company } from "@/generated/prisma/client";
import { testContext } from "@/test/context";
import { CompanyError, getCompanySettings, updateCompanySettings } from "./service";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("impostazioni società", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenantId: string;
  let duit: Company, fulcro: Company;
  let ceoId: string, pmId: string;

  const asCeo = () => testContext(prisma, tenantId, ceoId, [[duit, "CEO"]]);
  const asPm = () => testContext(prisma, tenantId, pmId, [[duit, "PROJECT_MANAGER"]]);

  const baseInput = {
    legalName: null,
    vatNumber: null,
    legalAddress: null,
    pec: null,
    sdiCode: null,
    reaNumber: null,
    legalRepresentative: null,
    bankIban: null,
    bankAccountHolder: null,
    quoteTerms: null,
    quoteFooter: null,
    quoteValidityDays: 30,
    nextQuoteNumber: 1,
  };

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { slug: `co-${suffix}`, name: "Società" } })).id;
    const co = (slug: string) =>
      prisma.company.create({ data: { tenantId, slug, name: slug, colorLight: "#000000", colorDark: "#FFFFFF", nextQuoteNumber: 1 } });
    duit = await co("duit");
    fulcro = await co("fulcro");
    ceoId = (await prisma.user.create({ data: { tenantId, email: `ceo-${suffix}@t.local`, name: "Daniele" } })).id;
    pmId = (await prisma.user.create({ data: { tenantId, email: `pm-${suffix}@t.local`, name: "Erika" } })).id;
    await prisma.membership.create({ data: { tenantId, userId: ceoId, companyId: duit.id, role: "CEO" } });
    await prisma.membership.create({ data: { tenantId, userId: pmId, companyId: duit.id, role: "PROJECT_MANAGER" } });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("solo chi gestisce le impostazioni legge o scrive", async () => {
    await expect(getCompanySettings(asPm(), duit.id)).rejects.toThrow(CompanyError);
    await expect(updateCompanySettings(asPm(), duit.id, baseInput)).rejects.toThrow(CompanyError);
    await expect(updateCompanySettings(asCeo(), fulcro.id, baseInput)).rejects.toThrow(CompanyError);
  });

  it("scrive IBAN, condizioni e dati legali", async () => {
    await updateCompanySettings(asCeo(), duit.id, {
      ...baseInput,
      // Il service scrive l'input così com'è: è companySettingsSchema (testato a parte in
      // input.test.ts) a normalizzare IBAN/P.IVA/SDI prima di chiamarlo, come in input.ts.
      bankIban: "IT60X0542811101000000123456",
      bankAccountHolder: "Duit S.r.l.",
      quoteTerms: "50% alla firma, saldo alla consegna",
      quoteFooter: "Bonifico bancario",
      vatNumber: "16633211004",
    });
    const company = await getCompanySettings(asCeo(), duit.id);
    expect(company.bankIban).toBe("IT60X0542811101000000123456");
    expect(company.bankAccountHolder).toBe("Duit S.r.l.");
    expect(company.quoteTerms).toBe("50% alla firma, saldo alla consegna");
    expect(company.vatNumber).toBe("16633211004");
  });

  it("numero di partenza: libero finché non è uscito nessun preventivo, poi bloccato", async () => {
    await updateCompanySettings(asCeo(), duit.id, { ...baseInput, nextQuoteNumber: 30 });
    expect((await getCompanySettings(asCeo(), duit.id)).nextQuoteNumber).toBe(30);

    const client = await prisma.party.create({ data: { tenantId, kinds: ["CLIENTE"], name: "Cliente test" } });
    await prisma.quote.create({
      data: { tenantId, companyId: duit.id, clientId: client.id, number: 30, title: "Preventivo 1", issueDate: new Date() },
    });

    await expect(updateCompanySettings(asCeo(), duit.id, { ...baseInput, nextQuoteNumber: 31 })).rejects.toThrow(CompanyError);
    // Invariato: nessun altro campo cambia anche se bloccato insieme al numero.
    await updateCompanySettings(asCeo(), duit.id, { ...baseInput, nextQuoteNumber: 30, quoteTerms: "Saldo a 30gg" });
    expect((await getCompanySettings(asCeo(), duit.id)).quoteTerms).toBe("Saldo a 30gg");
  });
});
