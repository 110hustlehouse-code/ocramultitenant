import type { NextConfig } from "next";

// In Codespaces l'app è servita da <nome>-<porta>.app.github.dev, ma il proxy di
// Codespaces riscrive l'header Origin in "localhost:<porta>" mentre x-forwarded-host
// resta il dominio pubblico: Next vede i due host diversi e rifiuta le Server Actions
// (vercel/next.js#58019). Autorizziamo quindi sia il dominio pubblico sia localhost.
// Solo in Codespaces: in produzione la lista resta vuota.
// Porte: PORT se impostata, più 3000 e 3001 (Next ripiega sulla 3001 se la 3000 è occupata).
const codespaceName = process.env.CODESPACE_NAME;
const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
const ports = [...new Set([process.env.PORT, "3000", "3001"].filter(Boolean))];

const codespaceOrigins =
  process.env.CODESPACES === "true" && codespaceName && forwardingDomain
    ? ports.flatMap((port) => [`${codespaceName}-${port}.${forwardingDomain}`, `localhost:${port}`])
    : [];

const nextConfig: NextConfig = {
  allowedDevOrigins: codespaceOrigins,
  experimental: {
    serverActions: {
      allowedOrigins: codespaceOrigins,
    },
  },
  poweredByHeader: false,
  // Il PDF del preventivo legge font e loghi dal disco: vanno inclusi nella funzione.
  outputFileTracingIncludes: {
    "/preventivi/[id]/pdf": ["./src/server/quotes/fonts/**/*", "./public/brands/**/*"],
  },
};

export default nextConfig;
