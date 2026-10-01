"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/impostazioni/utenti", label: "Utenti" },
  { href: "/impostazioni/societa", label: "Società" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Sezioni impostazioni" className="flex gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-semibold",
              active ? "border-brand text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
