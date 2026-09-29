import type { NextConfig } from "next";

// In Codespaces l'app è servita da <nome>-3000.app.github.dev:
// senza questi permessi le Server Actions e l'HMR vengono rifiutati.
// Calcoliamo l'host esatto (invece di affidarci al wildcard *.app.github.dev,
// che in alcune versioni di Next.js non fa match correttamente).
const codespaceName = process.env.CODESPACE_NAME;
const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;

const codespaceOrigins =
  process.env.CODESPACES === "true" && codespaceName && forwardingDomain
    ? [`${codespaceName}-3000.${forwardingDomain}`, "*.app.github.dev"]
    : [];

console.log("DEBUG codespaceOrigins:", codespaceOrigins);
console.log("DEBUG env:", { CODESPACES: process.env.CODESPACES, codespaceName, forwardingDomain });

const nextConfig: NextConfig = {
  allowedDevOrigins: codespaceOrigins,
  experimental: {
    serverActions: {
      allowedOrigins: codespaceOrigins,
    },
  },
  poweredByHeader: false,
};

export default nextConfig;