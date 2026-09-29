import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company, type User } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { testContext } from "@/test/context";
import { projectInputSchema, taskInputSchema } from "./input";
import {
  completeTask,
  createProject,
  createTask,
  getProject,
  listProjects,
  myOpenTasks,
  ProjectError,
  reopenTask,
  updateTask,
} from "./service";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("progetti e task sul database", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenantId: string;
  let fulcro: Company;
  let duit: Company;
  let ceo: User, pmDuit: User, creativo: User, altro: User;
  let projectId: string;

  const ctx = (u: User, roles: Array<[Company, Role]>, view?: string) => testContext(prisma, tenantId, u.id, roles, view);
  const asCeo = () => ctx(ceo, [[fulcro, "CEO"], [duit, "CEO"]], "duit");
  const asPm = () => ctx(pmDuit, [[duit, "PROJECT_MANAGER"]]);
  const asCreativo = () => ctx(creativo, [[fulcro, "CREATIVE"], [duit, "CREATIVE"]], "duit");
  const asAltro = () => ctx(altro, [[duit, "CREATIVE"]]);
  const task = (title: string, assigneeId: string | null) => taskInputSchema.parse({ title, assigneeId });

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { slug: `prj-${suffix}`, name: "Prj" } })).id;
    const co = (slug: string) =>
      prisma.company.create({ data: { tenantId, slug, name: slug, colorLight: "#000000", colorDark: "#FFFFFF" } });
    fulcro = await co("fulcro");
    duit = await co("duit");
    const user = async (name: string, roles: Array<[Company, Role]>) => {
      const u = await prisma.user.create({ data: { tenantId, email: `${name}-${suffix}@t.local`, name } });
      for (const [c, role] of roles) await prisma.membership.create({ data: { tenantId, userId: u.id, companyId: c.id, role } });
      return u;
    };
    ceo = await user("ceo", [[fulcro, "CEO"], [duit, "CEO"]]);
    pmDuit = await user("pm", [[duit, "PROJECT_MANAGER"]]);
    creativo = await user("creativo", [[fulcro, "CREATIVE"], [duit, "CREATIVE"]]);
    altro = await user("altro", [[duit, "CREATIVE"]]);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("il PM di Duit crea un progetto Duit, non uno Fulcro", async () => {
    const input = (companyId: string) =>
      projectInputSchema.parse({ name: "Videoclip Nora", companyId, code: "dt/video/01-2026/nora/e", managerId: pmDuit.id });
    await expect(createProject(asPm(), input(fulcro.id))).rejects.toThrow(ProjectError);
    const p = await createProject(asPm(), input(duit.id));
    expect(p.code).toBe("DT/VIDEO/01-2026/NORA/E");
    projectId = p.id;
    await expect(createProject(asPm(), input(duit.id))).rejects.toThrow(/già usato/);
  });

  it("non si assegna un task a chi non lavora con la società", async () => {
    const esterno = await prisma.user.create({ data: { tenantId, email: `x-${suffix}@t.local`, name: "X" } });
    await expect(createTask(asPm(), projectId, task("Montaggio", esterno.id))).rejects.toThrow(/non lavora/);
  });

  it("il collaboratore vede il progetto solo quando riceve un task, e solo i suoi task", async () => {
    expect(await listProjects(asCreativo(), "aperti")).toEqual([]);
    await createTask(asPm(), projectId, task("Montaggio v1", creativo.id));
    await createTask(asPm(), projectId, task("Color grading", altro.id));

    const visible = await listProjects(asCreativo(), "aperti");
    expect(visible.map((p) => p.name)).toEqual(["Videoclip Nora"]);
    const detail = await getProject(asCreativo(), projectId);
    expect(detail?.tasks.map((t) => t.title)).toEqual(["Montaggio v1"]);
    expect(detail?.canManage).toBe(false);

    const pmView = await getProject(asPm(), projectId);
    expect(pmView?.tasks).toHaveLength(2);
    expect(pmView?.members.map((m) => m.user.name).sort()).toEqual(["altro", "creativo", "pm"]);
  });

  it("chiusura: serve la prova; solo l'assegnatario o CEO/PM", async () => {
    const t = await prisma.task.findFirstOrThrow({ where: { tenantId, title: "Color grading" } });
    await expect(completeTask(asCreativo(), t.id, "https://drive.example/x")).rejects.toThrow(/non trovato/);
    await expect(completeTask(asAltro(), t.id, "  ")).rejects.toThrow(/prova/);
    await completeTask(asAltro(), t.id, "https://drive.example/color-v1.mp4");
    const done = await prisma.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(done).toMatchObject({ status: "FATTO", completedById: altro.id, proof: "https://drive.example/color-v1.mp4" });
    await reopenTask(asPm(), t.id);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("DA_FARE");
  });

  it("il collaboratore non modifica i task, il CEO sì", async () => {
    const t = await prisma.task.findFirstOrThrow({ where: { tenantId, title: "Montaggio v1" } });
    await expect(updateTask(asCreativo(), t.id, task("Montaggio v2", creativo.id))).rejects.toThrow(/Solo CEO e PM/);
    await updateTask(asCeo(), t.id, task("Montaggio v2", creativo.id));
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).title).toBe("Montaggio v2");
  });

  it("un task di Duit si chiude anche mentre si guarda Fulcro (link da «I miei task»)", async () => {
    const t = await createTask(asPm(), projectId, task("Export finale", creativo.id));
    const suFulcro = ctx(creativo, [[fulcro, "CREATIVE"], [duit, "CREATIVE"]], "fulcro");
    expect(await getProject(suFulcro, projectId)).not.toBeNull();
    await completeTask(suFulcro, t.id, "https://drive.example/export.mp4");
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("FATTO");
  });

  it("«I miei task» raccoglie i task aperti in tutte le società", async () => {
    const mine = await myOpenTasks(ctx(creativo, [[fulcro, "CREATIVE"], [duit, "CREATIVE"]], "fulcro"));
    expect(mine.map((t) => t.title)).toEqual(["Montaggio v2"]);
  });

  it("un altro tenant non vede niente", async () => {
    const other = await prisma.tenant.create({ data: { slug: `prj-o-${suffix}`, name: "O" } });
    const oc = await prisma.company.create({ data: { tenantId: other.id, slug: "o", name: "o", colorLight: "#000000", colorDark: "#FFFFFF" } });
    const ou = await prisma.user.create({ data: { tenantId: other.id, email: `o-${suffix}@t.local`, name: "o" } });
    const octx = testContext(prisma, other.id, ou.id, [[oc, "CEO"]]);
    expect(await getProject(octx, projectId)).toBeNull();
    await expect(
      prisma.task.create({ data: { tenantId: other.id, projectId, title: "intruso" } }),
    ).rejects.toThrow(/tenant diversi/);
    await prisma.tenant.delete({ where: { id: other.id } });
  });
});
