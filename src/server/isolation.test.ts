import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company, type User } from "@/generated/prisma/client";
import { CompanyError, getCompanySettings, updateCompanySettings } from "@/server/companies/service";
import type { CompanySettingsInput } from "@/server/companies/input";
import { DocumentError, confirmUpload, resolveDownload } from "@/server/documents/service";
import { attachAudio, getMeeting, MeetingError } from "@/server/meetings/service";
import { completeTask, deleteTask, getProject, ProjectError, reopenTask, updateTask } from "@/server/projects/service";
import { addCost, MarginError, projectMargin } from "@/server/margine/service";
import { blockAccount, reschedule, ReminderError } from "@/server/reminders/service";
import { getParty } from "@/server/registry/service";
import { testContext } from "@/test/context";
import { revokeMember, UserError } from "@/server/users/service";

/**
 * Audit di sicurezza del 2026-10-01: verifica aggressiva dell'isolamento tra tenant e tra
 * società, convertita in test automatici. Il livello "società diversa, stesso tenant" è già
 * coperto nei test di ciascun modulo (projects/quotes/margine/users/companies/registry
 * service.test.ts); qui si copre il livello non ancora testato altrove — l'intera catena di
 * una Server Action (stesse funzioni di src/server/*\/service.ts, stesso ctx.db tenant-scoped)
 * invocata con ID reali di un TENANT COMPLETAMENTE DIVERSO.
 *
 * Ogni nuova funzione che legge o scrive dati economici o riservati dovrebbe guadagnarsi
 * una riga qui, sul modello di quelle già presenti.
 */
