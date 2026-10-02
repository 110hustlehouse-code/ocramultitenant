"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { resolveLoginUser } from "@/server/auth/resolve-user";

function safeCallback(value: FormDataEntryValue | null): string {
  const url = typeof value === "string" ? value : "/";
  // Solo percorsi interni: niente open redirect
  return url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

async function requestHost(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host");
}

/**
 * Google (OAuth): l'autenticazione si completa dopo il round-trip col provider esterno
 * (/api/auth/callback/google), non qui — il redirect lo gestisce signIn() stesso.
 */
export async function signInWithGoogle(formData: FormData) {
  try {
    await signIn("google", { redirectTo: safeCallback(formData.get("callbackUrl")) });
  } catch (error) {
    if (error instanceof AuthError) redirect(`/login?error=${error.type}`);
    throw error; // il redirect di successo è un'eccezione di Next: va rilanciata
  }
}

/**
 * Credentials (password-login, dev-login): l'autenticazione si completa in modo sincrono,
 * qui stesso. Il redirect automatico di signIn() è gestito dal router client-side (fetch
 * interno della Server Action) e non passa dal proxy: un utente con password da cambiare
 * atterrebbe per un istante sulla pagina di destinazione originale invece che su
 * /password/nuova. Si chiede quindi a signIn() di non reindirizzare da sé (`redirect: false`)
 * e si rilegge l'utente dal DB con la stessa resolveLoginUser() usata dal provider — non la
 * sessione appena scritta, che un auth() nella stessa invocazione non vede ancora.
 */
async function runCredentials(provider: string, email: string, formData: FormData, options: Record<string, unknown>) {
  const callbackUrl = safeCallback(formData.get("callbackUrl"));
  let target = callbackUrl;
  try {
    const result = await signIn(provider, { ...options, redirect: false, redirectTo: callbackUrl });
    if (typeof result === "string") target = result;
  } catch (error) {
    if (error instanceof AuthError) redirect(`/login?error=${error.type}`);
    throw error;
  }
  const user = await resolveLoginUser(email, await requestHost());
  redirect(user?.mustChangePassword ? "/password/nuova" : target);
}

export async function signInDev(formData: FormData) {
  const email = formData.get("email")?.toString() ?? "";
  await runCredentials("dev-login", email, formData, { email });
}

export async function signInWithPassword(formData: FormData) {
  const email = formData.get("email")?.toString() ?? "";
  await runCredentials("password-login", email, formData, { email, password: formData.get("password") });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
