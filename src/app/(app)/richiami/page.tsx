import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/modules/ModulePlaceholder";
import { requireModule } from "@/server/context";

export const metadata: Metadata = { title: "Richiami" };

export default async function Page() {
  await requireModule("RICHIAMO");
  return <ModulePlaceholder moduleKey="RICHIAMO" />;
}
