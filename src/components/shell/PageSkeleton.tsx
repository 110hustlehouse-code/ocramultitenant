/** Segnaposto mostrato da `loading.tsx` mentre la pagina si carica: niente schermo bianco tra un click e l'altro. */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Caricamento…" className="animate-pulse space-y-8">
      <div aria-hidden className="space-y-2">
        <div className="h-3 w-24 rounded bg-surface-2" />
        <div className="h-8 w-64 rounded bg-surface-2" />
      </div>
      <div aria-hidden className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-14 bg-surface-2/50" />
        ))}
      </div>
    </div>
  );
}
