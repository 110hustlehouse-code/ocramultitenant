import type { ModuleKey } from "@/generated/prisma/enums";
import type { Permission } from "@/server/auth/permissions";

export type ModuleDefinition = {
  key: ModuleKey;
  label: string;
  href: `/${string}`;
  permission: Permission;
  /** Cosa farà il modulo: mostrato finché non è costruito */
  summary: string;
  /** Posizione nell'ordine di costruzione (docs/ROADMAP.md) */
  step: number;
  ready: boolean;
};

/** Registro dei moduli. L'attivazione per cliente sta nel DB (Tenant.modules). */
export const MODULES: readonly ModuleDefinition[] = [
  {
    key: "ANAGRAFICHE",
    label: "Clienti e fornitori",
    href: "/anagrafiche",
    permission: "registry:read",
    summary: "Anagrafica unica di clienti e fornitori, per società. Import da CSV.",
    step: 2,
    ready: true,
  },
  {
    key: "PROGETTI",
    label: "Progetti e task",
    href: "/progetti",
    permission: "projects:read",
    summary: "Progetti con modelli configurabili per società, task con chiusura tramite prova.",
    step: 3,
    ready: true,
  },
  {
    key: "VERBALI",
    label: "Verbali",
    href: "/verbali",
    permission: "meetings:read",
    summary: "Dal verbale della riunione ai task, con responsabile e scadenza estratti dall'AI.",
    step: 4,
    ready: true,
  },
  {
    key: "RICHIAMO",
    label: "Richiami",
    href: "/richiami",
    permission: "reminders:read",
    summary: "Due promemoria automatici via email, poi il task passa al PM e al CEO. Il blocco lo decidono le persone.",
    step: 5,
    ready: true,
  },
  {
    key: "SOLLECITI",
    label: "Solleciti",
    href: "/solleciti",
    permission: "followups:manage",
    summary: "Task fermi in attesa di un cliente: il messaggio al cliente, i promemoria dopo giorni di silenzio, i giorni persi.",
    step: 5,
    ready: true,
  },
  {
    key: "DOCUMENTI",
    label: "Documenti",
    href: "/documenti",
    permission: "documents:read",
    summary: "File di progetto e prove di chiusura dei task.",
    step: 6,
    ready: false,
  },
  {
    key: "MARGINE",
    label: "Margine",
    href: "/margine",
    permission: "finance:read",
    summary: "Ore e costi contro preventivo, in continuo. Allerta mentre il progetto è recuperabile.",
    step: 7,
    ready: false,
  },
  {
    key: "PREVENTIVI",
    label: "Preventivi",
    href: "/preventivi",
    permission: "quotes:write",
    summary: "Preventivi con layout e tono della società. Accettato → progetto creato in automatico.",
    step: 8,
    ready: true,
  },
];

export function getModule(key: ModuleKey): ModuleDefinition {
  const found = MODULES.find((m) => m.key === key);
  if (!found) throw new Error(`Modulo sconosciuto: ${key}`);
  return found;
}
