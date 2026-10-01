/**
 * Import una tantum: clienti e fornitori reali di Fulcro Lucem e Duit, dagli export
 * Fatture in Cloud in docs/riferimenti/ (gitignored — mai committati: contengono P.IVA,
 * email e telefoni reali). Questo script legge quei file solo in locale; nessun dato
 * reale finisce nel codice sorgente.
 *
 * Uso: npx tsx scripts/import-anagrafiche-reali.ts
 * Sicuro da rilanciare: stessa identità (P.IVA, poi CF, poi nome) → aggiorna invece di duplicare.
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import * as XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import type { PartyKind } from "../src/generated/prisma/enums";
import { tenantExtension } from "../src/server/db/tenant";
import { identityKey, key } from "../src/server/registry/csv";
import { partyInputSchema, type PartyInput } from "../src/server/registry/input";
import {
  isValidSdi,
  isValidTaxCode,
  isValidVat,
  normalizePhone,
  normalizeSdi,
  normalizeTaxCode,
  normalizeVat,
} from "../src/lib/italian";

const BASE = "docs/riferimenti/DOCUMENTI PER OCRA - CARLO BARBONI";

const SOURCES: Array<{ file: string; companySlug: string; kind: PartyKind }> = [
  { file: `${BASE}/fulcro clienti - fornitori/fulcro lucem lista clienti - compilata.xlsx`, companySlug: "fulcro-lucem", kind: "CLIENTE" },
  { file: `${BASE}/fulcro clienti - fornitori/fulcro lucem lista fornitori - compilata.xlsx`, companySlug: "fulcro-lucem", kind: "FORNITORE" },
  { file: `${BASE}/duit clienti - fornitori/duit lista clienti - compilata.xlsx`, companySlug: "duit", kind: "CLIENTE" },
  { file: `${BASE}/duit clienti - fornitori/duit srl lista fornitori - compilata.xlsx`, companySlug: "duit", kind: "FORNITORE" },
];

/** Intestazioni dell'export Fatture in Cloud (normalizzate con la stessa key() dell'import CSV). */
const HEADER = {
  name: "denominazione",
  street: "indirizzo",
  comune: "comune",
  cap: "cap",
  prov: "provincia",
  email: "indirizzoemail",
  contact: "referente",
  phone: "telefono",
  vat: "pivataxid",
  taxCode: "codicefiscale",
  pec: "indirizzopec",
  sdi: "codicesdi",
  notes: "note",
} as const;

type RawRow = Record<keyof typeof HEADER, string>;

function readSheet(file: string): RawRow[] {
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.Export, { header: 1, defval: "" });
  const header = rows[0]!.map(key);
  const idx = Object.fromEntries(Object.entries(HEADER).map(([k, h]) => [k, header.indexOf(h)])) as Record<
    keyof typeof HEADER,
    number
  >;
  return rows
    .slice(1)
    .map((r) => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, i >= 0 ? String(r[i] ?? "").trim() : ""])) as RawRow)
    .filter((r) => r.name !== "");
}

