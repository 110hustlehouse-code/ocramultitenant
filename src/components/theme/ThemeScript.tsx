"use client";

export const THEME_STORAGE_KEY = "ocra-theme";

/**
 * Imposta il tema prima del primo paint (niente lampo bianco).
 * Preferenza salvata per browser: light | dark | system.
 * Schema da docs Next: guides/preventing-flash-before-hydration.
 */
const script = `(function(){var p;try{p=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}
var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.dataset.theme=d?"dark":"light";})();`;

export function ThemeScript() {
  // Lo script serve solo nell'HTML del server. Se React lo ricrea nel browser
  // (es. rendering client di una 404) diventa un blocco dati inerte: nessun avviso, nessun effetto.
  return (
    <script
      suppressHydrationWarning
      type={typeof window === "undefined" ? undefined : "text/plain"}
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
