import { describe, expect, it } from "vitest";
import { memberInputSchema } from "./input";

const base = { email: "mario@t.local", name: "Mario Rossi", role: "CREATIVE", companyId: "c1", accessExpiresAt: "" };

describe("memberInputSchema", () => {
  it("normalizza l'email (spazi, maiuscole)", () => {
    const parsed = memberInputSchema.safeParse({ ...base, email: "  Mario@T.Local " });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.email).toBe("mario@t.local");
  });

  it("Esterno senza scadenza è rifiutato", () => {
    const parsed = memberInputSchema.safeParse({ ...base, role: "EXTERNAL", accessExpiresAt: "" });
    expect(parsed.success).toBe(false);
  });

  it("Esterno con scadenza va bene, data letta a mezzogiorno UTC", () => {
    const parsed = memberInputSchema.safeParse({ ...base, role: "EXTERNAL", accessExpiresAt: "2026-12-31" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.accessExpiresAt?.toISOString()).toBe("2026-12-31T12:00:00.000Z");
  });

  it("ruolo non valido è rifiutato", () => {
    expect(memberInputSchema.safeParse({ ...base, role: "ADMIN" }).success).toBe(false);
  });

  it("email non valida è rifiutata", () => {
    expect(memberInputSchema.safeParse({ ...base, email: "non-una-email" }).success).toBe(false);
  });
});
