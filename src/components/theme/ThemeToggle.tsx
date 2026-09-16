"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "@/components/theme/ThemeScript";

type Preference = "light" | "dark" | "system";
const ORDER: Preference[] = ["system", "light", "dark"];
const LABELS: Record<Preference, string> = {
  system: "Tema di sistema",
  light: "Tema chiaro",
  dark: "Tema scuro",
};

// ─── Piccolo store sulla preferenza salvata nel browser ──────
const listeners = new Set<() => void>();
let fallback: Preference = "system"; // se localStorage non è disponibile

function read(): Preference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return fallback;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function write(pref: Preference) {
  fallback = pref;
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // storage non disponibile: vale il fallback in memoria
  }
  listeners.forEach((l) => l());
}

function apply(pref: Preference) {
  const dark =
    pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribe, read, () => "system" as Preference);

  // Applica il tema quando cambia la preferenza (anche da un'altra scheda)
  useEffect(() => {
    apply(pref);
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;

  return (
    <button
      type="button"
      onClick={() => write(next)}
      title={LABELS[pref]}
      aria-label={`${LABELS[pref]} — passa a: ${LABELS[next].toLowerCase()}`}
      className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted hover:bg-surface-2 hover:text-text"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
