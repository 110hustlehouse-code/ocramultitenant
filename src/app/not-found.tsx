import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="label">404</p>
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">Pagina non disponibile</h1>
      <p className="max-w-sm text-muted">La pagina non esiste oppure il tuo ruolo non ha accesso a questa sezione.</p>
      <Link href="/" className="rounded-md border border-border px-4 py-2 text-sm hover:bg-surface-2">
        Torna alla panoramica
      </Link>
    </main>
  );
}
