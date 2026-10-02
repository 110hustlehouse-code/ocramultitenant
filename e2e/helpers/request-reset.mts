/**
 * Intercetta l'invio dell'email di reset password per recuperare il token in chiaro:
 * nel DB resta solo l'hash SHA-256 (irreversibile), quindi l'unico modo onesto di
 * verificare il link reale è chiamare la stessa funzione di produzione usata dalla
 * Server Action (requestPasswordReset) con un sender fittizio — tecnica già usata in
 * src/server/auth/password-reset.test.ts. Va lanciato con:
 *   node_modules/.bin/tsx --conditions=react-server e2e/helpers/request-reset.mts <email>
 * (la condizione "react-server" serve solo per superare la guardia "server-only" dei
 * moduli applicativi fuori dal build Next; nessun'altra logica viene bypassata).
 */
import "dotenv/config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { requestPasswordReset } = require("../../src/server/auth/password-reset.ts");

const email = process.argv[2];
if (!email) {
  console.error("uso: request-reset.mts <email>");
  process.exit(1);
}

const sent: Array<{ to: string; subject: string; text: string }> = [];
await requestPasswordReset(email, null, async (e: { to: string; subject: string; text: string }) => {
  sent.push(e);
  return { delivered: true };
});

console.log(JSON.stringify(sent[0] ?? null));
