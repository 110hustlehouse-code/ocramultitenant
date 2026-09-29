import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company, type User } from "@/generated/prisma/client";
import { firstMessage } from "@/lib/followups";
import type { Email } from "@/server/notify/email";
import { completeTask } from "@/server/projects/service";
import { runReminders } from "@/server/reminders/engine";
import { testContext } from "@/test/context";
import { cancelFollowUp, followUpsBoard, FollowUpError, resolveFollowUp, runClientFollowUps, startFollowUp } from "./service";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("solleciti ai clienti sul database", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenantId: string;
  let duit: Company;
  let pm: User, marco: User, luca: User, ext: User;
  let projectId: string, internalProjectId: string, clientId: string;
  const outbox: Email[] = [];
  let seq = 0;
  const send = async (e: Email) => {
    outbox.push(e);
    return { delivered: true, messageId: `<m${++seq}-${suffix}@test>` };
  };
  const mine = () => outbox.filter((e) => e.to.includes(suffix));

  const ctxFor = (u: User, role: "PROJECT_MANAGER" | "CREATIVE" | "EXTERNAL") => {
    const c = testContext(prisma, tenantId, u.id, [[duit, role]]);
    return { ...c, user: { id: u.id, name: u.name, email: u.email }, tenant: { ...c.tenant, modules: ["SOLLECITI", "RICHIAMO"] } } as typeof c;
  };
  const asPm = () => ctxFor(pm, "PROJECT_MANAGER");
  const asMarco = () => ctxFor(marco, "CREATIVE");
  const asLuca = () => ctxFor(luca, "CREATIVE");
  const asExt = () => ctxFor(ext, "EXTERNAL");

  const task = (title: string, assignee: User, project = projectId) =>
    prisma.task.create({ data: { tenantId, projectId: project, title, assigneeId: assignee.id, dueDate: new Date("2026-09-28T12:00:00Z") } });
  const draft = (waitingFor: string) => ({
    waitingFor,
    contactName: "Nora Vale",
    contactEmail: `nora-${suffix}@cliente.it`,
    ...firstMessage({ contactName: "Nora Vale", projectName: "Videoclip Nora", waitingFor, senderName: "Marco Villa", companyName: "Duit" }),
  });

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { slug: `fol-${suffix}`, name: "Fol", modules: ["SOLLECITI", "RICHIAMO"] } })).id;
    duit = await prisma.company.create({ data: { tenantId, slug: "duit", name: "Duit", colorLight: "#000000", colorDark: "#FFFFFF" } });
    const user = async (name: string, role: "PROJECT_MANAGER" | "CREATIVE" | "EXTERNAL") => {
      const u = await prisma.user.create({ data: { tenantId, email: `${name.split(" ")[0]!.toLowerCase()}-${suffix}@t.local`, name } });
      await prisma.membership.create({ data: { tenantId, userId: u.id, companyId: duit.id, role } });
      return u;
    };
    pm = await user("Giammarco", "PROJECT_MANAGER");
    marco = await user("Marco Villa", "CREATIVE");
    luca = await user("Luca", "CREATIVE");
    ext = await user("Esterno", "EXTERNAL");
    // Cliente senza email del referente: la si chiede all'avvio.
    clientId = (await prisma.party.create({ data: { tenantId, kind: "CLIENTE", name: "Nora Vale Srl" } })).id;
    await prisma.partyCompany.create({ data: { tenantId, partyId: clientId, companyId: duit.id } });
    projectId = (await prisma.project.create({ data: { tenantId, companyId: duit.id, name: "Videoclip Nora", clientId, managerId: pm.id } })).id;
    internalProjectId = (await prisma.project.create({ data: { tenantId, companyId: duit.id, name: "Interno" } })).id;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("lo avvia solo chi ha il task (non esterno) o il PM, su un progetto con cliente", async () => {
    const t = await task("Montaggio v1", marco);
    await expect(startFollowUp(asLuca(), t.id, draft("l'approvazione"), send)).rejects.toThrow(FollowUpError);
    const tExt = await task("Foto", ext);
    await expect(startFollowUp(asExt(), tExt.id, draft("le foto"), send)).rejects.toThrow(/Solo chi ha il task/);
    const tInt = await task("Interno", marco, internalProjectId);
    await expect(startFollowUp(asMarco(), tInt.id, draft("x y z"), send)).rejects.toThrow(/non ha un cliente/);
    await expect(startFollowUp(asMarco(), t.id, { ...draft("l'approvazione"), contactEmail: "non-una-email" }, send)).rejects.toThrow(/Email/);
    const off = { ...asMarco(), tenant: { ...asMarco().tenant, modules: ["RICHIAMO"] } } as ReturnType<typeof asMarco>;
    await expect(startFollowUp(off, t.id, draft("l'approvazione"), send)).rejects.toThrow(/non attivi/);
  });

  it("il primo messaggio parte subito, dalla persona; uno solo attivo per task", async () => {
    const t = await task("Montaggio v2", marco);
    const d = draft("l'approvazione del montaggio v1");
    const { followUp } = await startFollowUp(asMarco(), t.id, d, send);
    const sent = mine().at(-1)!;
    expect(sent).toMatchObject({ to: `nora-${suffix}@cliente.it`, subject: d.subject, text: d.body, replyTo: marco.email });
    expect(sent.html).toBeUndefined();
    const stored = await prisma.clientMessage.findMany({ where: { followUpId: followUp.id } });
    expect(stored).toMatchObject([{ kind: "PRIMO", sentById: marco.id, delivered: true, messageId: expect.stringContaining("@test") }]);
    expect(followUp).toMatchObject({ status: "ATTIVO", everyWorkdays: 3, maxReminders: 2, remindersSent: 0, partyId: clientId });
    expect(followUp.nextReminderAt!.getTime()).toBeGreaterThan(Date.now());
    await expect(startFollowUp(asPm(), t.id, d, send)).rejects.toThrow(/già un sollecito/);
    // Il creativo non può modificare le anagrafiche: l'email resta solo sul sollecito.
    expect((await prisma.party.findUniqueOrThrow({ where: { id: clientId } })).email).toBeNull();
  });

  it("il PM avvia e completa l'anagrafica del referente", async () => {
    const t = await task("Logo", marco);
    await startFollowUp(asPm(), t.id, draft("il logo in vettoriale"), send);
    expect(await prisma.party.findUniqueOrThrow({ where: { id: clientId } })).toMatchObject({
      email: `nora-${suffix}@cliente.it`,
      contactName: "Nora Vale",
    });
  });

  it("mentre si aspetta il cliente, i richiami interni sul task si fermano", async () => {
    const waiting = await task("In attesa", marco);
    const normal = await task("Normale", marco);
    await startFollowUp(asMarco(), waiting.id, draft("i testi"), send);
    await runReminders(new Date("2026-09-29T06:30:00Z"), send); // mattina: primo richiamo
    const level = async (id: string) => (await prisma.task.findUniqueOrThrow({ where: { id } })).escalation;
    expect(await level(normal.id)).toBe(1);
    expect(await level(waiting.id)).toBe(0);
  });

  it("promemoria dopo il silenzio, nello stesso thread; al tetto un solo avviso al PM", async () => {
    const t = await task("Approvazione storyboard", marco);
    const { followUp } = await startFollowUp(asMarco(), t.id, draft("l'approvazione dello storyboard"), send);
    const firstId = (await prisma.clientMessage.findFirstOrThrow({ where: { followUpId: followUp.id } })).messageId;
    const setDue = () => prisma.clientFollowUp.update({ where: { id: followUp.id }, data: { nextReminderAt: new Date("2027-01-01T00:00:00Z") } });
    const monday10 = new Date("2027-03-01T09:00:00Z"); // lunedì 10:00 a Roma
    // Alle stesse ore partono anche i promemoria degli altri solleciti di questo file: si guarda questo.
    const messages = () => prisma.clientMessage.findMany({ where: { followUpId: followUp.id }, orderBy: { createdAt: "asc" } });
    const lastTo = (to: string) => mine().filter((e) => e.to === to).at(-1)!;
    const nora = `nora-${suffix}@cliente.it`;

    await setDue();
    await runClientFollowUps(new Date("2027-03-01T05:00:00Z"), send); // 6:00: fuori orario
    expect((await prisma.clientFollowUp.findUniqueOrThrow({ where: { id: followUp.id } })).remindersSent).toBe(0);

    await runClientFollowUps(monday10, send);
    const [, r1] = await messages();
    expect(r1).toMatchObject({ kind: "PROMEMORIA", sentById: null, to: nora });
    expect(r1!.subject).toBe("Re: Videoclip Nora — ci serve un vostro riscontro");
    expect(r1!.body).toContain("le riscrivo in merito a Videoclip Nora: per procedere ci servirebbe ancora l'approvazione dello storyboard");
    const sent1 = mine().find((e) => e.text === r1!.body)!;
    expect(sent1).toMatchObject({ inReplyTo: firstId, references: [firstId], replyTo: marco.email });
    let f = await prisma.clientFollowUp.findUniqueOrThrow({ where: { id: followUp.id } });
    expect(f.remindersSent).toBe(1);
    expect(f.nextReminderAt!.toISOString()).toBe("2027-03-04T08:00:00.000Z"); // giovedì 9:00

    await runClientFollowUps(monday10, send); // stessa ora: niente doppioni
    expect(await messages()).toHaveLength(2);

    await setDue();
    await runClientFollowUps(monday10, send);
    const [, , r2] = await messages();
    expect(r2!.body).toContain("torno a scriverle per l'approvazione dello storyboard");
    expect(mine().find((e) => e.text === r2!.body)!.references).toHaveLength(2);

    const toPmBefore = mine().filter((e) => e.to === pm.email).length;
    await setDue();
    await runClientFollowUps(monday10, send);
    expect(await messages()).toHaveLength(3); // al cliente non si scrive più
    const notice = lastTo(pm.email);
    expect(notice.subject).toBe("Il cliente non risponde: Videoclip Nora");
    expect(notice.text).toContain("aspettiamo l'approvazione dello storyboard");
    f = await prisma.clientFollowUp.findUniqueOrThrow({ where: { id: followUp.id } });
    expect(f).toMatchObject({ remindersSent: 2, nextReminderAt: null, managerNotifiedAt: monday10, status: "ATTIVO" });

    await runClientFollowUps(new Date("2027-03-15T09:00:00Z"), send);
    expect(await messages()).toHaveLength(3);
    // Al PM una volta sola per questo sollecito (gli altri del file possono aver raggiunto il tetto insieme)
    expect(mine().filter((e) => e.to === pm.email && e.text.includes("storyboard"))).toHaveLength(1);
    expect(mine().filter((e) => e.to === pm.email).length).toBeGreaterThan(toPmBefore);
  });

  it("chiusura: il cliente ha risposto, il task consegnato, oppure annullato", async () => {
    const a = await task("A", marco);
    const b = await task("B", marco);
    const c = await task("C", marco);
    const fa = (await startFollowUp(asMarco(), a.id, draft("a a a"), send)).followUp;
    const fb = (await startFollowUp(asMarco(), b.id, draft("b b b"), send)).followUp;
    const fc = (await startFollowUp(asMarco(), c.id, draft("c c c"), send)).followUp;

    await expect(resolveFollowUp(asLuca(), fa.id, null)).rejects.toThrow(FollowUpError);
    await resolveFollowUp(asMarco(), fa.id, "Ha approvato al telefono");
    await completeTask(asMarco(), b.id, "https://drive.example/b");
    await cancelFollowUp(asPm(), fc.id);

    const rows = await prisma.clientFollowUp.findMany({ where: { id: { in: [fa.id, fb.id, fc.id] } }, orderBy: { taskId: "asc" } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(fa.id)).toMatchObject({ status: "RISOLTO", resolvedById: marco.id, resolutionNote: "Ha approvato al telefono", nextReminderAt: null });
    expect(byId.get(fb.id)).toMatchObject({ status: "RISOLTO", resolutionNote: "Task chiuso" });
    expect(byId.get(fc.id)).toMatchObject({ status: "ANNULLATO" });
    await expect(resolveFollowUp(asMarco(), fa.id, null)).rejects.toThrow(/già chiuso/);
  });

  it("la vista per PM: in attesa adesso e giorni persi per progetto", async () => {
    // Date fisse: tutti avviati martedì 29 settembre; i chiusi chiusi il giorno dopo.
    await prisma.clientFollowUp.updateMany({ where: { projectId }, data: { startedAt: new Date("2026-09-29T08:00:00Z") } });
    await prisma.clientFollowUp.updateMany({ where: { projectId, resolvedAt: { not: null } }, data: { resolvedAt: new Date("2026-09-30T08:00:00Z") } });
    const board = await followUpsBoard(asPm(), new Date("2026-10-06T10:00:00Z"));
    expect(board.active.every((f) => f.project.id === projectId && f.status === "ATTIVO")).toBe(true);
    // Dal 29/9 al 6/10: 30, 1, 2, 5, 6 → 5 giorni lavorativi
    expect(board.active.find((f) => f.task.title === "Approvazione storyboard")).toMatchObject({ overCap: true, remindersSent: 2, days: 5 });
    // Più attese in parallelo sullo stesso progetto contano una volta sola
    expect(board.lost).toEqual([{ projectId, name: "Videoclip Nora", companyId: duit.id, days: 5 }]);
    // Il creativo non ha la vista
    expect((await followUpsBoard(asMarco())).active).toEqual([]);
  });
});
