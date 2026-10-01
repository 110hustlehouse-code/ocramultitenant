"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/server/auth/password";
import { PasswordResetError, requestPasswordReset, resetPassword } from "@/server/auth/password-reset";
import { prisma } from "@/server/db/client";

async function requestHost(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-host") ?? h.get("host");
}

function checkNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Almeno ${MIN_PASSWORD_LENGTH} caratteri.`;
  if (password !== confirm) return "Le due password non coincidono.";
  return null;
}

/** Risposta identica in ogni caso: non deve rivelare se un'email è registrata. */
export async function requestPasswordResetAction(fd: FormData): Promise<void> {
  const email = fd.get("email")?.toString() ?? "";
  await requestPasswordReset(email, await requestHost());
  redirect("/password/dimenticata?inviata=1");
}

export async function resetPasswordAction(fd: FormData): Promise<void> {
  const token = fd.get("token")?.toString() ?? "";
  const password = fd.get("password")?.toString() ?? "";
  const confirm = fd.get("confirm")?.toString() ?? "";

  const invalid = checkNewPassword(password, confirm);
  if (invalid) redirect(`/password/reimposta/${token}?errore=${encodeURIComponent(invalid)}`);

  try {
    await resetPassword(token, password);
  } catch (e) {
    if (e instanceof PasswordResetError) redirect(`/password/reimposta/${token}?errore=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect("/login?cambiata=1");
}

/** Cambio password obbligatorio al primo accesso: nessuna riconferma della password temporanea, l'ha appena usata per entrare. */
export async function changePasswordAction(fd: FormData): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const password = fd.get("password")?.toString() ?? "";
  const confirm = fd.get("confirm")?.toString() ?? "";
  const invalid = checkNewPassword(password, confirm);
  if (invalid) redirect(`/password/nuova?errore=${encodeURIComponent(invalid)}`);

  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } });
  // La sessione (JWT) porta ancora il vecchio mustChangePassword: si fa rientrare con la password nuova.
  await signOut({ redirectTo: "/login?cambiata=1" });
}
