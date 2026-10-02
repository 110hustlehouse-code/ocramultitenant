/**
 * Il client Prisma generato usa `import.meta.url` (vedi src/generated/prisma/client.ts):
 * il transform interno di Playwright per i file di test non lo digerisce (CJS puro, come
 * il resto del progetto). tsx invece lo gestisce correttamente, quindi ogni accesso al DB
 * per i fixture E2E passa da qui, lanciato come sottoprocesso — i file che Playwright carica
 * direttamente (helpers/db.ts, accessi.spec.ts) non importano mai il client Prisma.
 *
 * Uso: tsx e2e/helpers/db-cli.mts <comando> '<json argomenti>'
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../../src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const ALL_MODULES = [
  "ANAGRAFICHE",
  "PROGETTI",
  "VERBALI",
  "RICHIAMO",
  "SOLLECITI",
  "DOCUMENTI",
  "MARGINE",
  "PREVENTIVI",
  "COLLABORATORI",
] as const;

const [, , command, argsJson] = process.argv;
const args = argsJson ? JSON.parse(argsJson) : {};

async function main() {
  switch (command) {
    case "create-tenant": {
      const { suffix } = args;
      const tenant = await prisma.tenant.create({ data: { slug: `e2e-${suffix}`, name: `E2E ${suffix}`, modules: [...ALL_MODULES] } });
      const company = await prisma.company.create({
        data: { tenantId: tenant.id, slug: `e2e-co-${suffix}`, name: "E2E Company", colorLight: "#123456", colorDark: "#654321" },
      });
      return { tenantId: tenant.id, companyId: company.id };
    }
    case "create-ceo": {
      const { tenantId, companyId, email } = args;
      const user = await prisma.user.create({ data: { tenantId, email, name: "CEO Test" } });
      await prisma.membership.create({ data: { tenantId, userId: user.id, companyId, role: "CEO" } });
      return { userId: user.id, email: user.email };
    }
    case "create-login-user": {
      const { tenantId, companyId, email, password, role, accessExpiresAt, mustChangePassword, active } = args;
      const user = await prisma.user.create({
        data: {
          tenantId,
          email,
          name: "Collaboratore Test",
          passwordHash: await bcrypt.hash(password, 12),
          mustChangePassword: mustChangePassword ?? false,
          accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null,
          active: active ?? true,
        },
      });
      await prisma.membership.create({ data: { tenantId, userId: user.id, companyId, role } });
      return { userId: user.id, email: user.email };
    }
    case "create-project-with-member": {
      const { tenantId, companyId, name, userId } = args;
      const project = await prisma.project.create({ data: { tenantId, companyId, name, status: "ATTIVO" } });
      await prisma.projectMember.create({ data: { tenantId, projectId: project.id, userId } });
      return { projectId: project.id };
    }
    case "get-user": {
      const { userId } = args;
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { lockedUntil: true, active: true } });
      return { lockedUntil: user.lockedUntil?.toISOString() ?? null, active: user.active };
    }
    case "expire-lock": {
      const { userId } = args;
      await prisma.user.update({ where: { id: userId }, data: { lockedUntil: new Date(Date.now() - 1000) } });
      return { ok: true };
    }
    case "cleanup-tenant": {
      const { tenantId } = args;
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
      return { ok: true };
    }
    default:
      throw new Error(`comando sconosciuto: ${command}`);
  }
}

main()
  .then((result) => {
    console.log(JSON.stringify(result));
  })
  .finally(() => prisma.$disconnect());
