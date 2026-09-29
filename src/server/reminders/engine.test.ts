import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company, type User } from "@/generated/prisma/client";
import type { Email } from "@/server/notify/email";
import { completeTask, updateTask } from "@/server/projects/service";
import { taskInputSchema } from "@/server/projects/input";
import { testContext } from "@/test/context";
import { runReminders } from "./engine";
import { blockAccount, collaboratorSituation, escalateToCeo, nudge, remindersBoard, reportBlocker, ReminderError } from "./service";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("richiami sul database", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenantId: string;
  let duit: Company;
  let ceo: User, pm: User, marco: User;
  let taskId: string, task2: string;
  const outbox: Email[] = [];
  const send = async (e: Email) => {
    outbox.push(e);
    return { delivered: true };
  };
  const asPm = () => testContext(prisma, tenantId, pm.id, [[duit, "PROJECT_MANAGER"]]);
  const asCeo = () => testContext(prisma, tenantId, ceo.id, [[duit, "CEO"]]);
  const asMarco = () => testContext(prisma, tenantId, marco.id, [[duit, "CREATIVE"]]);

  beforeAll(async () => {
    // Nel DB di sviluppo ci sono altri tenant con task scaduti: qui si guarda solo il nostro.
    tenantId = (await prisma.tenant.create({ data: { slug: `rem-${suffix}`, name: "Rem", modules: ["RICHIAMO"] } })).id;
    duit = await prisma.company.create({ data: { tenantId, slug: "duit", name: "Duit", colorLight: "#000000", colorDark: "#FFFFFF" } });
    const user = async (name: string, role: "CEO" | "PROJECT_MANAGER" | "CREATIVE") => {
      const u = await prisma.user.create({ data: { tenantId, email: `${name}-${suffix}@t.local`, name } });
      await prisma.membership.create({ data: { tenantId, userId: u.id, companyId: duit.id, role } });
      return u;
    };
    ceo = await user("Daniele", "CEO");
    pm = await user("Giammarco", "PROJECT_MANAGER");
    marco = await user("Marco Villa", "CREATIVE");
    const project = await prisma.project.create({ data: { tenantId, companyId: duit.id, name: "Videoclip", managerId: pm.id } });
    const mk = (title: string) =>
      prisma.task.create({ data: { tenantId, projectId: project.id, title, assigneeId: marco.id, dueDate: new Date("2026-09-29T12:00:00Z") } });
    taskId = (await mk("Montaggio")).id;
    task2 = (await mk("Export")).id;
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const mine = () => outbox.filter((e) => e.to.includes(suffix));
  const level = async (id: string) => (await prisma.task.findUniqueOrThrow({ where: { id } })).escalation;

  it("mattina → pomeriggio → giorno dopo al PM (un solo riepilogo), senza doppioni", async () => {
    await runReminders(new Date("2026-09-29T06:30:00Z"), send);
    expect(await level(taskId)).toBe(1);
    expect(mine().filter((e) => e.to.toLowerCase().startsWith("marco"))).toHaveLength(2);
    expect(mine()[0]?.subject).toBe("Promemoria: Montaggio");

    await runReminders(new Date("2026-09-29T07:30:00Z"), send); // stessa mattina: niente
    expect(mine()).toHaveLength(2);

    await runReminders(new Date("2026-09-29T13:30:00Z"), send);
    expect(await level(taskId)).toBe(2);
    expect(mine()[2]?.subject).toContain("Secondo promemoria");

    await runReminders(new Date("2026-09-30T06:30:00Z"), send);
    expect(await level(taskId)).toBe(3);
    const toPm = mine().filter((e) => e.to.toLowerCase().startsWith("giammarco"));
    expect(toPm).toHaveLength(1);
    expect(toPm[0]?.subject).toBe("2 task scaduti da gestire");
    expect(await prisma.reminder.count({ where: { tenantId } })).toBe(6);
  });

  it("il PM vede i task da gestire, sollecita e passa al CEO", async () => {
    const board = await remindersBoard(asPm());
    expect(board.toHandle.map((t) => t.title).sort()).toEqual(["Export", "Montaggio"]);
    await nudge(asPm(), taskId, "Mi aggiorni entro stasera?", send);
    expect(mine().at(-1)?.text).toContain("Mi aggiorni entro stasera?");
    await escalateToCeo(asPm(), taskId, send);
    expect(await level(taskId)).toBe(4);
    expect(mine().at(-1)?.to.toLowerCase().startsWith("daniele")).toBe(true);
    await expect(nudge(asMarco(), taskId, null, send)).rejects.toThrow(ReminderError);
  });

  it("il CEO vede la situazione del collaboratore", async () => {
    const s = await collaboratorSituation(asCeo(), marco.id, new Date("2026-09-30T08:00:00Z"));
    expect(s).toMatchObject({ open: 2, overdue: 2, activeProjects: 0, onTime: null });
  });

  it("blocco: solo PM/CEO, solo collaboratori; si sblocca alla consegna", async () => {
    await expect(blockAccount(asMarco(), taskId, null)).rejects.toThrow(ReminderError);
    await expect(blockAccount(asPm(), taskId, null)).resolves.toBeUndefined();
    expect(await prisma.accountBlock.count({ where: { userId: marco.id, releasedAt: null } })).toBe(1);
    await completeTask(asMarco(), taskId, "https://drive.example/montaggio.mp4");
    expect(await prisma.accountBlock.count({ where: { userId: marco.id, releasedAt: null } })).toBe(0);
    const ceoAsTarget = await prisma.task.create({ data: { tenantId, projectId: (await prisma.project.findFirstOrThrow({ where: { tenantId } })).id, title: "X", assigneeId: ceo.id } });
    await expect(blockAccount(asPm(), ceoAsTarget.id, null)).rejects.toThrow(/collaboratori/);
  });

  it("«Non posso»: ferma gli automatici e avvisa il PM; nuova scadenza fa ripartire da zero", async () => {
    await prisma.task.update({ where: { id: task2 }, data: { escalation: 1 } });
    await expect(reportBlocker(asPm(), task2, "boh", send)).rejects.toThrow(/Solo chi ha il task/);
    await reportBlocker(asMarco(), task2, "Aspetto le musiche dall'artista", send);
    const t = await prisma.task.findUniqueOrThrow({ where: { id: task2 } });
    expect(t).toMatchObject({ escalation: 3, blockerNote: "Aspetto le musiche dall'artista" });
    expect(mine().at(-1)?.subject).toContain("non può completare");

    await updateTask(asPm(), task2, taskInputSchema.parse({ title: "Export", assigneeId: marco.id, dueDate: "2026-10-05" }));
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task2 } })).toMatchObject({ escalation: 0, blockerNote: null });
  });
});
