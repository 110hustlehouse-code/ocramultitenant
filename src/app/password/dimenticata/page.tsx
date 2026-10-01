import type { Metadata } from "next";
import Link from "next/link";
import { requestPasswordResetAction } from "../actions";

export const metadata: Metadata = { title: "Password dimenticata" };

export default async function Page({ searchParams }: { searchParams: Promise<{ inviata?: string }> }) {
  const { inviata } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">Password dimenticata</p>
          <p className="text-sm text-muted">Scrivi l&apos;email con cui accedi: se è registrata, ricevi un link per reimpostarla.</p>
        </div>

        {inviata ? (
          <p role="status" className="rounded-lg border border-border bg-surface p-4 text-center text-sm">
            Se l&apos;indirizzo esiste, hai ricevuto un&apos;email con le istruzioni. Il link è valido un&apos;ora.
          </p>
        ) : (
          <form action={requestPasswordResetAction} className="space-y-3 rounded-xl border border-border bg-surface p-6">
            <label className="block text-sm">
              <span className="label">Email</span>
              <input type="email" name="email" required className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2" />
            </label>
            <button type="submit" className="w-full rounded-md bg-text px-4 py-2.5 text-sm font-semibold text-bg hover:opacity-90">
              Invia il link
            </button>
          </form>
        )}

        <p className="text-center text-sm">
          <Link href="/login" className="underline">
            Torna al login
          </Link>
        </p>
      </div>
    </main>
  );
}
