import "server-only";
import type { Company, Prisma } from "@/generated/prisma/client";
import type { PartyKind } from "@/generated/prisma/enums";
import { isValidTaxCode, isValidVat, normalizeTaxCode, normalizeVat } from "@/lib/italian";
import { can } from "@/server/auth/permissions";
import type { AppContext } from "@/server/context";
import { ALL_PARTY_KINDS } from "./input";
import { identityKey, key, type ImportRow } from "./csv";
import type { PartyInput } from "./input";

/** Società mostrate nella vista corrente (una, oppure quelle del consolidato). */
export function viewCompanies(ctx: AppContext): Company[] {
  return ctx.view.kind === "company" ? [ctx.view.company] : ctx.view.companies;
}

/** Società in cui l'utente può creare o modificare anagrafiche. */
export function writableCompanies(ctx: AppContext): Company[] {
  return ctx.access.filter((a) => can(a.role, "registry:write")).map((a) => a.company);
}

/** L'utente gestisce i dati economici (IBAN, documento fiscale, termini, valutazioni) in almeno una delle società indicate? */
export function canWriteFinance(ctx: AppContext, companyIds: string[]): boolean {
  return companyIds.some((id) => {
    const role = ctx.access.find((a) => a.company.id === id)?.role;
    return role !== undefined && can(role, "finance:write");
  });
}

const visibleWhere = (ctx: AppContext): Prisma.PartyWhereInput => ({
  companies: { some: { companyId: { in: viewCompanies(ctx).map((c) => c.id) } } },
});

export async function listParties(ctx: AppContext, kind: PartyKind, query: string) {
  const q = query.trim();
  const search: Prisma.PartyWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { vatNumber: { contains: q.replace(/\s/g, "") } },
          { taxCode: { contains: q.replace(/\s/g, "").toUpperCase() } },
          { contactName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { categories: { has: q } },
        ],
      }
    : {};
  return ctx.db.party.findMany({
    where: { kinds: { has: kind }, ...visibleWhere(ctx), ...search },
    include: { companies: { select: { companyId: true } } },
    orderBy: { name: "asc" },
    take: 500,
  });
}

export async function countParties(ctx: AppContext) {
  const where = visibleWhere(ctx);
  const counts = await Promise.all(
    ALL_PARTY_KINDS.map((kind) => ctx.db.party.count({ where: { ...where, kinds: { has: kind } } })),
  );
  return Object.fromEntries(ALL_PARTY_KINDS.map((kind, i) => [kind, counts[i]!])) as Record<PartyKind, number>;
}

export async function getParty(ctx: AppContext, id: string) {
  return ctx.db.party.findFirst({
    where: { id, companies: { some: { companyId: { in: ctx.companies.map((c) => c.id) } } } },
    include: { companies: { select: { companyId: true } } },
  });
}

export class RegistryError extends Error {}

/**
 * Si prova a creare un'anagrafica che esiste già (stessa P.IVA/CF, qualunque ruolo): l'utente
 * può aggiungere il ruolo mancante a quella esistente invece di crearne una seconda.
 */
export class PartyConflictError extends RegistryError {
  constructor(
    public readonly partyId: string,
    public readonly partyName: string,
    public readonly missingKinds: PartyKind[],
  ) {
    super(`Esiste già: ${partyName}.`);
  }
}

const generalFields = (d: PartyInput) => ({
  name: d.name,
  address: d.address,
  vatNumber: d.vatNumber,
  taxCode: d.taxCode,
  pec: d.pec,
  sdiCode: d.sdiCode,
  contactName: d.contactName,
  email: d.email,
  phone: d.phone,
  categories: d.categories,
  notes: d.notes,
  availabilityNote: d.availabilityNote,
});

/** Dati amministrativi: mai scritti da chi non ha finance:write, nemmeno a null per errore. */
const adminFields = (d: PartyInput) => ({
  paymentIban: d.paymentIban,
  paymentHolder: d.paymentHolder,
  fiscalDocumentType: d.fiscalDocumentType,
  paymentTerms: d.paymentTerms,
});

function writeFields(ctx: AppContext, d: PartyInput) {
  return { ...generalFields(d), ...(canWriteFinance(ctx, d.companyIds) ? adminFields(d) : {}) };
}

function assertWritable(ctx: AppContext, companyIds: string[]) {
  const allowed = new Set(writableCompanies(ctx).map((c) => c.id));
  if (companyIds.some((id) => !allowed.has(id))) {
    throw new RegistryError("Non puoi assegnare anagrafiche a questa società.");
  }
}

