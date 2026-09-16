import { cn } from "@/lib/cn";
import { safeHex } from "@/lib/color";

export type CompanyBadgeData = {
  slug: string;
  name: string;
  logoUrl: string | null;
  logoBg: string | null;
  colorLight: string;
};

/** Tessera logo: il logo resta sul suo fondo originale, leggibile in entrambi i temi. */
export function CompanyLogo({ company, className }: { company: CompanyBadgeData; className?: string }) {
  const bg = safeHex(company.logoBg, "#ffffff");
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border", className)}
      style={{ background: bg }}
    >
      {company.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- loghi piccoli, sorgente configurabile da DB
        <img src={company.logoUrl} alt="" className="size-full object-contain p-1" />
      ) : (
        <span className="font-[family-name:var(--font-display)] text-xs font-bold" style={{ color: safeHex(company.colorLight, "#11151c") }}>
          {company.name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}
