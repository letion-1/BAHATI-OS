import type { Metadata } from "next";

import "@fontsource/bebas-neue/400.css";
import "@fontsource/cascadia-code/400.css";
import "@fontsource/cascadia-code/500.css";
import "@fontsource/cascadia-code/600.css";
import "@fontsource/cascadia-code/700.css";

import { AppShell } from "@/components/app-shell/app-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: "Bahari OS",
  description: "AI operating system for yacht charter brokers",
};

const themeBootScript = `
(function () {
  try {
    var savedTheme = localStorage.getItem("intrigue-theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var useDark =
      savedTheme === "dark" ||
      (savedTheme !== "light" && prefersDark);

    document.documentElement.classList.toggle("dark", useDark);
    document.documentElement.style.colorScheme = useDark ? "dark" : "light";
  } catch (_) {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: themeBootScript,
          }}
        />
      </head>

      <body className="min-h-dvh bg-background font-body text-foreground antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}