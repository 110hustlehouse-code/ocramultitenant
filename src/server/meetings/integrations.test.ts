import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company, type User } from "@/generated/prisma/client";
import { testContext } from "@/test/context";
import { parseInbound, type InboundMeeting } from "./inbound";
import { authenticateIntegration, createIntegration, disableIntegration, ingestMeeting, listIntegrations } from "./integrations";
import { getMeeting, MeetingError, runProcessing } from "./service";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("collegamenti e riunioni da servizi esterni", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenantId: string, otherTenantId: string;
  let duit: Company, fulcro: Company;
  let ceo: User, pm: User;
  let projectId: string;

  const asCeo = () => testContext(prisma, tenantId, ceo.id, [[duit, "CEO"]]);
  const asPm = () => testContext(prisma, tenantId, pm.id, [[duit, "PROJECT_MANAGER"]]);
  const inbound = (over: Record<string, unknown> = {}): InboundMeeting => {
    const r = parseInbound({ id: "ff-1", title: "Call Nora", date: "2026-09-29", transcript: "Erika: ".padEnd(80, "bla "), ...over });
    if (!r.ok) throw new Error(r.error);
    return r.meeting;
  };

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { slug: `int-${suffix}`, name: "Int", modules: ["VERBALI"] } })).id;
    otherTenantId = (await prisma.tenant.create({ data: { slug: `int2-${suffix}`, name: "Int2" } })).id;
    const co = (slug: string) =>
      prisma.company.create({ data: { tenantId, slug, name: slug, colorLight: "#000000", colorDark: "#FFFFFF" } });
    duit = await co("duit");
    fulcro = await co("fulcro");
    ceo = await prisma.user.create({ data: { tenantId, email: `ceo-${suffix}@t.local`, name: "Daniele" } });
    pm = await prisma.user.create({ data: { tenantId, email: `pm-${suffix}@t.local`, name: "Erika" } });
    await prisma.membership.create({ data: { tenantId, userId: ceo.id, companyId: duit.id, role: "CEO" } });
    await prisma.membership.create({ data: { tenantId, userId: pm.id, companyId: duit.id, role: "PROJECT_MANAGER" } });
    projectId = (await prisma.project.create({ data: { tenantId, companyId: duit.id, name: "Videoclip Nora", code: `DT/NORA-${suffix}` } })).id;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.$disconnect();
  });

  it("solo chi gestisce le impostazioni della società crea collegamenti", async () => {
    await expect(createIntegration(asPm(), { name: "Fireflies", companyId: duit.id, projectId: null })).rejects.toThrow(MeetingError);
    await expect(createIntegration(asCeo(), { name: "Fireflies", companyId: fulcro.id, projectId: null })).rejects.toThrow(MeetingError);
    expect(await listIntegrations(asPm())).toEqual([]);
  });

  it("token → collegamento; nel DB c'è solo l'hash; disattivato non entra più", async () => {
    const { integration, token } = await createIntegration(asCeo(), { name: "Fireflies Erika", companyId: duit.id, projectId: null });
    const row = await prisma.meetingIntegration.findUniqueOrThrow({ where: { id: integration.id } });
    expect(JSON.stringify(row)).not.toContain(token);

    expect(await authenticateIntegration(token)).toMatchObject({ id: integration.id, tenantId, companyId: duit.id });
    expect(await authenticateIntegration(`${token}x`)).toBeNull();

    await disableIntegration(asCeo(), integration.id);
    expect(await authenticateIntegration(token)).toBeNull();
  });

  it("modulo Verbali spento per il cliente → token rifiutato", async () => {
    const { token } = await createIntegration(asCeo(), { name: "Spento", companyId: duit.id, projectId: null });
    await prisma.tenant.update({ where: { id: tenantId }, data: { modules: [] } });
    expect(await authenticateIntegration(token)).toBeNull();
    await prisma.tenant.update({ where: { id: tenantId }, data: { modules: ["VERBALI"] } });
  });

  it("riunione in arrivo: progetto dal codice PO, stesso flusso a valle, nessun doppione", async () => {
    const { token } = await createIntegration(asCeo(), { name: "n8n", companyId: duit.id, projectId: null });
    const integration = (await authenticateIntegration(token))!;

    const first = await ingestMeeting(integration, inbound({ project: `dt/nora-${suffix}` }));
    expect(first).toMatchObject({ duplicate: false, job: { tenantId } });
    let verbalizer = "";
    await runProcessing(first.job!, {
      signedUrl: async () => "",
      transcribe: async () => { throw new Error("non deve trascrivere"); },
      minutes: async (input) => {
        verbalizer = input.verbalizer;
        return {
          minutes: "## Decisioni",
          proposals: [{ key: "p0", title: "Montaggio", assigneeId: pm.id, assigneeMention: "Erika", projectId: input.defaultProjectId, dueDate: null, priority: "NORMALE", evidence: null }],
        };
      },
    });
    expect(await getMeeting(asPm(), first.meetingId)).toMatchObject({
      status: "DA_RIVEDERE",
      source: "WEBHOOK",
      projectId,
      createdById: null,
      title: "Call Nora",
      proposals: [{ projectId }],
    });

    expect(verbalizer).toBe("OCRA, da «n8n»");
    const again = await ingestMeeting(integration, inbound({ project: `dt/nora-${suffix}` }));
    expect(again).toEqual({ meetingId: first.meetingId, duplicate: true, job: null });

    const noCode = await ingestMeeting(integration, inbound({ id: "ff-2", project: "sconosciuto" }));
    expect(await prisma.meeting.findUniqueOrThrow({ where: { id: noCode.meetingId } })).toMatchObject({ projectId: null, status: "IN_ELABORAZIONE" });
    expect(await prisma.meetingIntegration.findUniqueOrThrow({ where: { id: integration.id } })).toMatchObject({ lastUsedAt: expect.any(Date) });
  });

  it("il progetto del collegamento vince sul codice inviato", async () => {
    const other = await prisma.project.create({ data: { tenantId, companyId: duit.id, name: "Altro", code: `DT/ALTRO-${suffix}` } });
    const { token } = await createIntegration(asCeo(), { name: "Solo Nora", companyId: duit.id, projectId });
    const r = await ingestMeeting((await authenticateIntegration(token))!, inbound({ id: "ff-3", project: other.code }));
    expect(await prisma.meeting.findUniqueOrThrow({ where: { id: r.meetingId } })).toMatchObject({ projectId });
  });
});
