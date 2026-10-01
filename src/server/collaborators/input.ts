import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/password";
import { parseDay } from "@/server/projects/input";
import { ROLE_VALUES } from "@/server/users/input";

/**
 * Accesso dedicato creato insieme al collaboratore: email, password iniziale, ruolo e società.
 * Si valida solo quando il CEO spunta "Crea anche l'accesso". Nomi dei campi prefissati
 * (`accessEmail` ecc.) per non confondersi con gli omonimi del form anagrafica (`email`,
 * `companyIds`) quando gli errori dei due schemi finiscono nella stessa mappa.
 */
export const collaboratorAccessInputSchema = z
  .object({
    accessEmail: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.email("Email non valida")),
    accessPassword: z.string().min(MIN_PASSWORD_LENGTH, `Almeno ${MIN_PASSWORD_LENGTH} caratteri`),
    accessRole: z.enum(ROLE_VALUES, { message: "Scegli un ruolo" }),
    accessCompanyIds: z.array(z.string().min(1)).min(1, "Scegli almeno una società per l'accesso"),
    accessExpiresAt: z.preprocess(
      (v) => (v ? String(v) : null),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida")
        .transform(parseDay)
        .nullable(),
    ),
  })
  .refine((v) => v.accessRole !== "EXTERNAL" || v.accessExpiresAt !== null, {
    message: "Il ruolo Esterno richiede una data di scadenza dell'accesso.",
    path: ["accessExpiresAt"],
  })
  .transform((v) => ({
    email: v.accessEmail,
    password: v.accessPassword,
    role: v.accessRole,
    companyIds: v.accessCompanyIds,
    accessExpiresAt: v.accessExpiresAt,
  }));

export type CollaboratorAccessInput = z.infer<typeof collaboratorAccessInputSchema>;

export function collaboratorAccessFromFormData(fd: FormData) {
  return {
    accessEmail: fd.get("accessEmail")?.toString() ?? "",
    accessPassword: fd.get("accessPassword")?.toString() ?? "",
    accessRole: fd.get("accessRole")?.toString() ?? "",
    accessCompanyIds: fd.getAll("accessCompanyIds").map(String),
    accessExpiresAt: fd.get("accessExpiresAt")?.toString() ?? "",
  };
}
