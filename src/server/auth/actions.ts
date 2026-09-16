"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";

function safeCallback(value: FormDataEntryValue | null): string {
  const url = typeof value === "string" ? value : "/";
  // Solo percorsi interni: niente open redirect
  return url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

async function run(provider: string, formData: FormData, options: Record<string, unknown> = {}) {
  try {
    await signIn(provider, { ...options, redirectTo: safeCallback(formData.get("callbackUrl")) });
  } catch (error) {
    if (error instanceof AuthError) redirect(`/login?error=${error.type}`);
    throw error; // il redirect di successo è un'eccezione di Next: va rilanciata
  }
}

export async function signInWithGoogle(formData: FormData) {
  await run("google", formData);
}

export async function signInDev(formData: FormData) {
  await run("dev-login", formData, { email: formData.get("email") });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
