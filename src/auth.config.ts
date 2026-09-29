import type { NextAuthConfig } from "next-auth";

/**
 * Configurazione condivisa e senza database: la usa anche proxy.ts.
 * Provider e controlli sul DB stanno in auth.ts.
 */

export const authConfig = {
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  providers: [],
  callbacks: {
    session({ session, token }) {
      const { uid, tid } = token;
      if (typeof uid === "string" && typeof tid === "string") {
        session.user.id = uid;
        session.user.tenantId = tid;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
