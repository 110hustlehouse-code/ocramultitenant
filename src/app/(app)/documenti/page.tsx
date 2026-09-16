import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/modules/ModulePlaceholder";
import { requireModule } from "@/server/context";

export const metadata: Metadata = { title: "Documenti" };

export default async function Page() {
  await requireModule("DOCUMENTI");
  return <ModulePlaceholder moduleKey="DOCUMENTI" />;
}
