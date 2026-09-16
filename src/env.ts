import { z } from "zod";

/**
 * Variabili d'ambiente lato server, validate alla prima lettura.
 * Lettura pigra: `next build` non fallisce se una variabile manca
 * in un contesto dove non serve.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_DEV_LOGIN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Variabili d'ambiente non valide:\n${issues}\nControlla il file .env (vedi .env.example).`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.AUTH_SECRET) {
    throw new Error("AUTH_SECRET è obbligatoria in produzione.");
  }
  cached = parsed.data;
  return cached;
}

/** Google OAuth è attivo solo se entrambe le credenziali sono presenti. */
export function isGoogleEnabled(): boolean {
  const e = env();
  return Boolean(e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET);
}

/** L'accesso di sviluppo non è mai attivo in produzione. */
export function isDevLoginEnabled(): boolean {
  const e = env();
  return e.NODE_ENV !== "production" && e.AUTH_DEV_LOGIN === "true";
}
