"use client";

import { Check, ChevronsUpDown, Layers } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { CompanyLogo, type CompanyBadgeData } from "@/components/shell/CompanyLogo";
import { cn } from "@/lib/cn";

type Props = {
  companies: CompanyBadgeData[];
  /** slug della società attiva, oppure "all" */
  active: string;
  allowConsolidated: boolean;
  action: (formData: FormData) => Promise<void>;
};

export function CompanySwitcher({ companies, active, allowConsolidated, action }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = companies.find((c) => c.slug === active);

  function choose(slug: string) {
    setOpen(false);
    if (slug === active) return;
    const fd = new FormData();
    fd.set("company", slug);
    startTransition(() => action(fd));
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-2 py-2 text-left hover:bg-surface-2",
          pending && "opacity-60",
        )}
      >
        {current ? (
          <CompanyLogo company={current} className="h-8 w-12" />
        ) : (
          <span className="inline-flex h-8 w-12 items-center justify-center rounded-md border border-border bg-surface-2">
            <Layers className="size-4" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="label block">Società</span>
          <span className="block truncate text-sm font-semibold">{current?.name ?? "Tutte le società"}</span>
        </span>
        <ChevronsUpDown className="size-4 text-muted" aria-hidden />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {companies.map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                role="option"
                aria-selected={c.slug === active}
                onClick={() => choose(c.slug)}
                className="flex w-full items-center gap-3 px-2 py-2 text-left text-sm hover:bg-surface-2"
              >
                <CompanyLogo company={c} className="h-7 w-10" />
                <span className="flex-1 truncate">{c.name}</span>
                {c.slug === active && <Check className="size-4" aria-hidden />}
              </button>
            </li>
          ))}
          {allowConsolidated && (
            <li className="border-t border-border">
              <button
                type="button"
                role="option"
                aria-selected={active === "all"}
                onClick={() => choose("all")}
                className="flex w-full items-center gap-3 px-2 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span className="inline-flex h-7 w-10 items-center justify-center rounded-md border border-border bg-surface-2">
                  <Layers className="size-4" aria-hidden />
                </span>
                <span className="flex-1">Tutte · consolidato</span>
                {active === "all" && <Check className="size-4" aria-hidden />}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
