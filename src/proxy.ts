import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

/**
 * Controllo ottimistico: senza sessione → /login.
 * I controlli veri (utente attivo, ruolo, tenant) stanno in getContext(),
 * perché il proxy non deve interrogare il database.
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/password/dimenticata", "/password/reimposta"];
/** Unica pagina raggiungibile da chi deve ancora cambiare la password assegnata dal CEO. */
const CHANGE_PASSWORD_PATH = "/password/nuova";

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!req.auth && !isPublic) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // Ottimistico come il resto del proxy: la sorgente di verità resta il DB (pagina stessa + azione).
  if (req.auth?.user.mustChangePassword && pathname !== CHANGE_PASSWORD_PATH && !isPublic) {
    return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // api/test-email: temporanea (vedi src/app/api/test-email/route.ts), da togliere insieme alla route.
  matcher: ["/((?!api/auth|api/health|api/cron|api/webhooks|api/dev-login|api/dev-logout|api/test-email|_next/static|_next/image|favicon.ico|brands/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