function buildAddress(r: RawRow): string | null {
  const city = [[r.cap, r.comune].filter(Boolean).join(" "), r.prov ? `(${r.prov})` : ""].filter(Boolean).join(" ");
  const parts = [r.street, city].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Valida un campo opzionale da solo; se non valido lo scarta (null) invece di buttare l'intera riga. */
function safeField(raw: string, normalize: (v: string) => string, isValid: (v: string) => boolean): string | null {
  if (!raw) return null;
  return isValid(raw) ? normalize(raw) : null;
}
function safeEmail(raw: string): string | null {
  if (!raw) return null;
  const first = raw.split(/[;,]/)[0]!.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(first) ? first.toLowerCase() : null;
}

type Issue = { file: string; line: number; name: string; message: string };

function parseRows(file: string, kind: PartyKind, companyId: string, issues: Issue[]): PartyInput[] {
  const out: PartyInput[] = [];
  readSheet(file).forEach((r, i) => {
    const line = i + 2;
    const droppedFields: string[] = [];
    const vat = safeField(r.vat, normalizeVat, isValidVat);
    if (r.vat && !vat) droppedFields.push("P.IVA");
    const taxCode = safeField(r.taxCode, normalizeTaxCode, isValidTaxCode);
    if (r.taxCode && !taxCode) droppedFields.push("codice fiscale");
    const sdi = safeField(r.sdi, normalizeSdi, isValidSdi);
    if (r.sdi && !sdi) droppedFields.push("SDI");
    const pec = safeEmail(r.pec);
    if (r.pec && !pec) droppedFields.push("PEC");
    const email = safeEmail(r.email);
    if (r.email && !email) droppedFields.push("email");

    const candidate = {
      kind,
      name: r.name,
      address: buildAddress(r),
      vatNumber: vat,
      taxCode: taxCode,
      pec,
      sdiCode: sdi,
      contactName: r.contact || null,
      email,
      phone: r.phone ? normalizePhone(r.phone) : null,
      categories: [],
      notes: r.notes || null,
      companyIds: [companyId],
    };
    const parsed = partyInputSchema.safeParse(candidate);
    if (!parsed.success) {
      issues.push({ file, line, name: r.name, message: parsed.error.issues.map((e) => e.message).join(" · ") });
      return;
    }
    if (droppedFields.length) {
      issues.push({ file, line, name: r.name, message: `campi scartati (formato non valido): ${droppedFields.join(", ")}` });
    }
    out.push(parsed.data);
  });
  return out;
}

/** Unisce righe della stessa identità (P.IVA, poi CF, poi nome) tra le società: union dei companyIds,
 *  primo valore non vuoto vince sugli altri campi. */
function mergeByIdentity(rows: PartyInput[]): PartyInput[] {
  const byKey = new Map<string, PartyInput>();
  for (const row of rows) {
    const k = identityKey(row);
    const existing = byKey.get(k);
    if (!existing) {
      byKey.set(k, row);
      continue;
    }
    byKey.set(k, {
      ...existing,
      ...Object.fromEntries(Object.entries(row).filter(([f, v]) => v !== null && (existing as Record<string, unknown>)[f] == null)),
      companyIds: [...new Set([...existing.companyIds, ...row.companyIds])],
    } as PartyInput);
  }
  return [...byKey.values()];
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL mancante");
  const missing = SOURCES.filter((s) => !existsSync(s.file));
  if (missing.length) {
    console.error("File non trovati (attesi in locale, mai committati):");
    missing.forEach((s) => console.error(" -", s.file));
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "masini" } });
  const companies = await prisma.company.findMany({ where: { tenantId: tenant.id } });
  const companyId = new Map(companies.map((c) => [c.slug, c.id]));
  const db = prisma.$extends(tenantExtension(tenant.id));

  const issues: Issue[] = [];
  for (const kind of ["CLIENTE", "FORNITORE"] as const) {
    const rows = mergeByIdentity(
      SOURCES.filter((s) => s.kind === kind).flatMap((s) => parseRows(s.file, s.kind, companyId.get(s.companySlug)!, issues)),
    );

    const existing = await db.party.findMany({ where: { kinds: { has: kind } } });
    const byKey = new Map<string, (typeof existing)[number]>();
    for (const p of existing) {
      if (p.vatNumber) byKey.set(`vat:${p.vatNumber}`, p);
      if (p.taxCode) byKey.set(`cf:${p.taxCode}`, p);
      byKey.set(`name:${key(p.name)}`, p);
    }

    let created = 0;
    let updated = 0;
    for (const data of rows) {
      const match = byKey.get(identityKey(data)) ?? (data.taxCode ? byKey.get(`cf:${data.taxCode}`) : undefined) ?? byKey.get(`name:${key(data.name)}`);
      const fields = {
        name: data.name,
        address: data.address,
        vatNumber: data.vatNumber,
        taxCode: data.taxCode,
        pec: data.pec,
        sdiCode: data.sdiCode,
        contactName: data.contactName,
        email: data.email,
        phone: data.phone,
        categories: data.categories,
        notes: data.notes,
      };
      let partyId: string;
      if (match) {
        const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0)));
        await db.party.update({ where: { id: match.id }, data: patch });
        partyId = match.id;
        updated++;
      } else {
        const party = await db.party.create({ data: { kinds: [kind], ...fields, tenantId: tenant.id } });
        partyId = party.id;
        for (const k of [identityKey(data), `name:${key(data.name)}`]) byKey.set(k, party);
        created++;
      }
      await db.partyCompany.createMany({
        data: data.companyIds.map((cid) => ({ tenantId: tenant.id, partyId, companyId: cid })),
        skipDuplicates: true,
      });
    }
    console.log(`${kind}: creati ${created}, aggiornati ${updated} (di ${rows.length} righe valide)`);
  }

  if (issues.length) {
    console.log(`\n${issues.length} righe con problemi (importate parzialmente o scartate):`);
    for (const i of issues) console.log(`  ${i.file.split("/").pop()} riga ${i.line} «${i.name}»: ${i.message}`);
  }

  await prisma.$disconnect();
}

main();
