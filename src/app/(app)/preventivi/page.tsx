import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/modules/ModulePlaceholder";
import { requireModule } from "@/server/context";

export const metadata: Metadata = { title: "Preventivi" };

export default async function Page() {
  await requireModule("PREVENTIVI");
  return <ModulePlaceholder moduleKey="PREVENTIVI" />;
}
