/**
 * Dati iniziali — idempotente: si può rilanciare senza duplicare nulla.
 * Tenant 1: il gruppo di Daniele Masini (Fulcro Lucem, Duit, St'Art Factory).
 * Tenant 2: «Aurora», agenzia inventata per le demo di vendita (ocragency.shop).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type ModuleKey, type Role } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL mancante");

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const DAY = 24 * 60 * 60 * 1000;

const MODULES: ModuleKey[] = ["ANAGRAFICHE", "PROGETTI", "VERBALI", "RICHIAMO", "SOLLECITI", "DOCUMENTI", "MARGINE", "PREVENTIVI", "COLLABORATORI"];

/**
 * Tenant, società e listino reali del gruppo Masini — nessun utente, nessun dato di test.
 * Usata sia dal seed di sviluppo (sotto, con gli utenti @ocra.local) sia da quello di
 * produzione (prisma/seed-production.ts, che si ferma qui).
 */
export async function seedMasiniCore() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "masini" },
    update: { modules: MODULES },
    create: {
      slug: "masini",
      name: "Gruppo Masini",
      domain: "ocra.fulcrolucem.it",
      modules: MODULES,
    },
  });

  // Colori: *Light per tema chiaro (scuriti per contrasto), *Dark per tema scuro.
  const companies = [
    {
      slug: "fulcro-lucem",
      name: "Fulcro Lucem",
      legalName: "Fulcro Lucem S.r.l.",
      vatNumber: "16633211004",
      pec: "fulcrolucem@pec.it",
      sdiCode: "M5UXCR1",
      reaNumber: "RM-1666755",
      legalAddress: "Via Antonio Bennicelli 50, 00151 Roma (RM)",
      legalRepresentative: "Chiara Giovagnorio",
      poPrefix: "FL",
      colorLight: "#8F0AFF",
      colorDark: "#B066FF",
      logoUrl: "/brands/fulcro-lucem.png",
      logoBg: "#FFFFFF",
      // IBAN e piè di pagina del preventivo: li inserisce il CEO da «Impostazioni società».
      sortOrder: 1,
    },
    {
      slug: "duit",
      name: "Duit",
      legalName: "Duit S.r.l.",
      vatNumber: "18051641001",
      pec: "duitsrl@pec.it",
      sdiCode: "M5UXCR1",
      reaNumber: "RM-1758535",
      legalAddress: "Via Antonio Bennicelli 50, 00151 Roma (RM)",
      legalRepresentative: "Daniele Masini",
      poPrefix: "DT",
      colorLight: "#C24A00",
      colorDark: "#FF6304",
      logoUrl: "/brands/duit.png",
      logoBg: "#FF6301",
      // I preventivi reali di Duit non usano colore (nero/grigio): il PDF resta neutro,
      // colorLight/colorDark restano per il resto dell'app (branding, tema).
      pdfAccent: false,
      // IBAN e piè di pagina del preventivo: li inserisce il CEO da «Impostazioni società».
      sortOrder: 2,
    },
    {
      slug: "start-factory",
      name: "St'Art Factory",
      legalName: "St'Art Factory",
      colorLight: "#1195BC",
      colorDark: "#3ED7FB",
      logoUrl: "/brands/start-factory.png",
      logoBg: "#090909",
      // Nessun preventivo reale ancora disponibile: ripiego sullo stile neutro di Duit.
      pdfAccent: false,
      sortOrder: 3,
    },
  ];

  for (const c of companies) {
    await prisma.company.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: c.slug } },
      update: c,
      create: { ...c, tenantId: tenant.id },
    });
  }
  const bySlug = new Map(
    (await prisma.company.findMany({ where: { tenantId: tenant.id } })).map((c) => [c.slug, c.id]),
  );
  // Preventivi di Fulcro: la numerazione riparte dal 30 (roadmap). Mai all'indietro se è già avanti.
  await prisma.company.updateMany({
    where: { tenantId: tenant.id, slug: "fulcro-lucem", nextQuoteNumber: { lt: 30 } },
    data: { nextQuoteNumber: 30 },
  });
  // Listino vero di Fulcro Lucem (da "listino servizi aggiornato.pdf", letto 30 set): prezzi "a partire da",
  // IVA esclusa. Duit e St'Art non hanno ancora un listino reale: lo inseriscono loro da Preventivi → Listino.
  // Il seed è la fonte di verità: ogni rilancio sostituisce il catalogo con questo elenco.
  const fulcroServices: Array<[name: string, poCode: string, unit: string, price: number, description: string]> = [
    ["Business Audit", "BUSINESS", "forfait", 3000, "Business Strategy, Business Model, Market Development → documento strategico con roadmap"],
    ["Development Program", "BUSINESS", "forfait", 10000, "Business Strategy, Business Plan, Partnership, Operational, Administrative & Legal, People Development"],
    ["Development Partnership", "BUSINESS", "mese", 3000, "Fulcro da consulente a partner: Development Program continuativo + supporto strategico, network, coordinamento"],
    ["Project Development", "BUSINESS", "forfait", 7000, "Percorso alternativo: analisi, posizionamento, partnership, project management e legal, tutto incluso"],
    ["Creative Direction", "CREATIVE", "forfait", 2000, "Concept creativo, vision, moodboard, reference, direzione estetica, linguaggio creativo"],
    ["Brand Development", "CREATIVE", "forfait", 5000, "Naming, brand positioning, identità visiva, logo system, guidelines, tone of voice, storytelling"],
    ["Campaign Development", "CREATIVE", "forfait", 4000, "Big idea, concept campagna, art direction, shooting concept, video concept, web concept"],
    ["Experience Development", "CREATIVE", "forfait", 4500, "Concept evento, format culturali, exhibition, installazioni, esperienze immersive, attivazioni"],
    ["Marketing Strategy", "MARKETING", "forfait", 2000, "Analisi audience, customer journey, strategia canali, piano marketing, KPI, obiettivi"],
    ["Comunication Strategy", "MARKETING", "forfait", 3000, "Comunicazione offline, editorial planning, promozione offline, PR strategy"],
    ["Launch Strategy", "MARKETING", "forfait", 4000, "Per brand, prodotti, artisti e progetti: piano lancio, attivazioni, partnership"],
    ["Growth Management", "MARKETING", "mese", 1500, "Accompagnamento continuativo: analisi risultati, ottimizzazione strategie, fidelizzazione"],
    ["Founders Program", "FOUNDERS", "mese", 450, "×12 mesi — percorso Foundation → Build → Scale per 10 founder selezionati, alto potenziale"],
    ["Foundraising", "FOUNDRAISING", "forfait", 1000, "+ 15% sul risultato — sponsorship, bandi, investitori privati, business angel, crowdfunding, VC, finanza agevolata"],
  ];
  const fulcroId = bySlug.get("fulcro-lucem")!;
  await prisma.serviceItem.deleteMany({ where: { companyId: fulcroId } });
  await prisma.serviceItem.createMany({
    data: fulcroServices.map(([name, poCode, unit, price, description], i) => ({
      tenantId: tenant.id,
      companyId: fulcroId,
      name,
      poCode,
      unit,
      unitPrice: price * 100,
      description,
      sortOrder: i,
    })),
  });

  return { tenant, bySlug, companiesCount: companies.length };
}

