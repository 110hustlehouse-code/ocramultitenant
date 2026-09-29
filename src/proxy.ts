import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

/**
 * Controllo ottimistico: senza sessione → /login.
 * I controlli veri (utente attivo, ruolo, tenant) stanno in getContext(),
 * perché il proxy non deve interrogare il database.
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login"];

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!req.auth && !isPublic) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|api/health|api/cron|_next/static|_next/image|favicon.ico|brands/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
