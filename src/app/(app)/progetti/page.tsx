import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/modules/ModulePlaceholder";
import { requireModule } from "@/server/context";

export const metadata: Metadata = { title: "Progetti e task" };

export default async function Page() {
  await requireModule("PROGETTI");
  return <ModulePlaceholder moduleKey="PROGETTI" />;
}
