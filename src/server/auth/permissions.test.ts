import { describe, expect, it } from "vitest";
import { can, hasValidAccess, PERMISSIONS } from "./permissions";

describe("permessi per ruolo", () => {
  it("il CEO ha tutti i permessi", () => {
    for (const p of PERMISSIONS) expect(can("CEO", p)).toBe(true);
  });

  it("solo il CEO vede i dati economici e la vista consolidata", () => {
    for (const role of ["PROJECT_MANAGER", "CREATIVE", "EXTERNAL"] as const) {
      expect(can(role, "finance:read")).toBe(false);
      expect(can(role, "company:consolidated")).toBe(false);
      expect(can(role, "hardblock:manage")).toBe(false);
    }
  });

  it("il PM vede tutti i task, il creativo no", () => {
    expect(can("PROJECT_MANAGER", "tasks:read:all")).toBe(true);
    expect(can("CREATIVE", "tasks:read:all")).toBe(false);
  });
});

describe("validità dell'accesso", () => {
  const now = new Date("2026-09-15T10:00:00Z");
  const base = { role: "CREATIVE" as const, active: true, accessExpiresAt: null };

  it("utente attivo senza scadenza: ok", () => {
    expect(hasValidAccess(base, now)).toBe(true);
  });

  it("utente disattivato: negato", () => {
    expect(hasValidAccess({ ...base, active: false }, now)).toBe(false);
  });

  it("esterno senza scadenza: negato", () => {
    expect(hasValidAccess({ ...base, role: "EXTERNAL" }, now)).toBe(false);
  });

  it("esterno con scadenza futura: ok, scaduta: negato", () => {
    const ext = { ...base, role: "EXTERNAL" as const };
    expect(hasValidAccess({ ...ext, accessExpiresAt: new Date("2026-09-16T00:00:00Z") }, now)).toBe(true);
    expect(hasValidAccess({ ...ext, accessExpiresAt: now }, now)).toBe(false);
  });
});
