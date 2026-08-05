"use client";

import {
  Moon,
  Sun,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";

type Theme = "light" | "dark";

function getCurrentTheme(): Theme {
  if (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains(
      "dark"
    )
  ) {
    return "dark";
  }

  return "light";
}

export function ThemeToggle() {
  const [theme, setTheme] =
    useState<Theme>("dark");
  const [mounted, setMounted] =
    useState(false);

  useEffect(() => {
    setTheme(getCurrentTheme());
    setMounted(true);
  }, []);

  function applyTheme(nextTheme: Theme) {
    const useDark =
      nextTheme === "dark";

    document.documentElement.classList.toggle(
      "dark",
      useDark
    );

    document.documentElement.style.colorScheme =
      useDark ? "dark" : "light";

    localStorage.setItem(
      "intrigue-theme",
      nextTheme
    );

    setTheme(nextTheme);
  }

  function toggleTheme() {
    applyTheme(
      theme === "dark"
        ? "light"
        : "dark"
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="apple-transition inline-flex size-9 items-center justify-center rounded-xl border border-border bg-card/60 text-muted-foreground shadow-sm backdrop-blur-xl hover:-translate-y-0.5 hover:bg-accent hover:text-foreground"
      aria-label={
        mounted && theme === "dark"
          ? "Switch to light mode"
          : "Switch to dark mode"
      }
      title={
        mounted && theme === "dark"
          ? "Light mode"
          : "Dark mode"
      }
    >
      {!mounted ? (
        <span className="size-4" />
      ) : theme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </button>
  );
}