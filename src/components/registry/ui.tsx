import Link from "next/link";
import { cn } from "@/lib/cn";
import { safeHex } from "@/lib/color";

export const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export const buttonClass = {
  primary:
    "inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-on-brand hover:opacity-90 disabled:opacity-50",
  secondary:
    "inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface-2",
  danger:
    "inline-flex items-center gap-2 rounded-md border border-danger/40 px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/10",
};

export function ButtonLink({
  href,
  variant = "secondary",
  children,
}: {
  href: string;
  variant?: keyof typeof buttonClass;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass[variant]}>
      {children}
    </Link>
  );
}

/** Pallino + sigla della società: il colore distingue da dove arriva l'anagrafica. */
export function CompanyTag({ name, short, color }: { name: string; short: string; color: string }) {
  return (
    <span title={name} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs">
      <span className="size-2 rounded-full" style={{ background: safeHex(color, "#11151c") }} aria-hidden />
      {short}
    </span>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={name} className="label block">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
