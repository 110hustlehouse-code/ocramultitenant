/**
 * Nome canonico dei file di progetto: NomeProgetto_TipoFile_Versione_Data (manuale processi).
 * Il sistema estrae, non chiede (principio 1): progetto e data li conosce già, il tipo file
 * lo deduce dall'estensione, la versione la calcola dallo storico. Funzioni pure: si testano da sole.
 */

const CATEGORY_BY_EXT: Record<string, string> = {
  ai: "Sorgente", eps: "Sorgente", psd: "Sorgente", indd: "Sorgente", sketch: "Sorgente", xd: "Sorgente", fig: "Sorgente",
  jpg: "Immagine", jpeg: "Immagine", png: "Immagine", gif: "Immagine", webp: "Immagine", svg: "Immagine", tiff: "Immagine", bmp: "Immagine", heic: "Immagine",
  mp4: "Video", mov: "Video", avi: "Video", mkv: "Video", webm: "Video",
  mp3: "Audio", wav: "Audio", m4a: "Audio", aac: "Audio",
  xlsx: "Foglio", xls: "Foglio", csv: "Foglio",
  doc: "Documento", docx: "Documento", pdf: "Documento", odt: "Documento", txt: "Documento",
  ppt: "Presentazione", pptx: "Presentazione", key: "Presentazione",
  zip: "Archivio", rar: "Archivio", "7z": "Archivio",
};

export function extensionOf(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return m ? m[1]!.toLowerCase() : "";
}

/** Categoria del file (il «TipoFile» del naming convention), dedotta dall'estensione. */
export function fileCategory(filename: string): string {
  return CATEGORY_BY_EXT[extensionOf(filename)] ?? "File";
}

/** Chiave di raggruppamento delle versioni: stesso progetto + stesso nome file = stesso gruppo. */
export function groupKeyFor(originalName: string): string {
  return originalName.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 40) || "File";

/** Data AAAA-MM-GG per il nome file. */
function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function canonicalName(input: { projectName: string; originalName: string; version: number; date?: Date }): string {
  const ext = extensionOf(input.originalName);
  const category = fileCategory(input.originalName);
  const base = [slug(input.projectName), slug(category), `v${input.version}`, dayOf(input.date ?? new Date())].join("_");
  return ext ? `${base}.${ext}` : base;
}
