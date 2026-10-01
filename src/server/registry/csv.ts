import type { Company } from "@/generated/prisma/client";
import type { PartyKind } from "@/generated/prisma/enums";
import { partyInputSchema, splitList, type PartyInput } from "./input";

/**
 * Import CSV di clienti e fornitori. Funzioni pure: nessun accesso al DB.
 * Pensato per gli export di Excel italiano (separatore «;») e di Google Sheets («,»).
 */

type Field =
  | "name"
  | "address"
  | "vatNumber"
  | "taxCode"
  | "pec"
  | "sdiCode"
  | "contactName"
  | "email"
  | "phone"
  | "companies"
  | "categories"
  | "notes";

/** Intestazioni riconosciute (minuscole, senza accenti e punteggiatura). */
const HEADER_ALIASES: Record<string, Field> = {
  ragionesociale: "name",
  denominazione: "name",
  nome: "name",
  nomecognome: "name",
  cliente: "name",
  fornitore: "name",
  indirizzo: "address",
  indirizzocompleto: "address",
  via: "address",
  piva: "vatNumber",
  partitaiva: "vatNumber",
  pi: "vatNumber",
  vat: "vatNumber",
  cf: "taxCode",
  codicefiscale: "taxCode",
  pec: "pec",
  sdi: "sdiCode",
  codicesdi: "sdiCode",
  codiceunivoco: "sdiCode",
  codicedestinatario: "sdiCode",
  referente: "contactName",
  email: "email",
  mail: "email",
  emailreferente: "email",
  cell: "phone",
  cellulare: "phone",
  telefono: "phone",
  tel: "phone",
  societa: "companies",
  societadiriferimento: "companies",
  socdiriferimento: "companies",
  categoria: "categories",
  categorie: "categories",
  categoriamerceologica: "categories",
  categoriemerceologiche: "categories",
  categoria1: "categories",
  categoria2: "categories",
  categoria3: "categories",
  note: "notes",
};

/** Colonne del modello scaricabile, nell'ordine. */
export const TEMPLATE_HEADERS = [
  "Ragione sociale",
  "Indirizzo",
  "P.IVA",
  "Codice fiscale",
  "PEC",
  "SDI",
  "Referente",
  "Email",
  "Cellulare",
  "Società di riferimento",
  "Categoria 1",
  "Categoria 2",
  "Categoria 3",
  "Note",
];

export const key = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Parser CSV (RFC 4180): virgolette, a capo dentro i campi, BOM. Separatore dedotto dalla prima riga. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Trova una società dal testo della cella: nome, ragione sociale, slug o prefisso PO. */
export function matchCompany(value: string, companies: Company[]): Company | undefined {
  const k = key(value);
  if (!k) return undefined;
  return companies.find((c) =>
    [c.name, c.legalName ?? "", c.slug, c.poPrefix ?? ""].some((candidate) => {
      const ck = key(candidate);
      return ck !== "" && (ck === k || key(candidate.replace(/\s*s\.?r\.?l\.?s?\.?$/i, "")) === k);
    }),
  );
}

export type ImportRow = { line: number; data: PartyInput };
export type ImportIssue = { line: number; message: string };
export type ParsedImport = { rows: ImportRow[]; issues: ImportIssue[]; unknownHeaders: string[] };

/**
 * Da testo CSV a righe validate.
 * @param companies società tra cui l'utente può scegliere (quelle dove può scrivere)
 * @param defaultCompanyIds usate quando la colonna «Società» è vuota o assente
 */
export function parsePartiesCsv(
  input: string,
  kind: PartyKind,
  companies: Company[],
  defaultCompanyIds: string[],
): ParsedImport {
  const [header, ...body] = parseCsv(input);
  if (!header) return { rows: [], issues: [{ line: 1, message: "Il file è vuoto." }], unknownHeaders: [] };

  const columns = header.map((h) => HEADER_ALIASES[key(h)] ?? null);
  const unknownHeaders = header.filter((h, i) => h.trim() !== "" && columns[i] === null);
  if (!columns.includes("name")) {
    return {
      rows: [],
      issues: [{ line: 1, message: "Manca la colonna «Ragione sociale». Scarica il modello e riprova." }],
      unknownHeaders,
    };
  }

  const rows: ImportRow[] = [];
  const issues: ImportIssue[] = [];

  body.forEach((cells, index) => {
    const line = index + 2;
    const raw: Partial<Record<Field, string[]>> = {};
    columns.forEach((field, i) => {
      const value = cells[i]?.trim();
      if (!field || !value) return;
      (raw[field] ??= []).push(value);
    });
    const one = (f: Field) => raw[f]?.join(" ");

    const companyIds: string[] = [];
    for (const token of (raw.companies ?? []).flatMap((v) => splitList(v))) {
      const company = matchCompany(token, companies);
      if (!company) {
        issues.push({ line, message: `Società «${token}» non riconosciuta o non accessibile.` });
        return;
      }
      companyIds.push(company.id);
    }

    const parsed = partyInputSchema.safeParse({
      kinds: [kind],
      name: one("name") ?? "",
      address: one("address"),
      vatNumber: one("vatNumber"),
      taxCode: one("taxCode"),
      pec: one("pec"),
      sdiCode: one("sdiCode"),
      contactName: one("contactName"),
      email: one("email"),
      phone: one("phone"),
      categories: (raw.categories ?? []).flatMap((v) => splitList(v)),
      notes: one("notes"),
      companyIds: companyIds.length > 0 ? [...new Set(companyIds)] : defaultCompanyIds,
    });

    if (parsed.success) rows.push({ line, data: parsed.data });
    else issues.push({ line, message: parsed.error.issues.map((i) => i.message).join(" · ") });
  });

  return { rows, issues, unknownHeaders };
}

/** Chiave per riconoscere la stessa anagrafica fra import successivi. */
export function identityKey(p: Pick<PartyInput, "vatNumber" | "taxCode" | "name">): string {
  if (p.vatNumber) return `vat:${p.vatNumber}`;
  if (p.taxCode) return `cf:${p.taxCode}`;
  return `name:${key(p.name)}`;
}

export function templateCsv(): string {
  return `﻿${TEMPLATE_HEADERS.join(";")}\r\n`;
}
