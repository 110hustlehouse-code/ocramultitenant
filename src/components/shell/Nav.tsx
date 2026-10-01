"use client";

import {
  FileText,
  FolderKanban,
  LayoutDashboard,
  type LucideIcon,
  NotebookPen,
  Receipt,
  BellRing,
  Hourglass,
  TrendingUp,
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ModuleKey } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";

const ICONS: Record<ModuleKey | "HOME", LucideIcon> = {
  HOME: LayoutDashboard,
  ANAGRAFICHE: Users,
  PROGETTI: FolderKanban,
  VERBALI: NotebookPen,
  RICHIAMO: BellRing,
  SOLLECITI: Hourglass,
  DOCUMENTI: FileText,
  MARGINE: TrendingUp,
  PREVENTIVI: Receipt,
  COLLABORATORI: UserCog,
};

export type NavItem = { key: ModuleKey | "HOME"; label: string; href: string };

export function Nav({ items, orientation = "vertical" }: { items: NavItem[]; orientation?: "vertical" | "horizontal" }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Moduli">
      <ul className={cn("flex gap-1", orientation === "vertical" ? "flex-col" : "flex-row overflow-x-auto")}>
        {items.map((item) => {
          const Icon = ICONS[item.key];
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.key} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm whitespace-nowrap",
                  active ? "bg-brand font-semibold text-on-brand" : "text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