const ALL = ["fulcro-lucem", "duit", "start-factory"] as const;
type Seat = { email: string; name: string; access: Partial<Record<(typeof ALL)[number], Role>>; accessExpiresAt?: Date };
const everywhere = (role: Role) => Object.fromEntries(ALL.map((slug) => [slug, role]));

/**
 * Utenti di sviluppo (@ocra.local) con un ruolo per società: mai in produzione.
 * Usa SEED_OWNER_EMAIL per aggiungersi come CEO in locale, senza committare la propria email.
 */
async function seedMasiniDevUsers(tenant: { id: string; name: string }, bySlug: Map<string, string>) {
  const users: Seat[] = [
    { email: "daniele@ocra.local", name: "Daniele Masini", access: everywhere("CEO") },
    // Erika è "CEOO" di Fulcro e St'Art (e PM di Fulcro): da CEO vede anche i numeri. Duit no.
    { email: "erika@ocra.local", name: "Erika Nardini", access: { "fulcro-lucem": "CEO", "start-factory": "CEO" } },
    { email: "miele@ocra.local", name: "Miele", access: { "start-factory": "PROJECT_MANAGER" } },
    { email: "giammarco@ocra.local", name: "Giammarco", access: { duit: "PROJECT_MANAGER" } },
    { email: "creativo@ocra.local", name: "Videomaker Demo", access: everywhere("CREATIVE") },
    {
      email: "esterno@ocra.local",
      name: "Fornitore Esterno",
      access: { duit: "EXTERNAL" },
      accessExpiresAt: new Date(Date.now() + 30 * DAY),
    },
  ];

  const owner = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  if (owner) users.push({ email: owner, name: "Carlo", access: everywhere("CEO") });

  for (const { access, ...u } of users) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: { name: u.name, accessExpiresAt: u.accessExpiresAt ?? null, active: true },
      create: { ...u, tenantId: tenant.id },
    });
    // Le società del seed sono la verità: via gli accessi non previsti, poi upsert.
    await prisma.membership.deleteMany({
      where: { userId: user.id, company: { slug: { notIn: Object.keys(access) } } },
    });
    for (const [slug, role] of Object.entries(access)) {
      const companyId = bySlug.get(slug);
      if (!companyId) throw new Error(`Società "${slug}" mancante nel seed`);
      await prisma.membership.upsert({
        where: { userId_companyId: { userId: user.id, companyId } },
        update: { role },
        create: { tenantId: tenant.id, userId: user.id, companyId, role },
      });
    }
  }

  return { usersCount: users.length };
}

