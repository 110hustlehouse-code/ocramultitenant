import { templateCsv } from "@/server/registry/csv";

/** Modello CSV vuoto con le intestazioni riconosciute dall'import. */
export function GET() {
  return new Response(templateCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ocra-anagrafiche-modello.csv"',
    },
  });
}
