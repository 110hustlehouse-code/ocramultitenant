import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/modules/ModulePlaceholder";
import { requireModule } from "@/server/context";

export const metadata: Metadata = { title: "Margine" };

export default async function Page() {
  await requireModule("MARGINE");
  return <ModulePlaceholder moduleKey="MARGINE" />;
}