/**
 * Stessa P.IVA o CF, in QUALUNQUE ruolo (non solo lo stesso `kind`): un'anagrafica è unica nel
 * gruppo a prescindere da quanti ruoli ha. Così un Fornitore con la P.IVA di un Cliente già
 * censito viene riconosciuto, invece di produrre una seconda riga silenziosa.
 */
async function findDuplicate(ctx: AppContext, d: Pick<PartyInput, "vatNumber" | "taxCode">, excludeId?: string) {
  const or: Prisma.PartyWhereInput[] = [];
  if (d.vatNumber) or.push({ vatNumber: d.vatNumber });
  if (d.taxCode) or.push({ taxCode: d.taxCode });
  if (or.length === 0) return null;
  return ctx.db.party.findFirst({
    where: { OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true, kinds: true },
  });
}

/**
 * Controllo duplicati indipendente dal resto del form: usato PRIMA della validazione completa,
 * così chi scrive solo la P.IVA per vedere se l'anagrafica esiste già ottiene una risposta anche
 * se non ha ancora compilato la ragione sociale (bug reale: altrimenti "nome obbligatorio" nasconde
 * il conflitto, perché partyInputSchema valida tutto il form prima che si arrivi al controllo P.IVA).
 * `null` = nessun conflitto da segnalare qui (o perché non c'è duplicato, o perché i ruoli richiesti
 * ci sono già tutti: in quel caso ci pensa la validazione normale a dare il messaggio giusto).
 */
export async function checkPartyConflict(
  ctx: AppContext,
  raw: { vatNumber?: string | null; taxCode?: string | null },
  requestedKinds: PartyKind[],
  excludeId?: string,
): Promise<PartyConflictError | null> {
  const vat = raw.vatNumber?.trim() ? normalizeVat(raw.vatNumber) : null;
  const cf = raw.taxCode?.trim() ? normalizeTaxCode(raw.taxCode) : null;
  const vatOk = vat && isValidVat(vat) ? vat : null;
  const cfOk = cf && isValidTaxCode(cf) ? cf : null;
  if (!vatOk && !cfOk) return null;
  const dup = await findDuplicate(ctx, { vatNumber: vatOk, taxCode: cfOk }, excludeId);
  if (!dup) return null;
  const missingKinds = requestedKinds.filter((k) => !dup.kinds.includes(k));
  if (missingKinds.length === 0) return null;
  return new PartyConflictError(dup.id, dup.name, missingKinds);
}

export async function createParty(ctx: AppContext, d: PartyInput) {
  assertWritable(ctx, d.companyIds);
  const dup = await findDuplicate(ctx, d);
  if (dup) {
    const missingKinds = d.kinds.filter((k) => !dup.kinds.includes(k));
    if (missingKinds.length === 0) throw new RegistryError(`Esiste già: ${dup.name}. Aprila e aggiungi la società da lì.`);
    throw new PartyConflictError(dup.id, dup.name, missingKinds);
  }
  return ctx.db.$transaction(async (tx) => {
    const party = await tx.party.create({ data: { kinds: d.kinds, ...writeFields(ctx, d), tenantId: ctx.tenant.id } });
    await tx.partyCompany.createMany({
      data: d.companyIds.map((companyId) => ({ tenantId: ctx.tenant.id, partyId: party.id, companyId })),
    });
    return party;
  });
}

/** Aggiunge uno o più ruoli a un'anagrafica esistente (dalla proposta di conflitto in creazione). */
export async function addPartyKinds(ctx: AppContext, partyId: string, kinds: PartyKind[]): Promise<void> {
  const current = await getParty(ctx, partyId);
  if (!current) throw new RegistryError("Anagrafica non trovata.");
  const writable = new Set(writableCompanies(ctx).map((c) => c.id));
  if (!current.companies.some((c) => writable.has(c.companyId))) {
    throw new RegistryError("Non puoi modificare questa anagrafica.");
  }
  const merged = [...new Set([...current.kinds, ...kinds])];
  await ctx.db.party.update({ where: { id: partyId }, data: { kinds: merged } });
}

