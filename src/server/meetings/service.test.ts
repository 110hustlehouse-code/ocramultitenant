import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company, type User } from "@/generated/prisma/client";
import { testContext } from "@/test/context";
import {
  attachAudio,
  confirmMeeting,
  createMeeting,
  getMeeting,
  MeetingError,
  runProcessing,
  setTranscript,
  startProcessing,
  type ProcessingDeps,
} from "./service";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("verbali sul database", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenantId: string;
  let duit: Company, fulcro: Company;
  let pm: User, marco: User;
  let projectId: string;

  const asPm = () => testContext(prisma, tenantId, pm.id, [[duit, "PROJECT_MANAGER"]]);
  const asMarco = () => testContext(prisma, tenantId, marco.id, [[duit, "CREATIVE"]]);

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { slug: `mtg-${suffix}`, name: "Mtg" } })).id;
    const co = (slug: string) =>
      prisma.company.create({ data: { tenantId, slug, name: slug, colorLight: "#000000", colorDark: "#FFFFFF" } });
    duit = await co("duit");
    fulcro = await co("fulcro");
    pm = await prisma.user.create({ data: { tenantId, email: `pm-${suffix}@t.local`, name: "Erika" } });
    marco = await prisma.user.create({ data: { tenantId, email: `m-${suffix}@t.local`, name: "Marco Villa" } });
    await prisma.membership.create({ data: { tenantId, userId: pm.id, companyId: duit.id, role: "PROJECT_MANAGER" } });
    await prisma.membership.create({ data: { tenantId, userId: marco.id, companyId: duit.id, role: "CREATIVE" } });
    projectId = (await prisma.project.create({ data: { tenantId, companyId: duit.id, name: "Videoclip Nora" } })).id;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const fakeDeps = (seen: { people?: string[] } = {}): ProcessingDeps => ({
    signedUrl: async (k) => `https://r2.example/${k}`,
    transcribe: async (u) => ({ text: `[00:01] Voce 1: da ${u}. Marco, montaggio entro venerdì.`, durationSec: 1800 }),
    minutes: async (input) => {
      seen.people = input.people.map((p) => p.name).sort();
      return {
        minutes: "## Decisioni\n- Montaggio entro venerdì",
        proposals: [
          { key: "p0", title: "Montaggio v1", assigneeId: marco.id, assigneeMention: "Marco", projectId: input.defaultProjectId, dueDate: "2026-10-02", priority: "ALTA", evidence: "entro venerdì" },
          { key: "p1", title: "Chiamare il fonico", assigneeId: null, assigneeMention: "Gigi", projectId: null, dueDate: null, priority: "NORMALE", evidence: null },
        ],
      };
    },
  });

  it("solo chi ha i permessi crea verbali, e nella propria società", async () => {
    await expect(createMeeting(asMarco(), { title: "x", heldAt: "2026-09-29", companyId: duit.id, projectId: null })).rejects.toThrow(MeetingError);
    await expect(createMeeting(asPm(), { title: "x", heldAt: "2026-09-29", companyId: fulcro.id, projectId: null })).rejects.toThrow(MeetingError);
  });

  it("audio → trascrizione → verbale → task proposti → conferma → task veri", async () => {
    const m = await createMeeting(asPm(), { title: "Produzione Nora", heldAt: "2026-09-29", companyId: duit.id, projectId });
    await expect(attachAudio(asPm(), m.id, `${tenantId}/meetings/altro/x.webm`)).rejects.toThrow(/non valido/);
    await attachAudio(asPm(), m.id, `${tenantId}/meetings/${m.id}/1-registrazione.webm`, "REGISTRAZIONE");

    const job = await startProcessing(asPm(), m.id);
    await expect(startProcessing(asPm(), m.id)).rejects.toThrow(/già in corso/);
    const seen: { people?: string[] } = {};
    await runProcessing(job, fakeDeps(seen));
    expect(seen.people).toEqual(["Erika", "Marco Villa"]);

    const ready = await getMeeting(asPm(), m.id);
    expect(ready).toMatchObject({ status: "DA_RIVEDERE", durationSec: 1800, canWrite: true, source: "REGISTRAZIONE" });
    expect(ready?.transcript).toContain("r2.example");
    expect(ready?.proposals).toHaveLength(2);

    // il secondo task non ha progetto: la conferma lo segnala
    const decisions = ready!.proposals.map((p) => ({ ...p, include: true }));
    await expect(confirmMeeting(asPm(), m.id, decisions)).rejects.toThrow(/Task 2: scegli il progetto/);

    decisions[1] = { ...decisions[1]!, projectId };
    expect(await confirmMeeting(asPm(), m.id, decisions)).toBe(2);
    const tasks = await prisma.task.findMany({ where: { meetingId: m.id }, orderBy: { title: "asc" } });
    expect(tasks.map((t) => [t.title, t.source])).toEqual([
      ["Chiamare il fonico", "VERBALE"],
      ["Montaggio v1", "VERBALE"],
    ]);
    expect(await prisma.projectMember.count({ where: { projectId, userId: marco.id } })).toBe(1);
    await expect(confirmMeeting(asPm(), m.id, decisions)).rejects.toThrow(/non è pronto/);
  });

  it("trascrizione incollata: niente audio, stesso flusso; gli errori finiscono sul verbale", async () => {
    const m = await createMeeting(asPm(), { title: "Call cliente", heldAt: "2026-09-29", companyId: duit.id, projectId: null });
    await expect(setTranscript(asPm(), m.id, "troppo corta")).rejects.toThrow(/corta/);
    await setTranscript(asPm(), m.id, "Erika: ".padEnd(80, "bla "));
    const job = await startProcessing(asPm(), m.id);
    await runProcessing(job, { ...fakeDeps(), minutes: async () => { throw new Error("AI non configurata"); } });
    expect(await getMeeting(asPm(), m.id)).toMatchObject({ status: "ERRORE", error: "AI non configurata", source: "TESTO" });
  });

  it("un'elaborazione interrotta non resta bloccata: dopo 10 minuti si può riprovare", async () => {
    const m = await createMeeting(asPm(), { title: "Interrotta", heldAt: "2026-09-29", companyId: duit.id, projectId: null });
    await setTranscript(asPm(), m.id, "Erika: ".padEnd(80, "bla "));
    await startProcessing(asPm(), m.id); // la funzione muore qui, prima di runProcessing
    expect(await getMeeting(asPm(), m.id)).toMatchObject({ status: "IN_ELABORAZIONE", stale: false });
    await expect(startProcessing(asPm(), m.id)).rejects.toThrow(/già in corso/);

    const old = new Date(Date.now() - 11 * 60 * 1000);
    await prisma.$executeRaw`UPDATE "Meeting" SET "updatedAt" = ${old} WHERE id = ${m.id}`;
    expect(await getMeeting(asPm(), m.id)).toMatchObject({ stale: true });
    const job = await startProcessing(asPm(), m.id);
    await runProcessing(job, fakeDeps());
    expect(await getMeeting(asPm(), m.id)).toMatchObject({ status: "DA_RIVEDERE", stale: false });
  });

  it("il collaboratore non vede i verbali", async () => {
    const m = await prisma.meeting.findFirstOrThrow({ where: { tenantId } });
    expect(await getMeeting(asMarco(), m.id)).toBeNull();
  });
});
