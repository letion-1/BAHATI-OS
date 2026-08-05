"use client";

import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { HeroCard } from "@/components/ui/hero-card";
import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";

type AvailabilityStatus =
  | "available"
  | "provisional"
  | "option"
  | "booked"
  | "unavailable"
  | "maintenance";

type DashboardResponse = {
  success: boolean;

  user: {
    id: string;
    email: string | null;
    displayName: string;
    firstName: string;
  };

  workspace: {
    id: string;
  };

  overview: {
    yachtCount: number;
    availableYachtCount: number;
    bookedYachtCount: number;
    maintenanceYachtCount: number;
    sourceCount: number;
    healthySourceCount: number;
    latestUpdate: string | null;
  };

  availability: Record<AvailabilityStatus, number>;

  upcomingAvailability: Array<{
    id: string;
    yachtId: string;
    yachtName: string;
    startDate: string;
    endDate: string;
    weeklyRate: number | null;
    currency: string;
    sourceName: string | null;
  }>;

  sources: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    lastSyncedAt: string | null;
    yachtCount: number;
    availabilityCount: number;
    error: string | null;
  }>;

  activities: Array<{
    id: string;
    title: string;
    description: string | null;
    createdAt: string;
  }>;

  error?: string;
};

const statusOrder: AvailabilityStatus[] = [
  "available",
  "booked",
  "option",
  "provisional",
  "maintenance",
  "unavailable",
];

const statusLabels: Record<AvailabilityStatus, string> = {
  available: "Available",
  provisional: "Provisional",
  option: "Option",
  booked: "Booked",
  unavailable: "Unavailable",
  maintenance: "Maintenance",
};

const statusBarStyles: Record<AvailabilityStatus, string> = {
  available: "bg-emerald-400",
  provisional: "bg-cyan-400",
  option: "bg-amber-400",
  booked: "bg-violet-400",
  unavailable: "bg-red-400",
  maintenance: "bg-orange-400",
};

const statusDotStyles: Record<AvailabilityStatus, string> = {
  available: "bg-emerald-400 shadow-emerald-400/40",
  provisional: "bg-cyan-400 shadow-cyan-400/40",
  option: "bg-amber-400 shadow-amber-400/40",
  booked: "bg-violet-400 shadow-violet-400/40",
  unavailable: "bg-red-400 shadow-red-400/40",
  maintenance: "bg-orange-400 shadow-orange-400/40",
};

