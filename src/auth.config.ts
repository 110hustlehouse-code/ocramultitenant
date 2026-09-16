import type { NextAuthConfig } from "next-auth";
import { Role } from "@/generated/prisma/enums";

/**
 * Configurazione condivisa e senza database: la usa anche proxy.ts.
 * Provider e controlli sul DB stanno in auth.ts.
 */

const ROLES = new Set<string>(Object.values(Role));

function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.has(value);
}

export const authConfig = {
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  providers: [],
  callbacks: {
    session({ session, token }) {
      const { uid, tid, role } = token;
      if (typeof uid === "string" && typeof tid === "string" && isRole(role)) {
        session.user.id = uid;
        session.user.tenantId = tid;
        session.user.role = role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
