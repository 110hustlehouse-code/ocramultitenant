import { describe, expect, it } from "vitest";
import { rateLimited } from "./rate-limit";

describe("rateLimited", () => {
  it("lascia passare fino al limite, poi blocca", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimited(key, 3, 60_000)).toBe(false);
    expect(rateLimited(key, 3, 60_000)).toBe(true);
  });

  it("chiavi diverse non si influenzano", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 3; i++) rateLimited(a, 3, 60_000);
    expect(rateLimited(a, 3, 60_000)).toBe(true);
    expect(rateLimited(b, 3, 60_000)).toBe(false);
  });

  it("la finestra scade: dopo windowMs si riparte da zero", async () => {
    const key = `window-${Math.random()}`;
    expect(rateLimited(key, 1, 20)).toBe(false);
    expect(rateLimited(key, 1, 20)).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(rateLimited(key, 1, 20)).toBe(false);
  });
});
