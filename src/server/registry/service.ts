import "server-only";
import type { Company, Prisma } from "@/generated/prisma/client";
import type { PartyKind } from "@/generated/prisma/enums";
import { can } from "@/server/auth/permissions";
import type { AppContext } from "@/server/context";
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
    where: { kind, ...visibleWhere(ctx), ...search },
    include: { companies: { select: { companyId: true } } },
    orderBy: { name: "asc" },
    take: 500,
  });
}

export async function countParties(ctx: AppContext) {
  const rows = await ctx.db.party.groupBy({ by: ["kind"], where: visibleWhere(ctx), _count: true });
  return {
    CLIENTE: rows.find((r) => r.kind === "CLIENTE")?._count ?? 0,
    FORNITORE: rows.find((r) => r.kind === "FORNITORE")?._count ?? 0,
  };
}

export async function getParty(ctx: AppContext, id: string) {
  return ctx.db.party.findFirst({
    where: { id, companies: { some: { companyId: { in: ctx.companies.map((c) => c.id) } } } },
    include: { companies: { select: { companyId: true } } },
  });
}

export class RegistryError extends Error {}

const fields = (d: PartyInput) => ({
  name: d.name,
  vatNumber: d.vatNumber,
  taxCode: d.taxCode,
  pec: d.pec,
  sdiCode: d.sdiCode,
  contactName: d.contactName,
  email: d.email,
  phone: d.phone,
  categories: d.categories,
  notes: d.notes,
});

function assertWritable(ctx: AppContext, companyIds: string[]) {
  const allowed = new Set(writableCompanies(ctx).map((c) => c.id));
  if (companyIds.some((id) => !allowed.has(id))) {
    throw new RegistryError("Non puoi assegnare anagrafiche a questa società.");
  }
}

async function findDuplicate(ctx: AppContext, d: PartyInput, excludeId?: string) {
  const or: Prisma.PartyWhereInput[] = [];
  if (d.vatNumber) or.push({ vatNumber: d.vatNumber });
  if (d.taxCode) or.push({ taxCode: d.taxCode });
  if (or.length === 0) return null;
  return ctx.db.party.findFirst({
    where: { kind: d.kind, OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true },
  });
}

export async function createParty(ctx: AppContext, d: PartyInput) {
  assertWritable(ctx, d.companyIds);
  const dup = await findDuplicate(ctx, d);
  if (dup) throw new RegistryError(`Esiste già: ${dup.name}. Aprila e aggiungi la società da lì.`);
  return ctx.db.$transaction(async (tx) => {
    const party = await tx.party.create({ data: { kind: d.kind, ...fields(d), tenantId: ctx.tenant.id } });
    await tx.partyCompany.createMany({
      data: d.companyIds.map((companyId) => ({ tenantId: ctx.tenant.id, partyId: party.id, companyId })),
    });
    return party;
  });
}

export async function updateParty(ctx: AppContext, id: string, d: PartyInput) {
  const current = await getParty(ctx, id);
  if (!current) throw new RegistryError("Anagrafica non trovata.");
  assertWritable(ctx, d.companyIds);
  const dup = await findDuplicate(ctx, d, id);
  if (dup) throw new RegistryError(`P.IVA o codice fiscale già usati da: ${dup.name}.`);

  // Tocca solo i collegamenti alle società che l'utente gestisce; gli altri restano.
  const writable = new Set(writableCompanies(ctx).map((c) => c.id));
  const toRemove = current.companies.map((c) => c.companyId).filter((cid) => writable.has(cid) && !d.companyIds.includes(cid));
  const remaining = current.companies.filter((c) => !toRemove.includes(c.companyId)).length;
  const toAdd = d.companyIds.filter((cid) => !current.companies.some((c) => c.companyId === cid));
  if (remaining + toAdd.length === 0) throw new RegistryError("Serve almeno una società di riferimento.");

  await ctx.db.$transaction(async (tx) => {
    await tx.party.update({ where: { id }, data: fields(d) });
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
 * Salva le righe importate. Stessa anagrafica (P.IVA, CF o nome) → aggiorna i campi
 * presenti nel file senza cancellare quelli già compilati, e aggiunge le società.
 */
export async function importParties(ctx: AppContext, kind: PartyKind, rows: ImportRow[]): Promise<ImportResult> {
  assertWritable(ctx, [...new Set(rows.flatMap((r) => r.data.companyIds))]);
  const existing = await ctx.db.party.findMany({ where: { kind } });
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
            Object.entries(fields(data)).filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0)),
          );
          await tx.party.update({ where: { id: match.id }, data: patch });
          partyId = match.id;
          updated++;
        } else {
          const party = await tx.party.create({ data: { kind, ...fields(data), tenantId: ctx.tenant.id } });
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
