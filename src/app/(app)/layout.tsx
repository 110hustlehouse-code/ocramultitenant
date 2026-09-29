import { LogOut } from "lucide-react";
import { CompanySwitcher } from "@/components/shell/CompanySwitcher";
import { BlockedScreen } from "@/components/reminders/BlockedScreen";
import { brandStyle } from "@/components/shell/brand";
import { Nav, type NavItem } from "@/components/shell/Nav";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { MODULES } from "@/lib/modules";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { selectCompany } from "@/server/company/actions";
import { hasModuleAccess, getContext } from "@/server/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();

  const blocked = ctx.blockedTaskIds.length > 0;
  const nav: NavItem[] = blocked
    ? []
    : [
        { key: "HOME", label: "Panoramica", href: "/" },
        ...MODULES.filter((m) => hasModuleAccess(ctx, m.key)).map((m) => ({ key: m.key, label: m.label, href: m.href })),
      ];

  const companies = ctx.companies.map(({ slug, name, logoUrl, logoBg, colorLight }) => ({
    slug,
    name,
    logoUrl,
    logoBg,
    colorLight,
  }));
  const active = ctx.view.kind === "all" ? "all" : ctx.view.company.slug;

  const switcher = (
    <CompanySwitcher
      companies={companies}
      active={active}
      allowConsolidated={ctx.canConsolidate}
      action={selectCompany}
    />
  );

  return (
    <div style={brandStyle(ctx.view)} className="brand-scope flex min-h-dvh">
      {/* Barra laterale (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4 md:flex">
        <div className="flex items-center gap-2 px-1">
          <span className="size-2.5 rounded-full bg-brand" aria-hidden />
          <span className="font-[family-name:var(--font-display)] text-lg font-extrabold tracking-tight">OCRA</span>
          <span className="label ml-auto truncate">{ctx.tenant.name}</span>
        </div>
        {switcher}
        <Nav items={nav} />
        <div className="mt-auto flex items-center gap-2 border-t border-border pt-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{ctx.user.name}</p>
            <p className="label truncate">{ctx.role ? ROLE_LABELS[ctx.role] : "Vista consolidata"}</p>
          </div>
          <ThemeToggle />
          <form action="/api/dev-logout" method="POST">
            <button
              type="submit"
              title="Esci"
              aria-label="Esci"
              className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-2 hover:text-text"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superiore (mobile) */}
        <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-border bg-surface px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-brand" aria-hidden />
            <span className="font-[family-name:var(--font-display)] text-lg font-extrabold">OCRA</span>
            <span className="ml-auto" />
            <ThemeToggle />
            <form action="/api/dev-logout" method="POST">
              <button
                type="submit"
                aria-label="Esci"
                className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted"
              >
                <LogOut className="size-4" aria-hidden />
              </button>
            </form>
          </div>
          {switcher}
          <Nav items={nav} orientation="horizontal" />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-10">
          {blocked ? <BlockedScreen ctx={ctx} /> : children}
        </main>
      </div>
    </div>
  );
}