export async function updateParty(ctx: AppContext, id: string, d: PartyInput) {
  const current = await getParty(ctx, id);
  if (!current) throw new RegistryError("Anagrafica non trovata.");
  assertWritable(ctx, d.companyIds);
  const dup = await findDuplicate(ctx, d, id);
  if (dup) {
    const missingKinds = d.kinds.filter((k) => !dup.kinds.includes(k));
    if (missingKinds.length === 0) throw new RegistryError(`P.IVA o codice fiscale già usati da: ${dup.name}.`);
    throw new PartyConflictError(dup.id, dup.name, missingKinds);
  }

  // Tocca solo i collegamenti alle società che l'utente gestisce; gli altri restano.
  const writable = new Set(writableCompanies(ctx).map((c) => c.id));
  const toRemove = current.companies.map((c) => c.companyId).filter((cid) => writable.has(cid) && !d.companyIds.includes(cid));
  const remaining = current.companies.filter((c) => !toRemove.includes(c.companyId)).length;
  const toAdd = d.companyIds.filter((cid) => !current.companies.some((c) => c.companyId === cid));
  if (remaining + toAdd.length === 0) throw new RegistryError("Serve almeno una società di riferimento.");

  await ctx.db.$transaction(async (tx) => {
    await tx.party.update({ where: { id }, data: { kinds: d.kinds, ...writeFields(ctx, d) } });
    if (toRemove.length) await tx.partyCompany.deleteMany({ where: { partyId: id, companyId: { in: toRemove } } });
    if (toAdd.length) {
      await tx.partyCompany.createMany({
        data: toAdd.map((companyId) => ({ tenantId: ctx.tenant.id, partyId: id, companyId })),
        skipDuplicates: true,
      });
    }
  });
}

export async function deleteParty(ctx: AppContext, id: string) {
  const current = await getParty(ctx, id);
  if (!current) throw new RegistryError("Anagrafica non trovata.");
  const writable = new Set(writableCompanies(ctx).map((c) => c.id));
  const mine = current.companies.map((c) => c.companyId).filter((cid) => writable.has(cid));
  if (mine.length === 0) throw new RegistryError("Non puoi eliminare questa anagrafica.");
  // Se la usano anche altre società, si toglie solo il collegamento alle mie.
  if (mine.length < current.companies.length) {
    await ctx.db.partyCompany.deleteMany({ where: { partyId: id, companyId: { in: mine } } });
    return "unlinked" as const;
  }
  await ctx.db.party.deleteMany({ where: { id } });
  return "deleted" as const;
}

export type ImportResult = { created: number; updated: number };

/**
 * Salva le righe importate. Stessa anagrafica (P.IVA, CF o nome), in qualunque ruolo → aggiorna
 * i campi presenti nel file senza cancellare quelli già compilati, aggiunge il ruolo importato se
 * mancava e aggiunge le società. Diversamente dalla creazione singola, qui non si chiede conferma
 * riga per riga: l'unione del ruolo è automatica, come lo è già l'aggiornamento degli altri campi.
 */
export async function importParties(ctx: AppContext, kind: PartyKind, rows: ImportRow[]): Promise<ImportResult> {
  assertWritable(ctx, [...new Set(rows.flatMap((r) => r.data.companyIds))]);
  const existing = await ctx.db.party.findMany();
  const byKey = new Map<string, (typeof existing)[number]>();
  for (const p of existing) {
    if (p.vatNumber) byKey.set(`vat:${p.vatNumber}`, p);
    if (p.taxCode) byKey.set(`cf:${p.taxCode}`, p);
    byKey.set(`name:${key(p.name)}`, p);
  }

  let created = 0;
  let updated = 0;
  await ctx.db.$transaction(
    async (tx) => {
      for (const { data } of rows) {
        const match =
          byKey.get(identityKey(data)) ??
          (data.taxCode ? byKey.get(`cf:${data.taxCode}`) : undefined) ??
          byKey.get(`name:${key(data.name)}`);
        let partyId: string;
        if (match) {
          const patch = Object.fromEntries(
            Object.entries(writeFields(ctx, data)).filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0)),
          );
          const kinds = match.kinds.includes(kind) ? undefined : [...match.kinds, kind];
          await tx.party.update({ where: { id: match.id }, data: { ...patch, ...(kinds ? { kinds } : {}) } });
          partyId = match.id;
          updated++;
        } else {
          const party = await tx.party.create({ data: { kinds: [kind], ...writeFields(ctx, data), tenantId: ctx.tenant.id } });
          partyId = party.id;
          for (const k of [identityKey(data), `name:${key(data.name)}`]) byKey.set(k, party);
          created++;
        }
        await tx.partyCompany.createMany({
          data: data.companyIds.map((companyId) => ({ tenantId: ctx.tenant.id, partyId, companyId })),
          skipDuplicates: true,
        });
      }
    },
    { timeout: 60_000 },
  );
  return { created, updated };
}
