"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Ricarica i dati della pagina a intervalli, finché è montato (es. durante l'elaborazione). */
export function AutoRefresh({ every = 4000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
