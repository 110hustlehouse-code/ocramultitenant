"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PartyKind } from "@/generated/prisma/enums";
import { assertNotBlocked, getContext } from "@/server/context";
import { parsePartiesCsv, type ImportIssue } from "@/server/registry/csv";
import { fieldErrors, kindFromParam, PARAM_BY_KIND, partyFromFormData, partyInputSchema } from "@/server/registry/input";
import {
  addPartyKinds,
  checkPartyConflict,
  createParty,
  deleteParty,
  importParties,
  PartyConflictError,
  RegistryError,
  updateParty,
  viewCompanies,
  writableCompanies,
} from "@/server/registry/service";

/** `values`: quanto inviato, per ripopolare il form dopo un errore (React lo svuota dopo l'azione). */
export type FormState =
  | {
      errors?: Record<string, string>;
      message?: string;
      values?: ReturnType<typeof partyFromFormData>;
      /** L'anagrafica esiste già con un altro ruolo: si propone di aggiungere quello mancante invece di duplicarla. */
      conflict?: { partyId: string; partyName: string; missingKinds: PartyKind[] };
      /** Solo da /collaboratori: accesso appena creato, password mostrata una tantum (mai persistita in chiaro). */
      accessCreated?: { partyId: string; email: string; password: string };
    }
  | undefined;

async function writer() {
  const ctx = await getContext();
  assertNotBlocked(ctx);
  if (!ctx.tenant.modules.includes("ANAGRAFICHE") || writableCompanies(ctx).length === 0) {
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
  revalidatePath("/anagrafiche");
  redirect(`/anagrafiche?tipo=${PARAM_BY_KIND[parsed.data.kinds[0]!]}`);
}

/** Dalla proposta di conflitto: aggiunge il ruolo mancante all'anagrafica esistente invece di duplicarla. */
export async function addPartyKindsAction(fd: FormData): Promise<void> {
  const ctx = await writer();
  const partyId = String(fd.get("partyId") ?? "");
  const kinds = fd.getAll("missingKinds").map(String) as PartyKind[];
  try {
    await addPartyKinds(ctx, partyId, kinds);
  } catch (e) {
    if (!(e instanceof RegistryError)) throw e;
  }
  revalidatePath("/anagrafiche");
  redirect(`/anagrafiche/${partyId}`);
}

export async function deletePartyAction(fd: FormData): Promise<void> {
  const ctx = await writer();
  const id = fd.get("id")?.toString() ?? "";
  const kind = kindFromParam(fd.get("tipo")?.toString());
  await deleteParty(ctx, id);
  revalidatePath("/anagrafiche");
  redirect(`/anagrafiche?tipo=${PARAM_BY_KIND[kind]}`);
}

export type ImportState =
  | {
      ok: boolean;
      created?: number;
      updated?: number;
      issues?: ImportIssue[];
      unknownHeaders?: string[];
      message?: string;
    }
  | undefined;

const MAX_BYTES = 2 * 1024 * 1024;

export async function importPartiesAction(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const ctx = await writer();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Scegli un file CSV." };
  if (file.size > MAX_BYTES) return { ok: false, message: "File troppo grande (massimo 2 MB)." };

  const kind = kindFromParam(fd.get("tipo")?.toString());
  const writable = writableCompanies(ctx);
  const requestedDefault = fd.get("defaultCompanyId")?.toString();
  const fallback =
    writable.find((c) => c.id === requestedDefault) ?? viewCompanies(ctx).find((c) => writable.includes(c));
  const parsed = parsePartiesCsv(await file.text(), kind, writable, fallback ? [fallback.id] : []);

  // Tutto o niente: se una riga ha errori non si salva nulla, così si corregge il file e si riprova.
  if (parsed.issues.length > 0) return { ok: false, issues: parsed.issues, unknownHeaders: parsed.unknownHeaders };
  if (parsed.rows.length === 0) return { ok: false, message: "Nessuna riga da importare." };

  const result = await importParties(ctx, kind, parsed.rows);
  revalidatePath("/anagrafiche");
  return { ok: true, ...result, unknownHeaders: parsed.unknownHeaders };
}