export default function MissionControlPage() {
  const [data, setData] = useState<DashboardResponse | null>(
    null
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(
    async (refreshing: boolean) => {
      try {
        if (refreshing) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }

        setError(null);

        const response = await fetch("/api/dashboard", {
          method: "GET",
          cache: "no-store",
        });

        const result =
          (await response.json()) as DashboardResponse;

        if (!response.ok || !result.success) {
          throw new Error(
            result.error ?? "Could not load dashboard."
          );
        }

        setData(result);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load dashboard."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadDashboard(false);
  }, [loadDashboard]);

  const totalAvailability = useMemo(() => {
    if (!data) {
      return 0;
    }

    return Object.values(data.availability).reduce(
      (total, count) => total + count,
      0
    );
  }, [data]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!data) {
    return (
      <PageContainer>
        <HeroCard
          eyebrow="Mission Control"
          title="Dashboard unavailable"
          description="The dashboard could not be loaded from the protected workspace."
        />

        <div className="mt-8 rounded-2xl border border-red-500/25 bg-red-500/10 p-6">
          <p className="text-sm text-red-700 dark:text-red-200">
            {error ?? "Could not load dashboard."}
          </p>

          <button
            type="button"
            onClick={() => void loadDashboard(false)}
            className="ui-primary-button apple-transition mt-5 px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5"
          >
            Try again
          </button>
        </div>
      </PageContainer>
    );
  }

  const greeting = getGreeting();

  return (
    <PageContainer contentClassName="space-y-7">
      <HeroCard
        eyebrow="Mission Control"
        title={`${greeting}, ${data.user.firstName}.`}
        description="Your fleet is connected and reporting. Here is what is happening across your charter workspace."
        footer={
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>
              Signed in as{" "}
              <strong className="font-medium text-[var(--hero-foreground)]">
                {data.user.displayName}
              </strong>
            </span>

            <span className="hidden size-1 rounded-full bg-current/30 sm:block" />

            <span>
              Last data update:{" "}
              <strong className="font-medium text-[var(--hero-foreground)]">
                {formatDateTime(data.overview.latestUpdate)}
              </strong>
            </span>
          </div>
        }
        actions={
          <button
            type="button"
            onClick={() => void loadDashboard(true)}
            disabled={isRefreshing}
            className="ui-primary-button apple-transition inline-flex min-h-12 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshIcon spinning={isRefreshing} />

            {isRefreshing
              ? "Refreshing..."
              : "Refresh dashboard"}
          </button>
        }
      />

      {error ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-4 text-sm text-amber-800 dark:text-amber-100">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Fleet yachts"
          value={data.overview.yachtCount}
          subtitle="Total yachts connected"
          icon={<YachtIcon />}
          tone="cyan"
        />
        <StatCard
          label="Available yachts"
          value={data.overview.availableYachtCount}
          subtitle="With future availability"
          icon={<AvailableIcon />}
          tone="emerald"
        />
        <StatCard
          label="Booked yachts"
          value={data.overview.bookedYachtCount}
          subtitle="With upcoming bookings"
          icon={<BookedIcon />}
          tone="violet"
        />
        <StatCard
          label="Connected sources"
          value={data.overview.sourceCount}
          subtitle={`${data.overview.healthySourceCount} healthy sources`}
          icon={<SourceIcon />}
          tone="cyan"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <DashboardPanel
          title="Fleet status"
          description="Future availability windows by status"
        >
          <div className="space-y-5">
            {statusOrder.map((status) => {
              const count = data.availability[status] ?? 0;
              const percentage =
                totalAvailability > 0
                  ? Math.max(
                      count > 0 ? 5 : 0,
                      Math.round((count / totalAvailability) * 100)
                    )
                  : 0;

              return (
                <div key={status}>
                  <div className="mb-2.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`size-2.5 rounded-full shadow-lg ${statusDotStyles[status]}`}
                      />
                      <span className="text-sm font-medium text-foreground">
                        {statusLabels[status]}
                      </span>
                    </div>

                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {count}
                    </span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${statusBarStyles[status]}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </DashboardPanel>

        <DashboardPanel
          title="Upcoming availability"
          description="The next available charter windows"
          action={
            <Link
              href="/availability"
              className="apple-transition text-sm font-semibold text-cyan-700 hover:opacity-70 dark:text-cyan-300"
            >
              View timeline
            </Link>
          }
        >
          {data.upcomingAvailability.length === 0 ? (
            <EmptyState
              title="No upcoming availability"
              description="Available charter windows will appear after a source synchronizes."
            />
          ) : (
            <div className="divide-y divide-border">
              {data.upcomingAvailability.map((item) => (
                <Link
                  key={item.id}
                  href={`/availability?startDate=${item.startDate}`}
                  className="group flex items-start justify-between gap-5 py-4 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground transition group-hover:text-cyan-700 dark:group-hover:text-cyan-300">
                      {item.yachtName}
                    </p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {formatDateRange(item.startDate, item.endDate)}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground/75">
                      Source: {item.sourceName ?? "Unknown source"}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {formatRate(item.weeklyRate, item.currency)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/75">
                      per week
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </DashboardPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <DashboardPanel
          title="Source health"
          description="Status of connected fleet sources"
          action={
            <Link
              href="/data-sources"
              className="apple-transition text-sm font-semibold text-cyan-700 hover:opacity-70 dark:text-cyan-300"
            >
              Manage sources
            </Link>
          }
        >
          {data.sources.length === 0 ? (
            <EmptyState
              title="No connected sources"
              description="Connect your first fleet source to begin importing availability."
            />
          ) : (
            <div className="space-y-3">
              {data.sources.map((source) => (
                <div
                  key={source.id}
                  className="ui-panel-soft apple-transition rounded-2xl p-4 hover:-translate-y-0.5 hover:border-ring/30"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">
                        {source.name}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatSourceType(source.type)}
                      </p>
                    </div>

                    <SourceStatusBadge status={source.status} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Metric label="Yachts" value={source.yachtCount} />
                    <Metric label="Windows" value={source.availabilityCount} />
                  </div>

                  <p className="mt-4 text-xs text-muted-foreground/75">
                    Last synchronized {formatRelativeTime(source.lastSyncedAt)}
                  </p>

                  {source.error ? (
                    <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-700 dark:text-red-200">
                      {source.error}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel
          title="Recent activity"
          description="Latest imports and workspace updates"
        >
          {data.activities.length === 0 ? (
            <EmptyState
              title="No recent activity"
              description="Synchronization activity will appear here."
            />
          ) : (
            <div className="space-y-5">
              {data.activities.map((activity) => (
                <div key={activity.id} className="flex gap-4">
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                    <CheckIcon />
                  </div>

                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      {activity.title}
                    </p>

                    {activity.description ? (
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {activity.description}
                      </p>
                    ) : null}

                    <p className="mt-1.5 text-xs text-muted-foreground/70">
                      {formatRelativeTime(activity.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashboardPanel>
      </section>

      <DashboardPanel
        title="Quick actions"
        description="Jump into your most common broker workflows"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction href="/inquiries" title="New inquiry" description="Start a client request" />
          <QuickAction href="/availability" title="View availability" description="Open the fleet timeline" />
          <QuickAction href="/data-sources" title="Add data source" description="Connect another supplier" />
          <QuickAction href="/fleet" title="Browse fleet" description="View imported yachts" />
        </div>
      </DashboardPanel>
    </PageContainer>
  );
}

function DashboardPanel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ui-panel rounded-[24px] p-5 sm:p-6">
      <SectionHeader
        title={title}
        subtitle={description}
        action={action}
        className="mb-6"
      />
      {children}
    </section>
  );
}

function QuickAction({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="ui-panel-soft apple-transition group rounded-2xl p-4 hover:-translate-y-0.5 hover:border-ring/30"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="font-semibold text-foreground">{title}</p>
        <span className="text-lg text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground">
          →
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background/45 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-2xl leading-none tracking-[0.04em] text-foreground">
        {value}
      </p>
    </div>
  );
}

function SourceStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  const style =
    normalized === "healthy"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : normalized === "syncing"
        ? "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300"
        : normalized === "error"
          ? "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"
          : "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${style}`}>
      {status}
    </span>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <PageContainer>
      <div className="animate-pulse space-y-7">
        <div className="h-64 rounded-[30px] bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-40 rounded-[24px] bg-muted" />
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="h-96 rounded-[24px] bg-muted" />
          <div className="h-96 rounded-[24px] bg-muted" />
        </div>
      </div>
    </PageContainer>
  );
}

function RefreshIcon({
  spinning,
}: {
  spinning: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`h-4 w-4 ${
        spinning ? "animate-spin" : ""
      }`}
      aria-hidden="true"
    >
      <path d="M20 11a8 8 0 1 0-2.34 5.66" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

function YachtIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M3 15h18l-2 4H5l-2-4Z" />
      <path d="M8 15V8h8l3 7" />
      <path d="M10 8V5h4v3" />
    </svg>
  );
}

function AvailableIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}

function BookedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

function SourceIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="m6 12 4 4 8-9" />
    </svg>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 18) {
    return "Good afternoon";
  }

  return "Good evening";
}

function formatRate(
  amount: number | null,
  currency: string
): string {
  if (amount === null) {
    return "Rate on request";
  }

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${
      currency || "EUR"
    } ${amount.toLocaleString()}`;
  }
}

function formatDateRange(
  startDate: string,
  endDate: string
): string {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  return `${start.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })} – ${end.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "No updates yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return "never";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "at an unknown time";
  }

  const difference = timestamp - Date.now();
  const absoluteDifference = Math.abs(difference);

  const formatter = new Intl.RelativeTimeFormat("en", {
    numeric: "auto",
  });

  if (absoluteDifference < 60_000) {
    return "just now";
  }

  if (absoluteDifference < 3_600_000) {
    return formatter.format(
      Math.round(difference / 60_000),
      "minute"
    );
  }

  if (absoluteDifference < 86_400_000) {
    return formatter.format(
      Math.round(difference / 3_600_000),
      "hour"
    );
  }

  return formatter.format(
    Math.round(difference / 86_400_000),
    "day"
  );
}

function formatSourceType(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}