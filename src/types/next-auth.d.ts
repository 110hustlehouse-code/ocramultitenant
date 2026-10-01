import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      /** true finché non cambia la password iniziale assegnata dal CEO (solo login a password) */
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }
}
