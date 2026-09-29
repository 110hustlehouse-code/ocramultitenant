import type { Company, PrismaClient } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import type { AppContext } from "@/server/context";
import { tenantExtension } from "@/server/db/tenant";
import { canInView, consolidatedCompanies, resolveCompanyView, type CompanyAccess } from "@/server/company/selection";

/** Contesto di richiesta per i test d'integrazione, costruito come fa getContext(). */
export function testContext(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  roles: Array<[Company, Role]>,
  view?: string,
): AppContext {
  const access: CompanyAccess[] = roles.map(([company, role]) => ({ company, role }));
  const v = resolveCompanyView(access, view)!;
  return {
    user: { id: userId, name: "Test", email: `${userId}@test.local` },
    tenant: { id: tenantId } as AppContext["tenant"],
    access,
    companies: access.map((a) => a.company),
    view: v,
    role: v.kind === "company" ? v.role : null,
    canConsolidate: consolidatedCompanies(access).length > 0,
    blockedTaskIds: [],
    can: (p) => canInView(v, access, p),
    db: prisma.$extends(tenantExtension(tenantId)),
  } as AppContext;
}
