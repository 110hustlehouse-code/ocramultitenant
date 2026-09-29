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
  // Verbali: Claude scrive il verbale ed estrae i task
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
  // Trascrizione audio
  DEEPGRAM_API_KEY: z.string().optional(),
  DEEPGRAM_MODEL: z.string().default("nova-3"),
  // Archivio file (Cloudflare R2, compatibile S3)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  // Email dei richiami: SMTP di Google Workspace (password per le app)
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** Mittente, es. "OCRA Fulcro <ocra@fulcrolucem.com>" */
  SMTP_FROM: z.string().optional(),
  /** Protegge l'endpoint che il pianificatore chiama ogni ora */
  CRON_SECRET: z.string().optional(),
  /** Indirizzo dell'app per i link nelle email, se il tenant non ha un dominio */
  APP_URL: z.string().default("http://localhost:3000"),
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

/** Integrazioni configurate: le pagine mostrano solo le funzioni che possono funzionare. */
export function integrations() {
  const e = env();
  return {
    ai: Boolean(e.ANTHROPIC_API_KEY),
    transcription: Boolean(e.DEEPGRAM_API_KEY),
    storage: Boolean(e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET),
    email: Boolean(e.SMTP_USER && e.SMTP_PASS),
  };
}
