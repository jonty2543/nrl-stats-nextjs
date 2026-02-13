"use client";

import { useEffect, useSyncExternalStore } from "react";

type AppTheme = "dark" | "light";

const STORAGE_KEY = "nrl-theme";
const THEME_EVENT = "nrl-theme-change";

function getStoredTheme(): AppTheme | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    return null;
  }
  return null;
}

function getPreferredTheme(): AppTheme {
  const saved = getStoredTheme();
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function getSnapshot(): AppTheme {
  if (typeof window === "undefined") return "dark";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return getPreferredTheme();
}

function getServerSnapshot(): AppTheme {
  return "dark";
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const media = window.matchMedia("(prefers-color-scheme: light)");
  const handler = () => onStoreChange();

  window.addEventListener(THEME_EVENT, handler);
  window.addEventListener("storage", handler);
  media.addEventListener("change", handler);

  return () => {
    window.removeEventListener(THEME_EVENT, handler);
    window.removeEventListener("storage", handler);
    media.removeEventListener("change", handler);
  };
}

function applyTheme(theme: AppTheme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures (private mode, blocked storage, etc.)
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const preferred = getPreferredTheme();
    if (preferred !== theme) {
      applyTheme(preferred);
    }
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme: AppTheme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="cursor-pointer rounded-md border border-nrl-border bg-nrl-panel-2 px-2.5 py-1 text-xs font-semibold text-nrl-muted transition-colors hover:border-nrl-accent hover:text-nrl-text"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
