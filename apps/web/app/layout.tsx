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
    /*
     * Client-facing pages are always light.
     *
     * The theme is a broker's personal preference stored in their own
     * localStorage, and it has nothing to do with a charter client opening a
     * contract link. Letting it apply meant the document a client reads
     * looked different depending on a setting they cannot see and did not
     * choose, and a signed brokerage agreement rendered in dark mode reads
     * as a broken page rather than a deliberate one.
     *
     * Decided here, in the boot script, rather than in the page component.
     * Anywhere later and the dark class is already on <html> for a frame,
     * which the reader sees as a flash of the wrong theme.
     */
    var path = window.location.pathname;
    var isClientFacing =
      path.indexOf("/contract-review") === 0 ||
      path.indexOf("/proposal-review") === 0 ||
      path.indexOf("/guest") === 0;

    if (isClientFacing) {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
      return;
    }

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