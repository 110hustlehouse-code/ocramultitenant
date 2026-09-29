import { describe, expect, it } from "vitest";
import type { Company } from "@/generated/prisma/client";
import { identityKey, matchCompany, parseCsv, parsePartiesCsv, templateCsv } from "./csv";

const company = (id: string, name: string, legalName: string, poPrefix: string): Company => ({
  id,
  tenantId: "t1",
  slug: id,
  name,
  legalName,
  vatNumber: null,
  colorLight: "#000000",
  colorDark: "#FFFFFF",
  logoUrl: null,
  logoBg: null,
  pec: null,
  sdiCode: null,
  reaNumber: null,
  legalAddress: null,
  legalRepresentative: null,
  poPrefix,
  sortOrder: 0,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const fulcro = company("fulcro-lucem", "Fulcro Lucem", "Fulcro Lucem S.r.l.", "FL");
const duit = company("duit", "Duit", "Duit S.r.l.", "DT");
const companies = [fulcro, duit];

describe("parser CSV", () => {
  it("riconosce «;» (Excel italiano) e «,», virgolette e a capo nei campi", () => {
    expect(parseCsv('a;b\r\n"x;1";"riga\nnuova"\r\n')).toEqual([["a", "b"], ["x;1", "riga\nnuova"]]);
    expect(parseCsv('a,b\n"Rossi, Mario",2\n')).toEqual([["a", "b"], ["Rossi, Mario", "2"]]);
  });
  it("ignora BOM e righe vuote", () => {
    expect(parseCsv("﻿a;b\n\n;\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("il modello scaricabile si rilegge senza colonne ignorate", () => {
    const r = parsePartiesCsv(templateCsv(), "CLIENTE", companies, [fulcro.id]);
    expect(r.unknownHeaders).toEqual([]);
    expect(r.rows).toEqual([]);
  });
});

describe("società nella cella", () => {
  it("per nome, ragione sociale, sigla PO o slug, senza badare a maiuscole", () => {
    expect(matchCompany("FULCRO LUCEM SRL", companies)?.id).toBe("fulcro-lucem");
    expect(matchCompany("dt", companies)?.id).toBe("duit");
    expect(matchCompany("Duit S.r.l.", companies)?.id).toBe("duit");
    expect(matchCompany("St'Art", companies)).toBeUndefined();
  });
});

describe("import anagrafiche", () => {
  const csv = [
    "Ragione sociale;P.IVA;PEC;SDI;Referente;Email;Cell;Soc. di riferimento;Categoria 1;Categoria 2;Colonna strana",
    "Zètema Progetto Cultura;IT 16633211004;info@PEC.it;m5uxcr1;Anna Bianchi;ANNA@zetema.it;331 1234567;FL | DT;Cultura;Eventi;x",
    "Mario Rossi;;;;;;;;;;",
  ].join("\n");

  it("normalizza i campi e collega le società", () => {
    const r = parsePartiesCsv(csv, "CLIENTE", companies, [fulcro.id]);
    expect(r.issues).toEqual([]);
    expect(r.unknownHeaders).toEqual(["Colonna strana"]);
    expect(r.rows[0]?.data).toMatchObject({
      name: "Zètema Progetto Cultura",
      vatNumber: "16633211004",
      taxCode: "16633211004",
      pec: "info@pec.it",
      sdiCode: "M5UXCR1",
      email: "anna@zetema.it",
      phone: "+393311234567",
      categories: ["Cultura", "Eventi"],
      companyIds: ["fulcro-lucem", "duit"],
    });
  });

  it("senza società nella riga usa quella predefinita", () => {
    const r = parsePartiesCsv(csv, "CLIENTE", companies, [duit.id]);
    expect(r.rows[1]?.data.companyIds).toEqual(["duit"]);
  });

  it("segnala errori con il numero di riga del file", () => {
    const bad = "Ragione sociale;P.IVA;Società\nAlfa;12345678901;FL\nBeta;;St'Art\n;;FL";
    const r = parsePartiesCsv(bad, "FORNITORE", companies, [fulcro.id]);
    expect(r.rows).toEqual([]);
    expect(r.issues.map((i) => i.line)).toEqual([2, 3, 4]);
    expect(r.issues[0]?.message).toMatch(/P\.IVA/);
    expect(r.issues[1]?.message).toMatch(/St'Art/);
  });

  it("più di 3 categorie: errore", () => {
    const r = parsePartiesCsv("Ragione sociale;Categorie\nAlfa;a,b,c,d", "CLIENTE", companies, [fulcro.id]);
    expect(r.issues[0]?.message).toMatch(/3 categorie/);
  });

  it("senza colonna ragione sociale non parte", () => {
    const r = parsePartiesCsv("P.IVA\n16633211004", "CLIENTE", companies, [fulcro.id]);
    expect(r.issues[0]?.message).toMatch(/Ragione sociale/);
  });

  it("identità: P.IVA, poi codice fiscale, poi nome", () => {
    expect(identityKey({ vatNumber: "1", taxCode: "X", name: "A" })).toBe("vat:1");
    expect(identityKey({ vatNumber: null, taxCode: "X", name: "A" })).toBe("cf:X");
    expect(identityKey({ vatNumber: null, taxCode: null, name: " Rossi, Mario " })).toBe("name:rossimario");
  });
});
