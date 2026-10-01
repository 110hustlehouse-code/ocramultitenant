import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { parseDay } from "@/server/projects/input";

export const ROLE_VALUES = ["CEO", "PROJECT_MANAGER", "CREATIVE", "EXTERNAL"] as const satisfies readonly Role[];

const optionalText = (max: number) =>
  z.preprocess((v) => {
    const s = v === undefined || v === null ? "" : String(v).trim();
    return s === "" ? null : s;
  }, z.string().max(max, `Massimo ${max} caratteri`).nullable());

const optionalDay = z.preprocess(
  (v) => (v ? String(v) : null),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida")
    .transform(parseDay)
    .nullable(),
);

/** Stesso schema per invitare un nuovo utente o aggiornare il ruolo di uno esistente. */
export const memberInputSchema = z
  .object({
    // Pulizia prima del controllo formato: altrimenti spazi o maiuscole fanno fallire z.email().
    email: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.email("Email non valida")),
    name: optionalText(120),
    role: z.enum(ROLE_VALUES, { message: "Scegli un ruolo" }),
    companyId: z.string().min(1, "Scegli la società"),
    accessExpiresAt: optionalDay,
  })
  .refine((v) => v.role !== "EXTERNAL" || v.accessExpiresAt !== null, {
    message: "Il ruolo Esterno richiede una data di scadenza dell'accesso.",
    path: ["accessExpiresAt"],
  });

export type MemberFormInput = z.infer<typeof memberInputSchema>;

export function memberFromFormData(fd: FormData) {
  return {
    email: fd.get("email")?.toString() ?? "",
    name: fd.get("name")?.toString() ?? "",
    role: fd.get("role")?.toString() ?? "",
    companyId: fd.get("companyId")?.toString() ?? "",
    accessExpiresAt: fd.get("accessExpiresAt")?.toString() ?? "",
  };
}
