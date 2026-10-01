import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/password";
import { changePasswordAction } from "../actions";

export const metadata: Metadata = { title: "Cambia password" };

export default async function Page({ searchParams }: { searchParams: Promise<{ errore?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { errore } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">Imposta una nuova password</p>
          <p className="text-sm text-muted">
            Ti è stata assegnata una password temporanea. Prima di continuare, impostane una tua.
          </p>
        </div>

        {errore && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
            {errore}
          </p>
        )}

        <form action={changePasswordAction} className="space-y-3 rounded-xl border border-border bg-surface p-6">
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
            Imposta e accedi di nuovo
          </button>
        </form>
      </div>
    </main>
  );
}
