"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { companySettingsFromFormData, companySettingsSchema } from "@/server/companies/input";
import { CompanyError, updateCompanySettings } from "@/server/companies/service";
import { getContext } from "@/server/context";
import { fieldErrors } from "@/server/registry/input";
import { memberFromFormData, memberInputSchema } from "@/server/users/input";
import { revokeMember, upsertMember, UserError } from "@/server/users/service";

export type MemberFormState =
  | { errors?: Record<string, string>; message?: string; values?: ReturnType<typeof memberFromFormData> }
  | undefined;

export async function saveMemberAction(_prev: MemberFormState, fd: FormData): Promise<MemberFormState> {
  const ctx = await getContext();
  const values = memberFromFormData(fd);
  const parsed = memberInputSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  try {
    await upsertMember(ctx, parsed.data);
  } catch (e) {
    if (e instanceof UserError) return { message: e.message, values };
    throw e;
  }
  revalidatePath("/impostazioni/utenti");
  redirect("/impostazioni/utenti");
}

export async function revokeMemberAction(fd: FormData): Promise<void> {
  const ctx = await getContext();
  try {
    await revokeMember(ctx, String(fd.get("id") ?? ""));
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
  }
  revalidatePath("/impostazioni/utenti");
}

export type CompanyFormState =
  | { errors?: Record<string, string>; message?: string; values?: ReturnType<typeof companySettingsFromFormData> }
  | undefined;

export async function saveCompanySettingsAction(_prev: CompanyFormState, fd: FormData): Promise<CompanyFormState> {
  const ctx = await getContext();
  const companyId = String(fd.get("companyId") ?? "");
  const values = companySettingsFromFormData(fd);
  const parsed = companySettingsSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  try {
    await updateCompanySettings(ctx, companyId, parsed.data);
  } catch (e) {
    if (e instanceof CompanyError) return { message: e.message, values };
    throw e;
  }
  revalidatePath("/impostazioni/societa");
  redirect(`/impostazioni/societa?companyId=${companyId}`);
}
