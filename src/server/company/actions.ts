"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getContext } from "@/server/context";
import { ALL_COMPANIES, COMPANY_COOKIE } from "@/server/company/selection";

/** Cambia la società attiva. Valida sempre lato server. */
export async function selectCompany(formData: FormData): Promise<void> {
  const ctx = await getContext();
  const slug = String(formData.get("company") ?? "");

  const allowed =
    (slug === ALL_COMPANIES && ctx.canConsolidate) ||
    ctx.companies.some((c) => c.slug === slug);
  if (!allowed) return;

  (await cookies()).set(COMPANY_COOKIE, slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
