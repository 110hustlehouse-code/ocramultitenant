import "server-only";

/**
 * Limite in memoria, per istanza del processo: non persiste tra deploy o istanze
 * serverless diverse, ma rallenta un abuso scriptato dalla stessa richiesta.
 * Difesa in profondità, non l'unica barriera — login e webhook restano protetti
 * da credenziali/token a prescindere da questo limite.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

let sweepCounter = 0;
/** Tiene la mappa limitata: ogni tanto butta via i bucket scaduti. */
function sweep(now: number) {
  if (++sweepCounter % 500 !== 0) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** `true` se la chiave ha superato il limite nella finestra corrente. */
export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count++;
  return bucket.count > limit;
}

/** Limita per IP del chiamante + nome della rotta. */
export function rateLimitRequest(req: Request, routeKey: string, limit: number, windowMs: number): boolean {
  return rateLimited(`${routeKey}:${clientIp(req)}`, limit, windowMs);
}