const url = process.env.DATABASE_URL;
describe.skipIf(!url)("isolamento cross-tenant sul database", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);

  let tenantA: string, tenantB: string;
  let companyA: Company, companyB: Company;
  let attacker: User, victimCeo: User;
  let victimProjectId: string, victimTaskId: string, victimMeetingId: string, victimDocId: string, victimPartyId: string, victimMembershipId: string;

  const ctxAttacker = () => {
    const c = testContext(prisma, tenantA, attacker.id, [[companyA, "CEO"]]);
    return { ...c, tenant: { ...c.tenant, modules: ["PROGETTI", "MARGINE", "PREVENTIVI", "VERBALI", "DOCUMENTI", "RICHIAMO"] } } as typeof c;
  };

  const settingsStub: CompanySettingsInput = {
    legalName: "PWNED",
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
    tenantA = (await prisma.tenant.create({ data: { slug: `iso-a-${suffix}`, name: "Tenant A (attaccante)" } })).id;
    tenantB = (await prisma.tenant.create({ data: { slug: `iso-b-${suffix}`, name: "Tenant B (vittima)" } })).id;
    companyA = await prisma.company.create({ data: { tenantId: tenantA, slug: "a", name: "Azienda A", colorLight: "#000000", colorDark: "#FFFFFF" } });
    companyB = await prisma.company.create({ data: { tenantId: tenantB, slug: "b", name: "Azienda B", colorLight: "#000000", colorDark: "#FFFFFF" } });

    attacker = await prisma.user.create({ data: { tenantId: tenantA, email: `attacker-${suffix}@t.local`, name: "Attaccante" } });
    await prisma.membership.create({ data: { tenantId: tenantA, userId: attacker.id, companyId: companyA.id, role: "CEO" } });

    victimCeo = await prisma.user.create({ data: { tenantId: tenantB, email: `victim-${suffix}@t.local`, name: "Vittima" } });
    const membership = await prisma.membership.create({ data: { tenantId: tenantB, userId: victimCeo.id, companyId: companyB.id, role: "CEO" } });
    victimMembershipId = membership.id;

    const party = await prisma.party.create({ data: { tenantId: tenantB, kinds: ["CLIENTE"], name: "Cliente riservato" } });
    await prisma.partyCompany.create({ data: { tenantId: tenantB, partyId: party.id, companyId: companyB.id } });
    victimPartyId = party.id;

    const project = await prisma.project.create({
      data: { tenantId: tenantB, companyId: companyB.id, name: "Progetto riservato", managerId: victimCeo.id, clientId: party.id },
    });
    victimProjectId = project.id;
    await prisma.projectBudgetLine.create({ data: { tenantId: tenantB, projectId: project.id, description: "Riga riservata", revenue: 999_000, plannedCost: 100_000 } });

    const task = await prisma.task.create({ data: { tenantId: tenantB, projectId: project.id, title: "Task riservato", assigneeId: victimCeo.id } });
    victimTaskId = task.id;

    const meeting = await prisma.meeting.create({
      data: { tenantId: tenantB, companyId: companyB.id, title: "Verbale riservato", heldAt: new Date(), createdById: victimCeo.id },
    });
    victimMeetingId = meeting.id;

    const doc = await prisma.document.create({
      data: {
        tenantId: tenantB,
        projectId: project.id,
        originalName: "segreto.pdf",
        displayName: "Segreto.pdf",
        groupKey: "segreto",
        version: 1,
        key: `${tenantB}/documenti/${project.id}/segreto.pdf`,
        mimeType: "application/pdf",
        size: 10,
        uploadedById: victimCeo.id,
      },
    });
    victimDocId = doc.id;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await prisma.$disconnect();
  });

  it("progetti e task: nessuna lettura o scrittura su ID di un altro tenant", async () => {
    expect(await getProject(ctxAttacker(), victimProjectId)).toBeNull();
    await expect(deleteTask(ctxAttacker(), victimTaskId)).rejects.toThrow(ProjectError);
    await expect(
      updateTask(ctxAttacker(), victimTaskId, { title: "PWNED", description: null, assigneeId: null, dueDate: null, priority: "NORMALE", budgetLineId: null }),
    ).rejects.toThrow(ProjectError);
    await expect(completeTask(ctxAttacker(), victimTaskId, "https://example.com/prova")).rejects.toThrow(ProjectError);
    await expect(reopenTask(ctxAttacker(), victimTaskId)).rejects.toThrow(ProjectError);
  });

  it("margine: costi e dati economici di un progetto di un altro tenant restano invisibili", async () => {
    await expect(
      addCost(ctxAttacker(), victimProjectId, { description: "costo intruso", amount: 100, incurredAt: "2026-01-01", budgetLineId: null, partyId: null }),
    ).rejects.toThrow(MarginError);
    await expect(projectMargin(ctxAttacker(), victimProjectId)).rejects.toThrow(MarginError);
  });

  it("verbali: nessuna lettura o scrittura su un verbale di un altro tenant", async () => {
    expect(await getMeeting(ctxAttacker(), victimMeetingId)).toBeNull();
    await expect(attachAudio(ctxAttacker(), victimMeetingId, `${tenantA}/meetings/${victimMeetingId}/x.mp3`)).rejects.toThrow(MeetingError);
  });

  it("documenti: download bloccato; non si registra un documento con chiave R2 che punta a un altro tenant", async () => {
    await expect(resolveDownload(ctxAttacker(), victimDocId)).rejects.toThrow(DocumentError);
    const ownProject = await prisma.project.create({ data: { tenantId: tenantA, companyId: companyA.id, name: "Progetto dell'attaccante" } });
    await expect(
      confirmUpload(ctxAttacker(), ownProject.id, `${tenantB}/documenti/${victimProjectId}/rubato.pdf`, {
        name: "rubato.pdf",
        type: "application/pdf",
        size: 10,
      }),
    ).rejects.toThrow(DocumentError);
  });

  it("anagrafiche: un'anagrafica di un altro tenant non è leggibile", async () => {
    expect(await getParty(ctxAttacker(), victimPartyId)).toBeNull();
  });

  it("impostazioni società e utenti: nessun accesso a società o appartenenze di un altro tenant", async () => {
    await expect(getCompanySettings(ctxAttacker(), companyB.id)).rejects.toThrow(CompanyError);
    await expect(updateCompanySettings(ctxAttacker(), companyB.id, settingsStub)).rejects.toThrow(CompanyError);
    await expect(revokeMember(ctxAttacker(), victimMembershipId)).rejects.toThrow(UserError);
  });

  it("richiami: blocco account e riassegnazione bloccati su un task di un altro tenant", async () => {
    await expect(blockAccount(ctxAttacker(), victimTaskId, "blocco intruso")).rejects.toThrow(ReminderError);
    await expect(reschedule(ctxAttacker(), victimTaskId, { dueDate: null, assigneeId: null })).rejects.toThrow(ReminderError);
  });

  it("l'estensione Prisma filtra solo il tenant: l'isolamento tra società resta compito del codice applicativo", async () => {
    // Query diretta su ctx.db, senza alcun filtro di società applicativo: resta comunque dentro
    // al proprio tenant (unica garanzia dell'estensione) — ma non filtra MAI per società, quindi
    // una query scritta senza `canIn()`/`projectScope()`/`visibleWhere()` leggerebbe anche le
    // altre società dello stesso tenant. Vedi i test di isolamento tra società nei singoli moduli.
    const rows = await ctxAttacker().db.company.findMany();
    expect(rows.every((c) => c.tenantId === tenantA)).toBe(true);
  });
});
