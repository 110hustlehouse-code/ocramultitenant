import type { NextConfig } from "next";

// In Codespaces l'app è servita da <nome>-<porta>.<dominio di inoltro> (es. app.github.dev o
// preview.app.github.dev): senza questi permessi Server Actions (login incluso) e HMR vengono rifiutati.
// «**» copre qualsiasi profondità di sottodominio; «*» ne copre uno solo e non basta.
const forwarding = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
const codespaceOrigins =
  process.env.CODESPACES === "true"
    ? ["**.app.github.dev", ...(forwarding ? [`**.${forwarding}`] : [])]
    : [];

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
