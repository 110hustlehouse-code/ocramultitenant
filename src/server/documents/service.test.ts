import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Company, type User } from "@/generated/prisma/client";
import { completeTask } from "@/server/projects/service";
import { testContext } from "@/test/context";
import {
  approveDocument,
  closeTaskWithDocument,
  confirmUpload,
  deleteDocument,
  DocumentError,
  listDocuments,
  requestUpload,
  resolveDownload,
  revertDocument,
  searchDocuments,
} from "./service";
import { canonicalName, fileCategory, groupKeyFor } from "./naming";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("documenti sul database", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const suffix = Date.now().toString(36);
  let tenantId: string;
  let duit: Company;
  let pm: User, marco: User, luca: User;
  let projectId: string;

  const ctxFor = (u: User, role: "CEO" | "PROJECT_MANAGER" | "CREATIVE") => {
    const c = testContext(prisma, tenantId, u.id, [[duit, role]]);
    return { ...c, user: { id: u.id, name: u.name, email: u.email }, tenant: { ...c.tenant, modules: ["PROGETTI", "DOCUMENTI"] } } as typeof c;
  };
  const asPm = () => ctxFor(pm, "PROJECT_MANAGER");
  const asMarco = () => ctxFor(marco, "CREATIVE");
  const asLuca = () => ctxFor(luca, "CREATIVE");
  const file = (name: string, size = 1024) => ({ name, type: "application/pdf", size });

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { slug: `doc-${suffix}`, name: "Doc", modules: ["PROGETTI", "DOCUMENTI"] } })).id;
    duit = await prisma.company.create({ data: { tenantId, slug: "duit", name: "Duit", colorLight: "#000000", colorDark: "#FFFFFF" } });
    const user = async (name: string, role: "CEO" | "PROJECT_MANAGER" | "CREATIVE") => {
      const u = await prisma.user.create({ data: { tenantId, email: `${name.toLowerCase()}-${suffix}@t.local`, name } });
      await prisma.membership.create({ data: { tenantId, userId: u.id, companyId: duit.id, role } });
      return u;
    };
    pm = await user("Giammarco", "PROJECT_MANAGER");
    marco = await user("Marco", "CREATIVE");
    luca = await user("Luca", "CREATIVE");
    projectId = (await prisma.project.create({ data: { tenantId, companyId: duit.id, name: "Sito web", managerId: pm.id } })).id;
    // Marco è nel team del progetto, Luca no.
    await prisma.projectMember.create({ data: { tenantId, projectId, userId: marco.id } });
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("naming: tipo file dedotto dall'estensione, nome canonico, gruppo per versioni", () => {
    expect(fileCategory("logo.ai")).toBe("Sorgente");
    expect(fileCategory("bozza.docx")).toBe("Documento");
    expect(fileCategory("misterioso.xyz")).toBe("File");
    expect(groupKeyFor("Logo Finale.AI")).toBe(groupKeyFor("logo finale.ai"));
    const name = canonicalName({ projectName: "Sito Web!", originalName: "bozza.pdf", version: 2, date: new Date("2026-09-30T10:00:00Z") });
    expect(name).toBe("SitoWeb_Documento_v2_2026-09-30.pdf");
  });

  it("carica chi gestisce la società o chi è nel team del progetto; un estraneo al progetto non lo vede nemmeno", async () => {
    const doc = await confirmUpload(asMarco(), projectId, `${tenantId}/documenti/${projectId}/x-a.pdf`, file("relazione.pdf"));
    expect(doc).toMatchObject({ originalName: "relazione.pdf", version: 1, status: "IN_LAVORAZIONE", uploadedById: marco.id });
    // Luca non è nel team e non ha task qui: stessa visibilità (o mancanza) dei progetti, riusata da projectScope.
    await expect(confirmUpload(asLuca(), projectId, `${tenantId}/documenti/${projectId}/x-b.pdf`, file("altra.pdf"))).rejects.toThrow(
      /Progetto non trovato/,
    );
    await expect(requestUpload(asLuca(), projectId, file("altra.pdf"))).rejects.toThrow(/Progetto non trovato/);
  });

  it("stesso nome file nello stesso progetto = nuova versione, mai sovrascritta", async () => {
    const v1 = await confirmUpload(asPm(), projectId, `${tenantId}/documenti/${projectId}/k1.psd`, file("locandina.psd"));
    const v2 = await confirmUpload(asPm(), projectId, `${tenantId}/documenti/${projectId}/k2.psd`, file("locandina.psd"));
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v1.groupKey).toBe(v2.groupKey);
    expect(v1.key).not.toBe(v2.key); // l'oggetto R2 della v1 resta

    const groups = await listDocuments(asPm(), projectId);
    const group = groups.find((g) => g.latest.groupKey === v1.groupKey)!;
    expect(group.latest.version).toBe(2);
    expect(group.history).toHaveLength(1);
    expect(group.history[0]!.version).toBe(1);
  });

  it("approvazione e cancellazione: solo chi gestisce la società, mai in automatico", async () => {
    const doc = await confirmUpload(asPm(), projectId, `${tenantId}/documenti/${projectId}/k3.pdf`, file("preventivo.pdf"));
    expect(doc.status).toBe("IN_LAVORAZIONE");

    await expect(approveDocument(asMarco(), doc.id)).rejects.toThrow(DocumentError);
    await approveDocument(asPm(), doc.id);
    let fresh = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(fresh).toMatchObject({ status: "APPROVATO", approvedById: pm.id });

    await revertDocument(asPm(), doc.id);
    fresh = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(fresh).toMatchObject({ status: "IN_LAVORAZIONE", approvedById: null });

    await expect(deleteDocument(asMarco(), doc.id)).rejects.toThrow(DocumentError);
    await deleteDocument(asPm(), doc.id);
    expect(await prisma.document.findUnique({ where: { id: doc.id } })).toBeNull();
  });

  it("ricerca per nome file, nel progetto e in tutta la società", async () => {
    await confirmUpload(asPm(), projectId, `${tenantId}/documenti/${projectId}/k4.pdf`, file(`Contratto-${suffix}.pdf`));
    const inProject = await listDocuments(asPm(), projectId, suffix);
    expect(inProject.some((g) => g.latest.originalName.includes(suffix))).toBe(true);

    const everywhere = await searchDocuments(asPm(), suffix);
    expect(everywhere.some((d) => d.project.id === projectId)).toBe(true);
    expect(await searchDocuments(asPm(), "a")).toEqual([]); // troppo corta, nessuna ricerca
  });

  it("un file caricato può chiudere il task: stessa regola di completeTask, link stabile come prova", async () => {
    const task = await prisma.task.create({ data: { tenantId, projectId, title: "Consegna PDF finale", assigneeId: marco.id } });
    const doc = await closeTaskWithDocument(asMarco(), task.id, `${tenantId}/documenti/${projectId}/k5.pdf`, file("consegna.pdf"));
    expect(doc.taskId).toBe(task.id);
    const fresh = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(fresh.status).toBe("FATTO");
    expect(fresh.proof).toBe(`http://localhost:3000/api/documenti/${doc.id}`);

    // Chiuso due volte non duplica: completeTask su un task già FATTO è un no-op.
    await expect(completeTask(asMarco(), task.id, "altro")).resolves.toBeUndefined();

    const { url: signed, name } = await resolveDownload(asPm(), doc.id);
    expect(signed).toContain(doc.key);
    expect(name).toBe(doc.displayName);
  });
});
