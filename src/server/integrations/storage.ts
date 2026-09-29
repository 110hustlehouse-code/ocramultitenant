import "server-only";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env";

/**
 * Archivio file su Cloudflare R2. I file non passano mai dal server dell'app
 * (Vercel limita i body a pochi MB): il browser carica e Deepgram legge con URL firmati.
 */
let client: S3Client | undefined;

function r2() {
  const e = env();
  if (!e.R2_ACCOUNT_ID || !e.R2_ACCESS_KEY_ID || !e.R2_SECRET_ACCESS_KEY || !e.R2_BUCKET) {
    throw new Error("Archivio file non configurato (variabili R2_*).");
  }
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY },
  });
  return { client, bucket: e.R2_BUCKET };
}

/** Chiave dell'oggetto: sempre sotto il tenant, così i file di clienti diversi non si mescolano. */
export function objectKey(tenantId: string, area: string, id: string, filename: string): string {
  const safe = filename.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80) || "file";
  return `${tenantId}/${area}/${id}/${Date.now()}-${safe}`;
}

export async function uploadUrl(key: string, contentType: string, expiresIn = 3600): Promise<string> {
  const { client, bucket } = r2();
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), {
    expiresIn,
  });
}

export async function downloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const { client, bucket } = r2();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}
