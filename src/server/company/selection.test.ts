import { describe, expect, it } from "vitest";
import type { Company } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { canInView, consolidatedCompanies, resolveCompanyView, type CompanyAccess } from "./selection";

const company = (slug: string): Company => ({
  id: slug,
  tenantId: "t1",
  slug,
  name: slug,
  legalName: null,
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
  poPrefix: null,
  sortOrder: 0,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const access = (...pairs: Array<[string, Role]>): CompanyAccess[] =>
  pairs.map(([slug, role]) => ({ company: company(slug), role }));

// Daniele: CEO ovunque. Erika: CEO(O) su Fulcro e St'Art, niente Duit. Giammarco: PM di Duit.
const daniele = access(["fulcro-lucem", "CEO"], ["duit", "CEO"], ["start-factory", "CEO"]);
const erika = access(["fulcro-lucem", "CEO"], ["start-factory", "CEO"]);
const giammarco = access(["duit", "PROJECT_MANAGER"]);
const misto = access(["fulcro-lucem", "CEO"], ["duit", "PROJECT_MANAGER"]);

describe("selettore società", () => {
  it("usa la società richiesta, con il ruolo che l'utente ha lì", () => {
    expect(resolveCompanyView(misto, "duit")).toMatchObject({ kind: "company", company: { slug: "duit" }, role: "PROJECT_MANAGER" });
    expect(resolveCompanyView(misto, "fulcro-lucem")).toMatchObject({ role: "CEO" });
  });

  it("una società senza accesso non si apre: ripiega sulla prima accessibile", () => {
    expect(resolveCompanyView(erika, "duit")).toMatchObject({ kind: "company", company: { slug: "fulcro-lucem" } });
    expect(resolveCompanyView(giammarco, "fulcro-lucem")).toMatchObject({ company: { slug: "duit" } });
  });

  it("nessuna società: null", () => {
    expect(resolveCompanyView([], undefined)).toBeNull();
  });
});

describe("vista consolidata", () => {
  it("include solo le società dove l'utente è CEO", () => {
    expect(consolidatedCompanies(daniele).map((c) => c.slug)).toEqual(["fulcro-lucem", "duit", "start-factory"]);
    expect(consolidatedCompanies(erika).map((c) => c.slug)).toEqual(["fulcro-lucem", "start-factory"]);
  });

  it("con una sola società consolidabile non esiste", () => {
    expect(consolidatedCompanies(misto)).toEqual([]);
    expect(resolveCompanyView(misto, "all")).toMatchObject({ kind: "company" });
    expect(resolveCompanyView(giammarco, "all")).toMatchObject({ kind: "company" });
  });

  it("Erika consolida Fulcro e St'Art, mai Duit", () => {
    const view = resolveCompanyView(erika, "all");
    expect(view?.kind).toBe("all");
    if (view?.kind === "all") expect(view.companies.map((c) => c.slug)).not.toContain("duit");
  });
});

describe("permessi nella vista", () => {
  it("dipendono dalla società guardata", () => {
    const suDuit = resolveCompanyView(misto, "duit")!;
    const suFulcro = resolveCompanyView(misto, "fulcro-lucem")!;
    expect(canInView(suDuit, misto, "finance:read")).toBe(false);
    expect(canInView(suFulcro, misto, "finance:read")).toBe(true);
  });

  it("nel consolidato vale solo ciò che è permesso in ogni società inclusa", () => {
    const view = resolveCompanyView(daniele, "all")!;
    expect(canInView(view, daniele, "finance:read")).toBe(true);
  });
});
