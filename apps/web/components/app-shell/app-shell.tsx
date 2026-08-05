"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Anchor,
  BarChart3,
  Bot,
  CalendarDays,
  Database,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Settings,
  Ship,
  Users,
} from "lucide-react";

import { logout } from "@/app/logout/actions";
import { GlobalSearch } from "@/components/app-shell/global-search";
import { NotificationsPanel } from "@/components/app-shell/notifications-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const navigation = [
  {
    name: "Mission Control",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    name: "Inquiries",
    href: "/inquiries",
    icon: MessageSquareText,
  },
  {
    name: "Fleet",
    href: "/fleet",
    icon: Ship,
  },
  {
    name: "Availability",
    href: "/availability",
    icon: CalendarDays,
  },
  {
    name: "Data Sources",
    href: "/data-sources",
    icon: Database,
  },
  {
    name: "Clients",
    href: "/clients",
    icon: Users,
  },
  {
    name: "Proposals",
    href: "/proposals",
    icon: FileText,
  },
  {
    name: "Documents",
    href: "/documents",
    icon: FolderOpen,
  },
  {
    name: "AI Copilot",
    href: "/ai-copilot",
    icon: Bot,
  },
  {
    name: "Reports",
    href: "/reports",
    icon: BarChart3,
  },
];

function isActiveRoute(
  pathname: string,
  href: string
) {
  if (href === "/") {
    return pathname === "/";
  }

  return (
    pathname === href ||
    pathname.startsWith(`${href}/`)
  );
}

function isPublicRoute(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/forgot-password" ||
    pathname.startsWith(
      "/forgot-password/"
    ) ||
    pathname === "/reset-password" ||
    pathname.startsWith(
      "/reset-password/"
    ) ||
    pathname.startsWith("/auth/")
  );
}

export function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (isPublicRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="shrink-0 px-5 pt-5">
          <Link
            href="/"
            className="apple-transition flex items-center gap-3 rounded-2xl px-2 py-3 hover:bg-sidebar-accent"
          >
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Anchor className="size-5" />
            </div>

            <div>
              <p className="font-heading text-2xl leading-none tracking-[0.08em]">
                Intrigue
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Yacht OS
              </p>
            </div>
          </Link>

          <Separator className="my-5 bg-sidebar-border" />
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 pb-5">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActiveRoute(
              pathname,
              item.href
            );

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`apple-transition flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="size-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border bg-sidebar p-5">
          <Link
            href="/settings"
            className={`apple-transition flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm ${
              isActiveRoute(
                pathname,
                "/settings"
              )
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <Settings className="size-4" />
            Settings
          </Link>

          <div className="mt-4 rounded-2xl border border-sidebar-border bg-card/60 p-3 shadow-sm backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback className="bg-secondary text-secondary-foreground">
                  LK
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  Letion Ketienya
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  Workspace owner
                </p>
              </div>
            </div>

            <form
              action={logout}
              className="mt-3"
            >
              <button
                type="submit"
                className="apple-transition inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background/40 px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <LogOut className="size-3.5" />
                Log out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <section className="min-w-0 lg:pl-72">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-border bg-background/80 px-5 backdrop-blur-2xl lg:px-8">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-xl border-border bg-card/50 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </Button>

            <div>
              <p className="font-heading text-xl leading-none tracking-[0.06em]">
                Intrigue Yacht OS
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Charter intelligence workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <GlobalSearch />
            <NotificationsPanel />
            <ThemeToggle />

            <Link
              href="/inquiries/new"
              className="apple-transition inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:-translate-y-0.5 hover:opacity-90"
            >
              <MessageSquareText className="size-4" />
              <span className="hidden sm:inline">
                New inquiry
              </span>
            </Link>

            <form
              action={logout}
              className="lg:hidden"
            >
              <button
                type="submit"
                className="apple-transition inline-flex size-9 items-center justify-center rounded-xl border border-border bg-card/50 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Log out"
                title="Log out"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </header>

        <main className="min-h-[calc(100dvh-5rem)]">
          {children}
        </main>
      </section>
    </div>
  );
}