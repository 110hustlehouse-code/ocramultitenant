import type { Metadata } from "next";
import Link from "next/link";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/password";
import { resetPasswordAction } from "../../actions";

export const metadata: Metadata = { title: "Reimposta password" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ errore?: string }>;
}) {
  const { token } = await params;
  const { errore } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">Reimposta password</p>
        </div>

        {errore && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
            {errore}
          </p>
        )}

        <form action={resetPasswordAction} className="space-y-3 rounded-xl border border-border bg-surface p-6">
          <input type="hidden" name="token" value={token} />
          <label className="block text-sm">
            <span className="label">Nuova password</span>
            <input
              type="password"
              name="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="label">Conferma password</span>
            <input
              type="password"
              name="confirm"
              required
              minLength={MIN_PASSWORD_LENGTH}
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2"
            />
          </label>
          <button type="submit" className="w-full rounded-md bg-text px-4 py-2.5 text-sm font-semibold text-bg hover:opacity-90">
            Reimposta
          </button>
        </form>

        <p className="text-center text-sm">
          <Link href="/login" className="underline">
            Torna al login
          </Link>
        </p>
      </div>
    </main>
  );
}
