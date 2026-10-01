"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PartyKind } from "@/generated/prisma/enums";
import { collaboratorAccessFromFormData, collaboratorAccessInputSchema } from "@/server/collaborators/input";
import { addEvaluation, CollaboratorError, createCollaboratorWithAccess, evaluationInputSchema, setLinkedUser } from "@/server/collaborators/service";
import { assertNotBlocked, getContext } from "@/server/context";
import { collaboratorKindFromParam, fieldErrors, PARAM_BY_KIND, partyFromFormData, partyInputSchema } from "@/server/registry/input";
import {
  addPartyKinds,
  checkPartyConflict,
  createParty,
  deleteParty,
  PartyConflictError,
  RegistryError,
  updateParty,
  writableCompanies,
} from "@/server/registry/service";

export type FormState =
  | {
      errors?: Record<string, string>;
      message?: string;
      values?: ReturnType<typeof partyFromFormData>;
      conflict?: { partyId: string; partyName: string; missingKinds: PartyKind[] };
      /** Accesso appena creato: password mostrata una tantum, mai persistita in chiaro. */
      accessCreated?: { partyId: string; email: string; password: string };
    }
  | undefined;

async function writer() {
  const ctx = await getContext();
  assertNotBlocked(ctx);
  if (!ctx.tenant.modules.includes("COLLABORATORI") || writableCompanies(ctx).length === 0) {
    throw new Error("Permesso negato");
  }
  return ctx;
}

export async function savePartyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writer();
  const values = partyFromFormData(fd);
  const id = fd.get("id")?.toString();

  // Controllo duplicati prima della validazione completa: altrimenti "nome obbligatorio"
  // nasconde il conflitto a chi sta solo verificando se una P.IVA esiste già.
  const earlyConflict = await checkPartyConflict(ctx, { vatNumber: values.vatNumber, taxCode: values.taxCode }, values.kinds as PartyKind[], id);
  if (earlyConflict) {
    return { message: earlyConflict.message, values, conflict: { partyId: earlyConflict.partyId, partyName: earlyConflict.partyName, missingKinds: earlyConflict.missingKinds } };
  }

  const parsed = partyInputSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  // "Crea anche l'accesso": solo alla creazione, mai alla modifica (il collaboratore esistente
  // si collega a un account con la rubrica `setLinkedUser`, non se ne crea un secondo).
  const createAccess = !id && fd.get("createAccess") === "true";
  if (createAccess) {
    const accessValues = collaboratorAccessFromFormData(fd);
    const parsedAccess = collaboratorAccessInputSchema.safeParse(accessValues);
    if (!parsedAccess.success) return { errors: fieldErrors(parsedAccess.error), values };

    try {
      const created = await createCollaboratorWithAccess(ctx, parsed.data, parsedAccess.data);
      revalidatePath("/collaboratori");
      return { accessCreated: { partyId: created.partyId, email: parsedAccess.data.email, password: parsedAccess.data.password } };
    } catch (e) {
      if (e instanceof PartyConflictError) {
        return { message: e.message, values, conflict: { partyId: e.partyId, partyName: e.partyName, missingKinds: e.missingKinds } };
      }
      if (e instanceof RegistryError || e instanceof CollaboratorError) return { message: e.message, values };
      throw e;
    }
  }

  try {
    if (id) await updateParty(ctx, id, parsed.data);
    else await createParty(ctx, parsed.data);
  } catch (e) {
    if (e instanceof PartyConflictError) {
      return { message: e.message, values, conflict: { partyId: e.partyId, partyName: e.partyName, missingKinds: e.missingKinds } };
    }
    if (e instanceof RegistryError) return { message: e.message, values };
    throw e;
  }
  revalidatePath("/collaboratori");
  redirect(`/collaboratori?tipo=${PARAM_BY_KIND[parsed.data.kinds[0]!]}`);
}

export async function addPartyKindsAction(fd: FormData): Promise<void> {
  const ctx = await writer();
  const partyId = String(fd.get("partyId") ?? "");
  const kinds = fd.getAll("missingKinds").map(String) as PartyKind[];
  try {
    await addPartyKinds(ctx, partyId, kinds);
  } catch (e) {
    if (!(e instanceof RegistryError)) throw e;
  }
  revalidatePath("/collaboratori");
  redirect(`/collaboratori/${partyId}`);
}

export async function deletePartyAction(fd: FormData): Promise<void> {
  const ctx = await writer();
  const id = fd.get("id")?.toString() ?? "";
  const kind = collaboratorKindFromParam(fd.get("tipo")?.toString());
  await deleteParty(ctx, id);
  revalidatePath("/collaboratori");
  redirect(`/collaboratori?tipo=${PARAM_BY_KIND[kind]}`);
}

export async function setLinkedUserAction(fd: FormData): Promise<void> {
  const ctx = await writer();
  const partyId = String(fd.get("partyId") ?? "");
  const userId = fd.get("userId")?.toString() || null;
  try {
    await setLinkedUser(ctx, partyId, userId);
  } catch (e) {
    if (!(e instanceof CollaboratorError)) throw e;
  }
  revalidatePath(`/collaboratori/${partyId}`);
}

export type EvaluationState = { error?: string } | undefined;

export async function addEvaluationAction(_prev: EvaluationState, fd: FormData): Promise<EvaluationState> {
  const ctx = await getContext();
  assertNotBlocked(ctx);
  const partyId = String(fd.get("partyId") ?? "");
  const parsed = evaluationInputSchema.safeParse({
    companyId: fd.get("companyId")?.toString() ?? "",
    projectId: fd.get("projectId")?.toString() || null,
    rating: Number(fd.get("rating")),
    notes: fd.get("notes")?.toString() || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  try {
    await addEvaluation(ctx, partyId, parsed.data);
  } catch (e) {
    if (e instanceof CollaboratorError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/collaboratori/${partyId}`);
  return undefined;
}
