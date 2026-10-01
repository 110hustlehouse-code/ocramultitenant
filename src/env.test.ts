import { afterEach, describe, expect, it, vi } from "vitest";

/** Modulo reimportato a fresco: `env()` memorizza il risultato, i test non devono condividerlo. */
async function freshEnv() {
  vi.resetModules();
  return import("./env");
}

describe("isDevLoginEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("attivo in sviluppo locale con AUTH_DEV_LOGIN=true", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_DEV_LOGIN", "true");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", "postgres://x/y");
    const { isDevLoginEnabled } = await freshEnv();
    expect(isDevLoginEnabled()).toBe(true);
  });

  it("spento in produzione anche con AUTH_DEV_LOGIN=true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DEV_LOGIN", "true");
    vi.stubEnv("AUTH_SECRET", "x");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("DATABASE_URL", "postgres://x/y");
    const { isDevLoginEnabled } = await freshEnv();
    expect(isDevLoginEnabled()).toBe(false);
  });

  it("spento su un host Vercel anche se NODE_ENV e AUTH_DEV_LOGIN sono sbagliati per errore", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_DEV_LOGIN", "true");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATABASE_URL", "postgres://x/y");
    const { isDevLoginEnabled } = await freshEnv();
    expect(isDevLoginEnabled()).toBe(false);
  });
});
