import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isDevLoginEnabled, isGoogleEnabled } from "@/env";
import { signInDev, signInWithGoogle, signOutAction } from "@/server/auth/actions";

export const metadata: Metadata = { title: "Accedi" };

const ERRORS: Record<string, string> = {
  AccessDenied: "Questo account non è abilitato su OCRA. Chiedi l'accesso al tuo amministratore.",
  CredentialsSignin: "Email non riconosciuta o accesso scaduto.",
  Configuration: "Accesso non configurato correttamente. Controlla le variabili d'ambiente.",
};

const DEV_ACCOUNTS = [
  { email: "daniele@ocra.local", label: "CEO" },
  { email: "erika@ocra.local", label: "Project manager" },
  { email: "creativo@ocra.local", label: "Creativo" },
  { email: "esterno@ocra.local", label: "Esterno" },
];

type Props = { searchParams: Promise<{ error?: string; callbackUrl?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { error, callbackUrl } = await searchParams;
  const session = await auth();
  if (session?.user?.id && !error) redirect(callbackUrl?.startsWith("/") ? callbackUrl : "/");

  const google = isGoogleEnabled();
  const dev = isDevLoginEnabled();
  const message = error ? (ERRORS[error] ?? "Accesso non riuscito. Riprova.") : null;
  const target = callbackUrl ?? "/";

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <p className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight">OCRA</p>
          <p className="text-muted">Il gestionale per chi lavora a progetto</p>
        </div>

        {message && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
            {message}
            {session && (
              <form action={signOutAction} className="mt-2">
                <button type="submit" className="underline">
                  Esci e cambia account
                </button>
              </form>
            )}
          </div>
        )}

        <div className="space-y-4 rounded-xl border border-border bg-surface p-6">
          {google && (
            <form action={signInWithGoogle}>
              <input type="hidden" name="callbackUrl" value={target} />
              <button
                type="submit"
                className="w-full rounded-md bg-text px-4 py-2.5 text-sm font-semibold text-bg hover:opacity-90"
              >
                Accedi con Google
              </button>
            </form>
          )}

          {!google && !dev && (
            <p className="text-sm text-muted">
              Nessun metodo di accesso configurato. Imposta <code className="font-mono">AUTH_GOOGLE_ID</code> e{" "}
              <code className="font-mono">AUTH_GOOGLE_SECRET</code>.
            </p>
          )}

          {dev && (
            <form action={signInDev} className="space-y-3 border-t border-dashed border-border pt-4 first:border-0 first:pt-0">
              <p className="label">Accesso sviluppo · non attivo in produzione</p>
              <input type="hidden" name="callbackUrl" value={target} />
              <label className="block text-sm">
                <span className="sr-only">Account</span>
                <select
                  name="email"
                  defaultValue={DEV_ACCOUNTS[0].email}
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2"
                >
                  {DEV_ACCOUNTS.map((a) => (
                    <option key={a.email} value={a.email}>
                      {a.label} — {a.email}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="w-full rounded-md border border-border px-4 py-2.5 text-sm font-semibold hover:bg-surface-2"
              >
                Entra
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
