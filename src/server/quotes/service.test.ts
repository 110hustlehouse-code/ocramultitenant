import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company, type User } from "@/generated/prisma/client";
import { testContext } from "@/test/context";
import { proposeDraft } from "./claude";
import { renderQuotePdf, pdfFileName } from "./pdf";
import {
  acceptQuote,
  createQuote,
  deleteDraft,
  duplicateQuote,
  getQuote,
  markSent,
  projectBudget,
  QuoteError,
  rejectQuote,
  saveDraft,
  saveServiceItem,
  setMilestone,
  suggestProjectCode,
  type DraftInput,
} from "./service";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("preventivi sul database", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenantId: string;
  let ap: Company, as: Company;
  let ceo: User, pm: User;
  let teatro: string, altro: string;
  let service: string, riprese: string, foreign: string;

  const ctxFor = (u: User, roles: Array<[Company, "CEO" | "PROJECT_MANAGER"]>) => {
    const c = testContext(prisma, tenantId, u.id, roles);
    return { ...c, user: { id: u.id, name: u.name, email: u.email }, tenant: { ...c.tenant, modules: ["PREVENTIVI"] } } as typeof c;
  };
  const asCeo = () => ctxFor(ceo, [[ap, "CEO"], [as, "CEO"]]);
  const asPm = () => ctxFor(pm, [[ap, "PROJECT_MANAGER"]]);

  const draft = (over: Partial<DraftInput> = {}): DraftInput => ({
    title: "Serata di apertura",
    clientId: teatro,
    intro: "Vi proponiamo",
    terms: "50% alla firma",
    validUntil: "2026-10-31",
    vatRate: 22,
    lines: [
      { serviceItemId: service, description: "Service audio e luci", quantity: 2, unit: "giorno", unitPrice: 240_000, discountPercent: null, vatRate: 22, plannedCost: 340_000 },
      { serviceItemId: riprese, description: "Riprese", quantity: 1.5, unit: "giorno", unitPrice: 150_000, discountPercent: null, vatRate: 22, plannedCost: null },
      { serviceItemId: null, description: "Catering", quantity: 1, unit: "forfait", unitPrice: 50_000, discountPercent: null, vatRate: 22, plannedCost: 40_000 },
    ],
    ...over,
  });

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { slug: `quo-${suffix}`, name: "Quo", modules: ["PREVENTIVI"] } })).id;
    const co = (slug: string, poPrefix: string, nextQuoteNumber = 1) =>
      prisma.company.create({ data: { tenantId, slug, name: slug, poPrefix, colorLight: "#C2410C", colorDark: "#FB923C", nextQuoteNumber, quoteTerms: "50% alla firma" } });
    ap = await co("aurora-produzioni", "AP", 30);
    as = await co("aurora-studio", "AS");
    const user = async (name: string) => prisma.user.create({ data: { tenantId, email: `${name.toLowerCase()}-${suffix}@t.local`, name } });
    ceo = await user("Giulia");
    pm = await user("Luca");
    await prisma.membership.create({ data: { tenantId, userId: ceo.id, companyId: ap.id, role: "CEO" } });
    await prisma.membership.create({ data: { tenantId, userId: ceo.id, companyId: as.id, role: "CEO" } });
    await prisma.membership.create({ data: { tenantId, userId: pm.id, companyId: ap.id, role: "PROJECT_MANAGER" } });
    const party = async (name: string, companyId: string) => {
      const p = await prisma.party.create({ data: { tenantId, kind: "CLIENTE", name } });
      await prisma.partyCompany.create({ data: { tenantId, partyId: p.id, companyId } });
      return p.id;
    };
    teatro = await party("Fondazione Teatro Nuovo", ap.id);
    altro = await party("Cliente di Studio", as.id);
    service = (await saveServiceItem(asCeo(), ap.id, null, { name: "Service audio e luci", description: null, poCode: "eventi", unit: "giorno", unitPrice: 240_000, unitCost: 170_000 })).id;
    riprese = (await saveServiceItem(asCeo(), ap.id, null, { name: "Riprese video", description: null, poCode: "VIDEO", unit: "giorno", unitPrice: 150_000, unitCost: 75_000 })).id;
    foreign = (await saveServiceItem(asCeo(), as.id, null, { name: "Brand", description: null, poCode: "BRAND", unit: "forfait", unitPrice: 650_000, unitCost: null })).id;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("solo il CEO: il PM non crea preventivi, non gestisce il listino, non vede il budget", async () => {
    await expect(createQuote(asPm(), { companyId: ap.id, clientId: teatro, title: "X" })).rejects.toThrow(QuoteError);
    await expect(saveServiceItem(asPm(), ap.id, null, { name: "X", description: null, poCode: "X1", unit: "ora", unitPrice: 1, unitCost: null })).rejects.toThrow(QuoteError);
    expect(await projectBudget(asPm(), "qualunque", ap.id)).toBeNull();
    expect((await prisma.serviceItem.findUniqueOrThrow({ where: { id: service } })).poCode).toBe("EVENTI");
  });

  it("numerazione progressiva per società, continua (Fulcro/AP riparte da 30)", async () => {
    const a = await createQuote(asCeo(), { companyId: ap.id, clientId: teatro, title: "Uno" });
    const b = await createQuote(asCeo(), { companyId: ap.id, clientId: teatro, title: "Due" });
    const c = await createQuote(asCeo(), { companyId: as.id, clientId: altro, title: "Tre" });
    expect([a.number, b.number, c.number]).toEqual([30, 31, 1]);
    expect(a).toMatchObject({ status: "BOZZA", vatRate: 22, terms: "50% alla firma" });
    await expect(createQuote(asCeo(), { companyId: ap.id, clientId: altro, title: "Cliente di un'altra società" })).rejects.toThrow(/cliente della società/);
    await deleteDraft(asCeo(), b.id);
    expect((await createQuote(asCeo(), { companyId: ap.id, clientId: teatro, title: "Quattro" })).number).toBe(32); // il 31 non si riusa
  });

  it("bozza: totali calcolati dal server; voci di listino di un'altra società rifiutate", async () => {
    const q = await createQuote(asCeo(), { companyId: ap.id, clientId: teatro, title: "Bozza" });
    await saveDraft(asCeo(), q.id, draft());
    const saved = (await getQuote(asCeo(), q.id))!;
    // 2×2400 + 1,5×1500 + 500 = 7550 €; IVA 22% = 1661 €
    expect(saved).toMatchObject({ subtotal: 755_000, vat: 166_100, total: 921_100, title: "Serata di apertura" });
    expect(saved.lines.map((l) => [l.description, Number(l.quantity), l.total])).toEqual([
      ["Service audio e luci", 2, 480_000],
      ["Riprese", 1.5, 225_000],
      ["Catering", 1, 50_000],
    ]);
    await expect(
      saveDraft(
        asCeo(),
        q.id,
        draft({ lines: [{ serviceItemId: foreign, description: "Brand", quantity: 1, unit: "forfait", unitPrice: 1, discountPercent: null, vatRate: 22, plannedCost: null }] }),
      ),
    ).rejects.toThrow(/non è di questa società/);
    await expect(
      saveDraft(
        asCeo(),
        q.id,
        draft({ lines: [{ serviceItemId: null, description: "X", quantity: 1, unit: "x", unitPrice: -5, discountPercent: null, vatRate: 22, plannedCost: null }] }),
      ),
    ).rejects.toThrow(/Voce 1/);
  });

  it("sconto per riga e aliquote miste: il PDF ha una riga di Riepilogo IVA per aliquota", async () => {
    const q = await createQuote(asCeo(), { companyId: ap.id, clientId: teatro, title: "Sconto e spedizione" });
    await saveDraft(
      asCeo(),
      q.id,
      draft({
        lines: [
          // 2×2400€ - 12,5% = 4200,00€, IVA 22%
          { serviceItemId: service, description: "Service audio e luci", quantity: 2, unit: "giorno", unitPrice: 240_000, discountPercent: 12.5, vatRate: 22, plannedCost: 340_000 },
          // Voce di spedizione fuori listino a un'aliquota diversa, come nei preventivi reali di Fulcro
          { serviceItemId: null, description: "Spedizione", quantity: 1, unit: "forfait", unitPrice: 3_000, discountPercent: null, vatRate: 5, plannedCost: null },
        ],
      }),
    );
    const saved = (await getQuote(asCeo(), q.id))!;
    expect(saved.lines[0]).toMatchObject({ total: 420_000, discountPercent: expect.anything() });
    expect(Number(saved.lines[0]!.discountPercent)).toBe(12.5);
    // 420000 al 22% = 92400; 3000 al 5% = 150 → totale IVA 92550, imponibile 423000
    expect(saved).toMatchObject({ subtotal: 423_000, vat: 92_550, total: 515_550 });

    const pdf = await renderQuotePdf(saved);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5_000);
  });

  it("inviato → non si modifica; accettato → nasce il progetto con codice PO, PM e budget", async () => {
    const q = await createQuote(asCeo(), { companyId: ap.id, clientId: teatro, title: "Stagione Teatro Nuovo" });
    await expect(markSent(asCeo(), q.id)).rejects.toThrow(/almeno una voce/);
    await saveDraft(asCeo(), q.id, draft({ title: "Stagione Teatro Nuovo" }));
    await markSent(asCeo(), q.id);
    await expect(saveDraft(asCeo(), q.id, draft())).rejects.toThrow(/duplicalo/);

    const quote = (await getQuote(asCeo(), q.id))!;
    const now = new Date("2026-10-05T10:00:00Z");
    expect(await suggestProjectCode(asCeo(), quote, now)).toBe("AP/EVENTI/10-2026/TEATRONUOVO/E");
    await expect(acceptQuote(asCeo(), q.id, { managerId: ceo.id === pm.id ? null : "estraneo", code: null }, now)).rejects.toThrow(/PM o il CEO/);

    const project = await acceptQuote(asCeo(), q.id, { managerId: pm.id, code: null }, now);
    expect(project).toMatchObject({
      name: "Stagione Teatro Nuovo",
      code: "AP/EVENTI/10-2026/TEATRONUOVO/E",
      clientId: teatro,
      companyId: ap.id,
      managerId: pm.id,
      service: "Service audio e luci",
      status: "ATTIVO",
    });
    expect(await prisma.projectMember.count({ where: { projectId: project.id, userId: pm.id } })).toBe(1);
    expect(await getQuote(asCeo(), q.id)).toMatchObject({ status: "ACCETTATO", projectId: project.id, acceptedAt: now });

    const budget = (await projectBudget(asCeo(), project.id, ap.id))!;
    expect(budget.lines.map((l) => [l.description, l.revenue, l.plannedCost])).toEqual([
      ["Service audio e luci", 480_000, 340_000],
      ["Riprese", 225_000, null],
      ["Catering", 50_000, 40_000],
    ]);
    expect(budget).toMatchObject({ revenue: 755_000, plannedCost: 380_000, hasCosts: true, quote: { number: quote.number } });
    expect(budget.lines.every((l) => l.quoteLineId)).toBe(true);

    // Contratto e acconto: informativi
    await setMilestone(asCeo(), q.id, "contract", true);
    expect((await getQuote(asCeo(), q.id))!.contractSignedAt).toBeInstanceOf(Date);
    await setMilestone(asCeo(), q.id, "contract", false);
    expect((await getQuote(asCeo(), q.id))!.contractSignedAt).toBeNull();
    await expect(acceptQuote(asCeo(), q.id, { managerId: null, code: null })).rejects.toThrow(/solo un preventivo inviato/);

    // Secondo preventivo accettato per lo stesso cliente nello stesso mese: il codice diventa -2
    const q2 = await duplicateQuote(asCeo(), q.id);
    expect(q2.number).toBeGreaterThan(quote.number);
    expect((await getQuote(asCeo(), q2.id))!.lines).toHaveLength(3);
    await markSent(asCeo(), q2.id);
    await expect(acceptQuote(asCeo(), q2.id, { managerId: null, code: "ap/eventi/10-2026/teatronuovo/e" }, now)).rejects.toThrow(/già usato/);
    const p2 = await acceptQuote(asCeo(), q2.id, { managerId: null, code: null }, now);
    expect(p2.code).toBe("AP/EVENTI/10-2026/TEATRONUOVO/E-2");
  });

  it("rifiutato con motivo; solo le bozze si eliminano", async () => {
    const q = await createQuote(asCeo(), { companyId: ap.id, clientId: teatro, title: "Rifiutato" });
    await saveDraft(asCeo(), q.id, draft());
    await expect(rejectQuote(asCeo(), q.id, null)).rejects.toThrow(/inviato/);
    await markSent(asCeo(), q.id);
    await rejectQuote(asCeo(), q.id, "Prezzo alto");
    expect(await getQuote(asCeo(), q.id)).toMatchObject({ status: "RIFIUTATO", rejectionNote: "Prezzo alto", projectId: null });
    await expect(deleteDraft(asCeo(), q.id)).rejects.toThrow(/Solo le bozze/);
  });

  it("Claude compone la bozza dal listino; il brief resta salvato", async () => {
    const q = await createQuote(asCeo(), { companyId: ap.id, clientId: teatro, title: "Da comporre" });
    let seenCatalog: string[] = [];
    const notes = await proposeDraft(asCeo(), q.id, "Serata di apertura, due giorni di service e riprese", async (input) => {
      seenCatalog = input.catalog.map((c) => c.name).sort();
      expect(input.past.length).toBeGreaterThan(0); // preventivi inviati/accettati dello stesso cliente
      return {
        title: null,
        intro: "Vi proponiamo il service per la serata.",
        lines: [
          {
            serviceItemId: service,
            description: "Service audio e luci, 2 giorni",
            quantity: 2,
            unit: "giorno",
            unitPrice: 240_000,
            discountPercent: null,
            vatRate: 22,
            plannedCost: 340_000,
          },
        ],
        notes: ["Date da confermare"],
      };
    });
    expect(seenCatalog).toEqual(["Riprese video", "Service audio e luci"]); // solo il listino della società
    expect(notes).toEqual(["Date da confermare"]);
    expect(await getQuote(asCeo(), q.id)).toMatchObject({
      title: "Da comporre",
      intro: "Vi proponiamo il service per la serata.",
      brief: "Serata di apertura, due giorni di service e riprese",
      subtotal: 480_000,
    });
  });

  it("PDF: un documento vero, con il nome del file leggibile", async () => {
    const q = await createQuote(asCeo(), { companyId: ap.id, clientId: teatro, title: "PDF" });
    await saveDraft(asCeo(), q.id, draft());
    const quote = (await getQuote(asCeo(), q.id))!;
    const pdf = await renderQuotePdf(quote);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5_000);
    expect(pdfFileName(quote)).toBe(`Preventivo-${quote.number}-2026-Fondazione-Teatro-Nuovo.pdf`.replace("2026", String(quote.issueDate.getUTCFullYear())));
  });
});
