import type { Metadata } from "next";
import "@fontsource-variable/archivo";
import "@fontsource-variable/public-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { ThemeScript } from "@/components/theme/ThemeScript";

export const metadata: Metadata = {
  title: { default: "OCRA", template: "%s · OCRA" },
  description: "Il gestionale per agenzie che lavorano a progetto.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
