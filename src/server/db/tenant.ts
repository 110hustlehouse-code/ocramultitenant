import { Prisma } from "@/generated/prisma/client";

/**
 * Isolamento multi-tenant.
 *
 * Ogni query su un modello elencato qui riceve `tenantId` automaticamente,
 * in lettura (where) e in scrittura (data). Nessun filtro a mano.
 *
 * ➜ Quando aggiungi un modello con `tenantId` allo schema, AGGIUNGILO QUI.
 *   Il test `tenant.test.ts` fallisce se te ne dimentichi.
 *
 * Limiti noti (by design):
 *  • le scritture annidate (create dentro create) non vengono filtrate:
 *    scrivi ogni modello con una chiamata di primo livello;
 *  • $queryRaw / $executeRaw non sono filtrati: filtra a mano e con cura.
 */
export const TENANT_MODELS = new Set<string>(["Company", "User", "Membership", "Party", "PartyCompany", "Project", "ProjectMember", "Task", "Meeting"]);

type Args = Record<string, unknown>;

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "delete",
  "deleteMany",
]);

const WHERE_AND_DATA_OPERATIONS = new Set(["update", "updateMany", "updateManyAndReturn"]);

const CREATE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn"]);

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantScopeError";
  }
}

function assertData(data: unknown, tenantId: string): Args {
  const record = (data ?? {}) as Args;
  if ("tenant" in record) {
    throw new TenantScopeError("Non usare la relazione `tenant` nei dati: il tenant è impostato dal contesto.");
  }
  if (record.tenantId !== undefined && record.tenantId !== tenantId) {
    throw new TenantScopeError("Tentativo di scrivere su un tenant diverso da quello della sessione.");
  }
  return record;
}

function withWhere(args: Args, tenantId: string): Args {
  return { ...args, where: { ...((args.where as Args) ?? {}), tenantId } };
}

/** Funzione pura: riscrive gli argomenti di una query aggiungendo il tenant. */
export function scopeArgs(operation: string, rawArgs: unknown, tenantId: string): Args {
  const args = (rawArgs ?? {}) as Args;

  if (WHERE_OPERATIONS.has(operation)) return withWhere(args, tenantId);

  if (WHERE_AND_DATA_OPERATIONS.has(operation)) {
    assertData(args.data, tenantId);
    return withWhere(args, tenantId);
  }

  if (CREATE_OPERATIONS.has(operation)) {
    const data = args.data;
    const scoped = Array.isArray(data)
      ? data.map((row) => ({ ...assertData(row, tenantId), tenantId }))
      : { ...assertData(data, tenantId), tenantId };
    return { ...args, data: scoped };
  }

  if (operation === "upsert") {
    assertData(args.update, tenantId);
    return {
      ...withWhere(args, tenantId),
      create: { ...assertData(args.create, tenantId), tenantId },
    };
  }

  // Fail closed: un'operazione nuova non gestita non deve passare senza filtro.
  throw new TenantScopeError(`Operazione "${operation}" non gestita dallo scope tenant.`);
}

export function tenantExtension(tenantId: string) {
  return Prisma.defineExtension({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          return query(scopeArgs(operation, args, tenantId) as typeof args);
        },
      },
    },
  });
}
