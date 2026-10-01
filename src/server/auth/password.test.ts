import { describe, expect, it } from "vitest";
import { hashPassword, isLockedOut, verifyPassword } from "./password";

describe("password con bcryptjs", () => {
  it("hash e verifica: corretta passa, sbagliata no", async () => {
    const hash = await hashPassword("una-password-robusta");
    expect(hash).not.toBe("una-password-robusta");
    expect(await verifyPassword("una-password-robusta", hash)).toBe(true);
    expect(await verifyPassword("un-altra-password", hash)).toBe(false);
  });

  it("due hash della stessa password sono diversi (salt), ma verificano entrambi", async () => {
    const a = await hashPassword("ripetuta123");
    const b = await hashPassword("ripetuta123");
    expect(a).not.toBe(b);
    expect(await verifyPassword("ripetuta123", a)).toBe(true);
    expect(await verifyPassword("ripetuta123", b)).toBe(true);
  });
});

describe("lockout", () => {
  const now = new Date("2026-10-01T12:00:00Z");

  it("nessuna scadenza impostata: non bloccato", () => {
    expect(isLockedOut({ lockedUntil: null }, now)).toBe(false);
  });

  it("scadenza nel futuro: bloccato; nel passato: non più", () => {
    expect(isLockedOut({ lockedUntil: new Date("2026-10-01T12:05:00Z") }, now)).toBe(true);
    expect(isLockedOut({ lockedUntil: new Date("2026-10-01T11:55:00Z") }, now)).toBe(false);
  });
});
