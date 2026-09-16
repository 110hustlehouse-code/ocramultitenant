import { describe, expect, it } from "vitest";
import type { Company } from "@/generated/prisma/client";
import { resolveCompanyView } from "./selection";

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
  sortOrder: 0,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const companies = [company("fulcro-lucem"), company("duit")];

describe("selettore società", () => {
  it("usa la società richiesta se esiste", () => {
    const view = resolveCompanyView(companies, "duit", false);
    expect(view).toMatchObject({ kind: "company", company: { slug: "duit" } });
  });

  it("ripiega sulla prima se lo slug non è valido", () => {
    const view = resolveCompanyView(companies, "altro-tenant", false);
    expect(view).toMatchObject({ kind: "company", company: { slug: "fulcro-lucem" } });
  });

  it("la vista consolidata richiede il permesso", () => {
    expect(resolveCompanyView(companies, "all", true)).toEqual({ kind: "all" });
    expect(resolveCompanyView(companies, "all", false)).toMatchObject({ kind: "company" });
  });

  it("nessuna società: null", () => {
    expect(resolveCompanyView([], undefined, true)).toBeNull();
  });
});
