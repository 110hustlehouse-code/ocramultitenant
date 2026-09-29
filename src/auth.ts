import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { headers } from "next/headers";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { isDevLoginEnabled, isGoogleEnabled } from "@/env";
import { prisma } from "@/server/db/client";
import { resolveLoginUser } from "@/server/auth/resolve-user";

async function requestHost(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-host") ?? h.get("host");
  } catch {
    return null;
  }
}

function buildProviders(): NextAuthConfig["providers"] {
  const providers: NextAuthConfig["providers"] = [];

  if (isGoogleEnabled()) providers.push(Google);

  if (isDevLoginEnabled()) {
    providers.push(
      Credentials({
        id: "dev-login",
        name: "Accesso sviluppo",
        credentials: { email: { label: "Email", type: "email" } },
        async authorize(raw) {
          const parsed = z.object({ email: z.email() }).safeParse(raw);
          if (!parsed.success) return null;
          const user = await resolveLoginUser(parsed.data.email, await requestHost());
          return user ? { id: user.id, email: user.email, name: user.name } : null;
        },
      }),
    );
  }

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  ...authConfig,
  providers: buildProviders(),
  callbacks: {
    ...authConfig.callbacks,

    /** Porta d'ingresso: solo email invitate, verificate e con accesso valido. */
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && profile?.email_verified !== true) return false;
      if (!user.email) return false;
      return (await resolveLoginUser(user.email, await requestHost())) !== null;
    },

    /** Al login salva nel token gli identificativi OCRA (i ruoli no: dipendono dalla società e si rileggono dal DB). */
    async jwt({ token, user, account }) {
      if (account && user?.email) {
        const dbUser = await resolveLoginUser(user.email, await requestHost());
        if (!dbUser) return null;
        token.uid = dbUser.id;
        token.tid = dbUser.tenantId;
        await prisma.user.update({ where: { id: dbUser.id }, data: { lastLoginAt: new Date() } });
      }
      return token;
    },
  },
}));
