"use client";

import { useSyncExternalStore } from "react";

type ThemeName = "light" | "dark";

const STORAGE_KEY = "nosite-theme";
const THEME_CHANGE_EVENT = "nosite-theme-change";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, readCurrentTheme, getServerThemeSnapshot);
  const nextTheme: ThemeName = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className={`btn-glass text-xs ${className}`}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={() => {
        applyTheme(nextTheme);
      }}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      <span suppressHydrationWarning>{nextTheme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}

function subscribeTheme(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", onStoreChange);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
    mediaQuery.removeEventListener("change", onStoreChange);
  };
}

function getServerThemeSnapshot(): ThemeName {
  return "light";
}

function readCurrentTheme(): ThemeName {
  if (typeof document !== "undefined") {
    const documentTheme = document.documentElement.dataset.theme;
    if (documentTheme === "dark" || documentTheme === "light") return documentTheme;
  }

  if (typeof window !== "undefined") {
    try {
      const storedTheme = window.localStorage.getItem(STORAGE_KEY);
      if (storedTheme === "dark" || storedTheme === "light") return storedTheme;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  }

  return "light";
}

function applyTheme(theme: ThemeName) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable in private contexts; the live document theme still changes.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

function SunIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 7.42A9 9 0 1 1 12 3Z" />
    </svg>
  );
}
