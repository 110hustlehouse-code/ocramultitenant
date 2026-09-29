import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { safeHex } from "@/lib/color";
import { formatEuro, quoteLabel } from "@/lib/quotes";
import type { QuoteWithLines } from "./service";

/**
 * PDF del preventivo con il layout della società (logo, colore, dati giuridici dal DB).
 * Il costo previsto delle voci non compare mai. Font statici in ./fonts (OFL), inclusi nel
 * bundle della route con outputFileTracingIncludes (next.config.ts).
 */

const FONT_DIR = path.join(process.cwd(), "src/server/quotes/fonts");
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  Font.register({ family: "Archivo", src: path.join(FONT_DIR, "archivo-latin-700-normal.woff"), fontWeight: 700 });
  Font.register({
    family: "Public Sans",
    fonts: [
      { src: path.join(FONT_DIR, "public-sans-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "public-sans-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
  // Niente sillabazione automatica (è pensata per l'inglese)
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

/** Logo: file in public/ (es. /brands/duit.png) o URL assoluto. SVG non supportato dal PDF. */
function logoSource(url: string | null): string | null {
  if (!url || url.toLowerCase().endsWith(".svg")) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const file = path.join(process.cwd(), "public", url.replace(/^\/+/, ""));
  return existsSync(file) ? file : null;
}

const day = (d: Date | null) => (d ? d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" }) : "—");
const qty = (q: number) => q.toLocaleString("it-IT", { maximumFractionDigits: 2 });

const ink = "#11151c";
const muted = "#5a6372";
const rule = "#d9dde3";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 64, paddingHorizontal: 44, fontFamily: "Public Sans", fontSize: 9.5, color: ink, lineHeight: 1.45 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  logoTile: { width: 120, height: 48, padding: 6, borderRadius: 4, justifyContent: "center" },
  logo: { objectFit: "contain", maxHeight: 36, maxWidth: 108 },
  companyName: { fontFamily: "Archivo", fontWeight: 700, fontSize: 13 },
  companyBlock: { alignItems: "flex-end", maxWidth: 260 },
  small: { fontSize: 8.5, color: muted, textAlign: "right" },
  // Etichette: maiuscolo spaziato (il .woff di IBM Plex Mono non è leggibile dalla libreria PDF)
  label: { fontWeight: 600, fontSize: 7, letterSpacing: 1, textTransform: "uppercase", color: muted },
  title: { fontFamily: "Archivo", fontWeight: 700, fontSize: 20, marginTop: 2 },
  metaRow: { flexDirection: "row", gap: 24, marginTop: 6, marginBottom: 20 },
  parties: { flexDirection: "row", gap: 24, marginBottom: 18 },
  box: { flex: 1, borderTopWidth: 2, paddingTop: 6 },
  strong: { fontWeight: 600 },
  subject: { fontSize: 11, fontWeight: 600, marginBottom: 6 },
  para: { marginBottom: 12 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderColor: ink, paddingBottom: 4, marginTop: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: rule, paddingVertical: 6 },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 44, textAlign: "right" },
  cUnit: { width: 52, paddingLeft: 6 },
  cPrice: { width: 72, textAlign: "right" },
  cTotal: { width: 76, textAlign: "right" },
  totals: { marginTop: 10, marginLeft: "auto", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, marginTop: 4, paddingTop: 5 },
  grandText: { fontFamily: "Archivo", fontWeight: 700, fontSize: 12 },
  terms: { marginTop: 22 },
  footer: { position: "absolute", bottom: 28, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: muted, borderTopWidth: 0.5, borderColor: rule, paddingTop: 6 },
});

function QuoteDocument({ quote }: { quote: QuoteWithLines }) {
  const c = quote.company;
  const brand = safeHex(c.colorLight, ink);
  const logo = logoSource(c.logoUrl);
  const legal = [
    c.legalAddress,
    c.vatNumber && `P.IVA ${c.vatNumber}`,
    c.pec && `PEC ${c.pec}`,
    c.sdiCode && `SDI ${c.sdiCode}`,
    c.reaNumber && `REA ${c.reaNumber}`,
  ].filter(Boolean);
  const client = quote.client;
  const clientIds = [client.vatNumber && `P.IVA ${client.vatNumber}`, client.taxCode && `C.F. ${client.taxCode}`].filter(Boolean).join(" · ");
  const label = quoteLabel(quote.number, quote.issueDate);

  return (
    <Document title={`Preventivo ${label} — ${quote.title}`} author={c.legalName ?? c.name} creator={c.name} producer={c.name}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {logo ? (
            <View style={[s.logoTile, { backgroundColor: c.logoBg ? safeHex(c.logoBg, "#ffffff") : "#ffffff" }]}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- Image di react-pdf, non HTML */}
              <Image src={logo} style={s.logo} />
            </View>
          ) : (
            <Text style={[s.companyName, { color: brand }]}>{c.name}</Text>
          )}
          <View style={s.companyBlock}>
            <Text style={s.companyName}>{c.legalName ?? c.name}</Text>
            {legal.map((line) => (
              <Text key={line as string} style={s.small}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        <Text style={s.label}>Preventivo</Text>
        <Text style={s.title}>{label}</Text>
        <View style={s.metaRow}>
          <Text>
            <Text style={s.label}>Data </Text>
            {day(quote.issueDate)}
          </Text>
          {quote.validUntil && (
            <Text>
              <Text style={s.label}>Valido fino al </Text>
              {day(quote.validUntil)}
            </Text>
          )}
        </View>

        <View style={s.parties}>
          <View style={[s.box, { borderColor: brand }]}>
            <Text style={s.label}>Spettabile</Text>
            <Text style={s.strong}>{client.name}</Text>
            {clientIds && <Text>{clientIds}</Text>}
            {client.contactName && <Text>Alla c.a. di {client.contactName}</Text>}
          </View>
          <View style={[s.box, { borderColor: rule }]}>
            <Text style={s.label}>Riferimento</Text>
            <Text>{quote.createdBy?.name ?? c.name}</Text>
          </View>
        </View>

        <Text style={s.subject}>Oggetto: {quote.title}</Text>
        {quote.intro && <Text style={s.para}>{quote.intro}</Text>}

        <View style={s.th} fixed>
          <Text style={[s.label, s.cDesc]}>Descrizione</Text>
          <Text style={[s.label, s.cQty]}>Q.tà</Text>
          <Text style={[s.label, s.cUnit]}>Unità</Text>
          <Text style={[s.label, s.cPrice]}>Prezzo</Text>
          <Text style={[s.label, s.cTotal]}>Importo</Text>
        </View>
        {quote.lines.map((l) => (
          <View key={l.id} style={s.tr} wrap={false}>
            <Text style={s.cDesc}>{l.description}</Text>
            <Text style={s.cQty}>{qty(Number(l.quantity))}</Text>
            <Text style={s.cUnit}>{l.unit}</Text>
            <Text style={s.cPrice}>{formatEuro(l.unitPrice)}</Text>
            <Text style={s.cTotal}>{formatEuro(l.total)}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text>Imponibile</Text>
            <Text>{formatEuro(quote.subtotal)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text>IVA {quote.vatRate}%</Text>
            <Text>{formatEuro(quote.vat)}</Text>
          </View>
          <View style={[s.grand, { borderColor: brand }]}>
            <Text style={s.grandText}>Totale</Text>
            <Text style={s.grandText}>{formatEuro(quote.total)}</Text>
          </View>
        </View>

        {quote.terms && (
          <View style={s.terms} wrap={false}>
            <Text style={s.label}>Condizioni</Text>
            <Text>{quote.terms}</Text>
          </View>
        )}

        <View style={s.footer} fixed>
          <Text style={{ maxWidth: 420 }}>{c.quoteFooter ?? `${c.legalName ?? c.name}${c.vatNumber ? ` · P.IVA ${c.vatNumber}` : ""}`}</Text>
          <Text render={({ pageNumber, totalPages }) => `${label} · ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderQuotePdf(quote: QuoteWithLines): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<QuoteDocument quote={quote} />);
}

/** «Preventivo-30-2026-Teatro-Nuovo.pdf» */
export function pdfFileName(quote: QuoteWithLines): string {
  const year = quote.issueDate.toLocaleDateString("it-IT", { year: "numeric", timeZone: "Europe/Rome" });
  const client = quote.client.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `Preventivo-${quote.number}-${year}-${client}.pdf`;
}