/** Seed di sviluppo: dati reali + utenti @ocra.local + tenant demo. Mai in produzione. */
async function main() {
  const { tenant, bySlug, companiesCount } = await seedMasiniCore();
  const { usersCount } = await seedMasiniDevUsers(tenant, bySlug);
  console.log(`✓ Seed completato: tenant "${tenant.name}", ${companiesCount} società, ${usersCount} utenti.`);
}

/**
 * Demo di vendita: stesso prodotto, dati inventati. Nomi e referenti sono di fantasia;
 * le P.IVA restano vuote per non mostrare per sbaglio numeri di aziende reali.
 */
async function seedDemo() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: { modules: MODULES },
    create: { slug: "demo", name: "Aurora (demo)", domain: "ocragency.shop", modules: MODULES },
  });

  const companies = [
    { slug: "aurora-studio", name: "Aurora Studio", legalName: "Aurora Studio S.r.l.", poPrefix: "AS", colorLight: "#6D28D9", colorDark: "#A78BFA", sortOrder: 1 },
    { slug: "aurora-produzioni", name: "Aurora Produzioni", legalName: "Aurora Produzioni S.r.l.", poPrefix: "AP", colorLight: "#C2410C", colorDark: "#FB923C", sortOrder: 2 },
    { slug: "aurora-music", name: "Aurora Music", legalName: "Aurora Music S.r.l.", poPrefix: "AM", colorLight: "#0E7490", colorDark: "#22D3EE", sortOrder: 3 },
  ];
  const ids = new Map<string, string>();
  for (const c of companies) {
    const row = await prisma.company.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: c.slug } },
      update: c,
      create: { ...c, tenantId: tenant.id },
    });
    ids.set(c.poPrefix, row.id);
  }

  // Listino demo (prezzi inventati), solo se la società non ne ha ancora uno.
  const TERMS = "50% alla firma del contratto, saldo a 30 giorni dalla consegna. Prezzi IVA esclusa.";
  const catalog: Record<string, Array<[name: string, poCode: string, unit: string, price: number, cost: number | null, description?: string]>> = {
    AS: [
      ["Brand identity", "BRAND", "forfait", 6500, 2800, "Logo, palette, tipografia e manuale d'uso"],
      ["Direzione creativa", "BRAND", "giorno", 650, 300],
      ["Piano editoriale social", "COMUNIC", "mese", 1200, 550, "Calendario, testi e grafiche per 12 post"],
      ["Servizio fotografico", "COMUNIC", "giorno", 1400, 700],
      ["Stampa materiali", "BRAND", "forfait", 800, 600, "Coordinamento con la tipografia"],
    ],
    AP: [
      ["Produzione evento", "EVENTI", "giorno", 1800, 900, "Coordinamento, regia e squadra tecnica"],
      ["Service audio e luci", "EVENTI", "giorno", 2400, 1700],
      ["Riprese video", "VIDEO", "giorno", 1500, 750, "Due operatori, attrezzatura inclusa"],
      ["Montaggio video", "VIDEO", "giorno", 600, 280],
      ["Sopralluogo tecnico", "EVENTI", "forfait", 350, 120],
    ],
    AM: [
      ["Strategia di lancio", "LANCIO", "forfait", 3500, 1400, "Posizionamento, calendario e canali"],
      ["Videoclip", "VIDEO", "forfait", 9000, 5200],
      ["Ufficio stampa", "LANCIO", "mese", 1500, 600],
      ["Campagna social a pagamento", "LANCIO", "mese", 900, 350, "Gestione, budget media escluso"],
    ],
  };
  for (const [prefix, items] of Object.entries(catalog)) {
    const companyId = ids.get(prefix)!;
    await prisma.company.update({ where: { id: companyId }, data: { quoteTerms: TERMS } });
    if (await prisma.serviceItem.count({ where: { companyId } })) continue;
    await prisma.serviceItem.createMany({
      data: items.map(([name, poCode, unit, price, cost, description], i) => ({
        tenantId: tenant.id,
        companyId,
        name,
        poCode,
        unit,
        unitPrice: price * 100,
        unitCost: cost === null ? null : cost * 100,
        description: description ?? null,
        sortOrder: i,
      })),
    });
  }

  const users: Array<{ email: string; name: string; role: Role }> = [
    { email: "ceo@demo.ocra.local", name: "Giulia Ferri", role: "CEO" },
    { email: "pm@demo.ocra.local", name: "Luca Moretti", role: "PROJECT_MANAGER" },
    { email: "creativo@demo.ocra.local", name: "Sara Conti", role: "CREATIVE" },
  ];
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: { name: u.name, active: true },
      create: { tenantId: tenant.id, email: u.email, name: u.name },
    });
    for (const companyId of ids.values()) {
      await prisma.membership.upsert({
        where: { userId_companyId: { userId: user.id, companyId } },
        update: { role: u.role },
        create: { tenantId: tenant.id, userId: user.id, companyId, role: u.role },
      });
    }
  }

  type DemoParty = { name: string; contact: string; email: string; cats: string[]; at: string[] };
  const clients: DemoParty[] = [
    { name: "Fondazione Teatro Nuovo", contact: "Elena Galli", email: "eventi@teatronuovo.example", cats: ["Cultura", "Eventi"], at: ["AS", "AP"] },
    { name: "Birrificio Monteverde", contact: "Paolo Riva", email: "marketing@birrificio.example", cats: ["Food & beverage"], at: ["AS"] },
    { name: "Comune di Valleverde", contact: "Ufficio Cultura", email: "cultura@valleverde.example", cats: ["Pubblica amministrazione"], at: ["AP"] },
    { name: "Nora Vale", contact: "Nora Vale", email: "nora@noravale.example", cats: ["Artista"], at: ["AM"] },
    { name: "Atelier Sartori", contact: "Marta Sartori", email: "marta@ateliersartori.example", cats: ["Moda"], at: ["AS"] },
    { name: "Festival Luci d'Estate", contact: "Davide Bassi", email: "info@lucidestate.example", cats: ["Eventi", "Musica"], at: ["AP", "AM"] },
  ];
  const suppliers: DemoParty[] = [
    { name: "Service Audio Luci Roma", contact: "Franco Leoni", email: "preventivi@servicealr.example", cats: ["Service", "Noleggi"], at: ["AP"] },
    { name: "Tipografia Rapida", contact: "Silvia Neri", email: "ordini@tiporapida.example", cats: ["Stampa"], at: ["AS", "AP"] },
    { name: "Marco Villa", contact: "Marco Villa", email: "marco@villavideo.example", cats: ["Videomaker"], at: ["AP"] },
    { name: "Studio Grafico Linea", contact: "Irene Fabbri", email: "irene@linea.example", cats: ["Grafica"], at: ["AS"] },
    { name: "Catering Tavola Viva", contact: "Rosa Greco", email: "eventi@tavolaviva.example", cats: ["Catering"], at: ["AP"] },
  ];
  for (const [kind, list] of [["CLIENTE", clients], ["FORNITORE", suppliers]] as const) {
    for (const p of list) {
      const existing = await prisma.party.findFirst({ where: { tenantId: tenant.id, kinds: { has: kind }, name: p.name } });
      const data = { name: p.name, contactName: p.contact, email: p.email, categories: p.cats };
      const party = existing
        ? await prisma.party.update({ where: { id: existing.id }, data })
        : await prisma.party.create({ data: { ...data, kinds: [kind], tenantId: tenant.id } });
      await prisma.partyCompany.createMany({
        data: p.at.map((prefix) => ({ tenantId: tenant.id, partyId: party.id, companyId: ids.get(prefix)! })),
        skipDuplicates: true,
      });
    }
  }
  // Progetti e task: date relative a oggi, così la demo mostra sempre scadenze vive.
  const day = (offset: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + offset, 12));
  const people = new Map(
    (await prisma.user.findMany({ where: { tenantId: tenant.id } })).map((u) => [u.email.split("@")[0], u.id]),
  );
  const partyId = async (name: string) =>
    (await prisma.party.findFirst({ where: { tenantId: tenant.id, name }, select: { id: true } }))?.id ?? null;

  type DemoTask = { title: string; who: string; due: number; done?: string; priority?: "NORMALE" | "ALTA" | "URGENTE" };
  const projects: Array<{ code: string; name: string; at: string; client: string; service: string; start: number; due: number; tasks: DemoTask[] }> = [
    {
      code: "AP/EVENTI/03-2026/TEATRONUOVO/E", name: "Stagione Teatro Nuovo — serata di apertura", at: "AP",
      client: "Fondazione Teatro Nuovo", service: "Produzione evento", start: -20, due: 12,
      tasks: [
        { title: "Sopralluogo tecnico con il service", who: "pm", due: -6, done: "Verbale sopralluogo nel Drive, cartella 01" },
        { title: "Preventivo service audio e luci", who: "pm", due: -2, priority: "URGENTE" },
        { title: "Piano di produzione v1", who: "pm", due: 3 },
        { title: "Teaser video 15 secondi", who: "creativo", due: 5, priority: "ALTA" },
      ],
    },
    {
      code: "AS/BRAND/07-2026/SARTORI/E", name: "Rebranding Atelier Sartori", at: "AS",
      client: "Atelier Sartori", service: "Brand development", start: -35, due: 20,
      tasks: [
        { title: "Moodboard e direzione estetica", who: "creativo", due: -15, done: "https://drive.example/sartori/moodboard.pdf" },
        { title: "Proposte logo (2)", who: "creativo", due: -1 },
        { title: "Tone of voice: prima bozza", who: "pm", due: 8 },
      ],
    },
    {
      code: "AM/LANCIO/02-2026/NORAVALE/E", name: "Lancio singolo Nora Vale", at: "AM",
      client: "Nora Vale", service: "Launch strategy", start: -10, due: 28,
      tasks: [
        { title: "Dati di distribuzione dall'artista", who: "pm", due: 4 },
        { title: "Copertina definitiva", who: "creativo", due: 9 },
      ],
    },
  ];
  for (const p of projects) {
    const data = {
      name: p.name, companyId: ids.get(p.at)!, clientId: await partyId(p.client), service: p.service,
      startDate: day(p.start), dueDate: day(p.due), managerId: people.get("pm") ?? null, status: "ATTIVO" as const,
    };
    const project = await prisma.project.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: p.code } },
      update: data,
      create: { ...data, code: p.code, tenantId: tenant.id },
    });
    // I task demo si rigenerano a ogni seed: date sempre fresche.
    await prisma.task.deleteMany({ where: { projectId: project.id } });
    for (const t of p.tasks) {
      const assigneeId = people.get(t.who)!;
      await prisma.task.create({
        data: {
          tenantId: tenant.id, projectId: project.id, title: t.title, assigneeId, dueDate: day(t.due),
          priority: t.priority ?? "NORMALE",
          ...(t.done ? { status: "FATTO" as const, proof: t.done, completedAt: day(t.due), completedById: assigneeId } : {}),
        },
      });
      await prisma.projectMember.createMany({
        data: [{ tenantId: tenant.id, projectId: project.id, userId: assigneeId }],
        skipDuplicates: true,
      });
    }
  }

  // Verbali demo: uno confermato e uno da rivedere, per mostrare il flusso anche senza chiavi AI.
  const teatro = await prisma.project.findFirstOrThrow({ where: { tenantId: tenant.id, code: projects[0]!.code } });
  const sartori = await prisma.project.findFirstOrThrow({ where: { tenantId: tenant.id, code: projects[1]!.code } });
  await prisma.meeting.deleteMany({ where: { tenantId: tenant.id } });
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  await prisma.meeting.create({
    data: {
      tenantId: tenant.id,
      companyId: sartori.companyId,
      projectId: sartori.id,
      title: "Allineamento rebranding Sartori",
      heldAt: day(0),
      durationSec: 1860,
      createdById: people.get("pm"),
      status: "DA_RIVEDERE",
      transcript:
        "[00:02] Voce 1: Allora, sul rebranding di Sartori siamo in ritardo sulle proposte logo.\n" +
        "[00:15] Voce 2: Sara, le due proposte riesci a mandarle entro giovedì?\n" +
        "[00:21] Voce 3: Sì, giovedì le carico sul Drive.\n" +
        "[01:40] Voce 1: Luca, tu senti Marta Sartori per fissare la presentazione, meglio la settimana prossima.\n" +
        "[02:05] Voce 2: E ci serve il preventivo della tipografia per il biglietto da visita, urgente.",
      minutes:
        "## Partecipanti\n- Giulia Ferri, Luca Moretti, Sara Conti\n\n## Punti discussi\n- Ritardo sulle proposte logo per Atelier Sartori\n- Presentazione al cliente\n- Stampa dei biglietti da visita\n\n## Decisioni\n- Le due proposte logo vanno consegnate entro giovedì\n- La presentazione a Marta Sartori si fissa la settimana prossima\n\n## Prossimi passi\n- Sara: proposte logo sul Drive\n- Luca: fissare la presentazione e chiedere il preventivo alla tipografia",
      proposals: [
        { key: "p0", title: "Caricare le 2 proposte logo sul Drive", assigneeId: people.get("creativo") ?? null, assigneeMention: "Sara", projectId: sartori.id, dueDate: iso(day(2)), priority: "ALTA", evidence: "giovedì le carico sul Drive" },
        { key: "p1", title: "Fissare la presentazione con Marta Sartori", assigneeId: people.get("pm") ?? null, assigneeMention: "Luca", projectId: sartori.id, dueDate: iso(day(7)), priority: "NORMALE", evidence: "senti Marta Sartori per fissare la presentazione" },
        { key: "p2", title: "Chiedere preventivo tipografia per biglietti da visita", assigneeId: null, assigneeMention: null, projectId: sartori.id, dueDate: null, priority: "URGENTE", evidence: "ci serve il preventivo della tipografia… urgente" },
      ],
    },
  });
  const confirmed = await prisma.meeting.create({
    data: {
      tenantId: tenant.id,
      companyId: teatro.companyId,
      projectId: teatro.id,
      title: "Kick-off serata di apertura",
      heldAt: day(-20),
      durationSec: 2700,
      createdById: people.get("pm"),
      status: "CONFERMATO",
      confirmedAt: day(-20),
      minutes:
        "## Partecipanti\n- Giulia Ferri, Luca Moretti, Sara Conti\n\n## Punti discussi\n- Formato della serata e tempi di allestimento\n- Materiali video per la promozione\n\n## Decisioni\n- Sopralluogo tecnico entro due settimane\n- Teaser video da 15 secondi per i social\n\n## Prossimi passi\n- Luca: sopralluogo e preventivo service\n- Sara: teaser video",
    },
  });
  await prisma.task.updateMany({
    where: { projectId: teatro.id, title: { in: ["Sopralluogo tecnico con il service", "Teaser video 15 secondi"] } },
    data: { meetingId: confirmed.id, source: "VERBALE" },
  });

  // Richiami demo: un task già passato al PM e un «Non posso», per mostrare la pagina Richiami.
  const pmId = people.get("pm")!;
  const sara = people.get("creativo")!;
  const late = await prisma.task.findFirst({ where: { tenantId: tenant.id, title: "Proposte logo (2)" } });
  if (late) {
    await prisma.task.update({ where: { id: late.id }, data: { escalation: 3, lastReminderAt: day(0) } });
    await prisma.reminder.deleteMany({ where: { taskId: late.id } });
    await prisma.reminder.createMany({
      data: [
        { tenantId: tenant.id, taskId: late.id, recipientId: sara, kind: "AUTOMATICO", level: 1, delivered: true, createdAt: day(-1) },
        { tenantId: tenant.id, taskId: late.id, recipientId: sara, kind: "AUTOMATICO", level: 2, delivered: true, createdAt: day(-1) },
        { tenantId: tenant.id, taskId: late.id, recipientId: pmId, kind: "AL_PM", level: 3, delivered: true, createdAt: day(0) },
      ],
    });
  }
  const stuck = await prisma.task.findFirst({ where: { tenantId: tenant.id, title: "Copertina definitiva" } });
  if (stuck) {
    await prisma.task.update({
      where: { id: stuck.id },
      data: { escalation: 3, blockerNote: "Aspetto da Nora le foto definitive per la copertina", blockerAt: day(0) },
    });
  }

  console.log(
    `✓ Demo: tenant "${tenant.name}", ${clients.length} clienti, ${suppliers.length} fornitori, ${projects.length} progetti, 2 verbali, richiami.`,
  );
}

// Si auto-esegue solo quando lanciato direttamente (`tsx prisma/seed.ts`), non quando
// prisma/seed-production.ts importa seedMasiniCore da qui.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(seedDemo)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
