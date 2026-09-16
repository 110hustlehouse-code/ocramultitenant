import type { NextConfig } from "next";

// In Codespaces l'app è servita da <nome>-3000.app.github.dev:
// senza questi permessi le Server Actions e l'HMR vengono rifiutati.
const codespaceOrigins = process.env.CODESPACES === "true" ? ["*.app.github.dev"] : [];

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
