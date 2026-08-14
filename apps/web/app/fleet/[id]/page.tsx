"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
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
import { YachtProfileManager } from "@/components/fleet/yacht-profile-manager";

type AvailabilityStatus =
  | "available"
  | "provisional"
  | "option"
  | "booked"
  | "unavailable"
  | "maintenance";

type YachtStatus =
  | AvailabilityStatus
  | "no_availability";

type YachtDetailResponse = {
  success: boolean;

  yacht: {
    id: string;
    name: string;
    status: YachtStatus;

    overview: {
      availabilityCount: number;
      futureAvailabilityCount: number;
      historicalAvailabilityCount: number;
      sourceCount: number;
      availableCount: number;
      bookedCount: number;
      optionCount: number;
      provisionalCount: number;
      maintenanceCount: number;
      unavailableCount: number;
    };

    rates: {
      lowestWeeklyRate: number | null;
      highestWeeklyRate: number | null;
      currency: string;
    };

    nextAvailable: {
      id: string;
      startDate: string;
      endDate: string;
      weeklyRate: number | null;
      currency: string;
    } | null;

    nextBooking: {
      id: string;
      startDate: string;
      endDate: string;
      weeklyRate: number | null;
      currency: string;
    } | null;

    statusCounts: Record<AvailabilityStatus, number>;

    sources: Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      lastSyncedAt: string | null;
      error: string | null;
      availabilityCount: number;
    }>;

    availability: Array<{
      id: string;
      startDate: string;
      endDate: string;
      status: AvailabilityStatus;
      weeklyRate: number | null;
      currency: string;
      isCurrent: boolean;
      isPast: boolean;

      source: {
        id: string;
        name: string;
        type: string;
      } | null;
    }>;
  };

  error?: string;
};

const statusLabels: Record<YachtStatus, string> = {
  available: "Available",
  provisional: "Provisional",
  option: "Option",
  booked: "Booked",
  unavailable: "Unavailable",
  maintenance: "Maintenance",
  no_availability: "No availability",
};

const statusDotStyles: Record<AvailabilityStatus, string> = {
  available: "bg-emerald-400",
  provisional: "bg-cyan-400",
  option: "bg-amber-400",
  booked: "bg-violet-400",
  unavailable: "bg-red-400",
  maintenance: "bg-orange-400",
};

const statusOrder: AvailabilityStatus[] = [
  "available",
  "booked",
  "option",
  "provisional",
  "maintenance",
  "unavailable",
];

export default function YachtDetailPage() {
  const params = useParams<{ id: string }>();
  const yachtId = params.id;

  const [data, setData] =
    useState<YachtDetailResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadYacht = useCallback(
    async (refreshing: boolean) => {
      if (!yachtId) {
        return;
      }

      try {
        if (refreshing) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }

        setError(null);

        const response = await fetch(
          `/api/fleet/${encodeURIComponent(yachtId)}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result =
          (await response.json()) as YachtDetailResponse;

        if (!response.ok || !result.success) {
          throw new Error(
            result.error ?? "Could not load yacht."
          );
        }

        setData(result);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load yacht."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [yachtId]
  );

  useEffect(() => {
    void loadYacht(false);
  }, [loadYacht]);

  const visibleAvailability = useMemo(() => {
    if (!data) {
      return [];
    }

    if (showHistory) {
      return data.yacht.availability;
    }

    return data.yacht.availability.filter(
      (window) => !window.isPast
    );
  }, [data, showHistory]);

  if (isLoading) {
    return <YachtDetailSkeleton />;
  }

  if (!data) {
    return (
      <PageContainer>
        <Link
          href="/fleet"
          className="apple-transition inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 hover:opacity-75 dark:text-cyan-300"
        >
          ← Back to fleet
        </Link>

        <div className="mt-8 rounded-2xl border border-red-500/25 bg-red-500/10 p-6">
          <h1 className="font-heading text-3xl tracking-[0.05em] text-foreground">
            Yacht unavailable
          </h1>

          <p className="mt-3 text-sm text-red-700 dark:text-red-200">
            {error ?? "Could not load yacht."}
          </p>

          <button
            type="button"
            onClick={() => void loadYacht(false)}
            className="ui-primary-button apple-transition mt-5 px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </PageContainer>
    );
  }

  const yacht = data.yacht;

  return (
    <PageContainer contentClassName="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/fleet"
          className="apple-transition inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <span>←</span>
          Back to fleet
        </Link>

        <button
          type="button"
          onClick={() => void loadYacht(true)}
          disabled={isRefreshing}
          className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshIcon spinning={isRefreshing} />
          {isRefreshing ? "Refreshing..." : "Refresh yacht"}
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-4 text-sm text-amber-800 dark:text-amber-100">
          {error}
        </div>
      ) : null}

      <section className="ui-hero rounded-[30px] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-44 w-80 rounded-full bg-violet-400/10 blur-3xl" />

        <div className="relative grid gap-8 xl:grid-cols-[1fr_420px] xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={yacht.status} />
              <span className="ui-hero-muted text-xs font-semibold uppercase tracking-[0.22em]">
                Yacht profile
              </span>
            </div>

            <h1 className="mt-6 text-balance text-6xl leading-none tracking-[0.055em] text-[var(--hero-foreground)] sm:text-7xl">
              {yacht.name}
            </h1>

            <p className="ui-hero-muted mt-4 max-w-2xl text-sm leading-7 sm:text-base">
              Live availability intelligence from{" "}
              {yacht.overview.sourceCount} connected{" "}
              {yacht.overview.sourceCount === 1 ? "source" : "sources"}.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={`/availability?yachtId=${yacht.id}`}
                className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
              >
                View timeline
              </Link>

              <Link
                href={`/proposals/new?yachtId=${yacht.id}`}
                className="apple-transition inline-flex min-h-11 items-center justify-center rounded-[0.9rem] border border-current/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-[var(--hero-foreground)] hover:-translate-y-0.5 hover:bg-white/10"
              >
                Create proposal
              </Link>
            </div>
          </div>

          <div className="relative flex min-h-52 items-center justify-center overflow-hidden rounded-[24px] border border-current/10 bg-black/10">
            <div className="absolute size-44 rounded-full bg-cyan-400/10 blur-3xl" />
            <YachtIllustration />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Availability windows"
          value={yacht.overview.availabilityCount}
          subtitle={`${yacht.overview.futureAvailabilityCount} current or future`}
          tone="neutral"
        />
        <StatCard
          label="Available windows"
          value={yacht.overview.availableCount}
          subtitle="Open charter periods"
          tone="emerald"
        />
        <StatCard
          label="Booked windows"
          value={yacht.overview.bookedCount}
          subtitle="Confirmed charter periods"
          tone="violet"
        />
        <StatCard
          label="Connected sources"
          value={yacht.overview.sourceCount}
          subtitle="Supplying yacht data"
          tone="cyan"
        />
      </section>

      <YachtProfileManager
        yachtId={yacht.id}
        onUpdated={() => void loadYacht(true)}
      />

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardPanel
          title="Commercial overview"
          description="Rates and the next important charter windows"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailCard
              label="Weekly rate"
              value={formatRateRange(
                yacht.rates.lowestWeeklyRate,
                yacht.rates.highestWeeklyRate,
                yacht.rates.currency
              )}
              description="Imported rate range"
            />

            <DetailCard
              label="Current status"
              value={statusLabels[yacht.status]}
              description="Based on current and future windows"
            />

            <DetailCard
              label="Next available"
              value={
                yacht.nextAvailable
                  ? formatDateRange(
                      yacht.nextAvailable.startDate,
                      yacht.nextAvailable.endDate
                    )
                  : "Not scheduled"
              }
              description={
                yacht.nextAvailable
                  ? formatRate(
                      yacht.nextAvailable.weeklyRate,
                      yacht.nextAvailable.currency
                    )
                  : "No future available window"
              }
            />

            <DetailCard
              label="Next booking"
              value={
                yacht.nextBooking
                  ? formatDateRange(
                      yacht.nextBooking.startDate,
                      yacht.nextBooking.endDate
                    )
                  : "Not scheduled"
              }
              description={
                yacht.nextBooking
                  ? formatRate(
                      yacht.nextBooking.weeklyRate,
                      yacht.nextBooking.currency
                    )
                  : "No future booking"
              }
            />
          </div>
        </DashboardPanel>

        <DashboardPanel
          title="Status distribution"
          description="All imported availability windows"
        >
          <div className="space-y-5">
            {statusOrder.map((status) => {
              const count = yacht.statusCounts[status] ?? 0;
              const percentage =
                yacht.overview.availabilityCount > 0
                  ? Math.max(
                      count > 0 ? 4 : 0,
                      Math.round(
                        (count / yacht.overview.availabilityCount) * 100
                      )
                    )
                  : 0;

              return (
                <div key={status}>
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`size-2.5 rounded-full ${statusDotStyles[status]}`}
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
                      className={`h-full rounded-full ${statusDotStyles[status]}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </DashboardPanel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <DashboardPanel
          title="Connected sources"
          description="Suppliers contributing yacht data"
        >
          {yacht.sources.length === 0 ? (
            <EmptyState
              title="No connected source"
              description="This yacht currently has no linked data source."
            />
          ) : (
            <div className="space-y-3">
              {yacht.sources.map((source) => (
                <article
                  key={source.id}
                  className="ui-panel-soft apple-transition rounded-2xl p-4 hover:-translate-y-0.5 hover:border-ring/25"
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
                    <MiniMetric
                      label="Windows"
                      value={source.availabilityCount}
                    />
                    <MiniMetric
                      label="Last sync"
                      value={formatRelativeTime(source.lastSyncedAt)}
                    />
                  </div>

                  {source.error ? (
                    <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-700 dark:text-red-200">
                      {source.error}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel
          title="Availability schedule"
          description="Current, upcoming and historical charter windows"
          action={
            <button
              type="button"
              onClick={() => setShowHistory((current) => !current)}
              className="apple-transition text-sm font-semibold text-cyan-700 hover:opacity-75 dark:text-cyan-300"
            >
              {showHistory ? "Hide history" : "Show history"}
            </button>
          }
        >
          {visibleAvailability.length === 0 ? (
            <EmptyState
              title="No availability windows"
              description="No matching availability records were found."
            />
          ) : (
            <div className="space-y-3">
              {visibleAvailability.map((window) => (
                <AvailabilityRow key={window.id} window={window} />
              ))}
            </div>
          )}
        </DashboardPanel>
      </section>
    </PageContainer>
  );
}

function AvailabilityRow({
  window,
}: {
  window: YachtDetailResponse["yacht"]["availability"][number];
}) {
  return (
    <article
      className={`apple-transition rounded-2xl border p-4 ${
        window.isCurrent
          ? "border-cyan-500/30 bg-cyan-500/10"
          : window.isPast
            ? "border-border bg-muted/35 opacity-60"
            : "ui-panel-soft"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={window.status} />

            {window.isCurrent ? (
              <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-800 dark:text-cyan-200">
                Current
              </span>
            ) : null}

            {window.isPast ? (
              <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Past
              </span>
            ) : null}
          </div>

          <p className="mt-3 font-semibold text-foreground">
            {formatDateRange(window.startDate, window.endDate)}
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            {window.source?.name ?? "Unknown source"}
          </p>
        </div>

        <div className="shrink-0 sm:text-right">
          <p className="font-semibold text-foreground">
            {formatRate(window.weeklyRate, window.currency)}
          </p>

          <p className="mt-1 text-xs text-muted-foreground/70">
            per week
          </p>
        </div>
      </div>
    </article>
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

function DetailCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <article className="ui-panel-soft rounded-2xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-3 text-base font-semibold text-foreground">
        {value}
      </p>

      <p className="mt-2 text-sm text-muted-foreground">
        {description}
      </p>
    </article>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/45 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 truncate text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: YachtStatus;
}) {
  const styles: Record<YachtStatus, string> = {
    available:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    booked:
      "border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200",
    option:
      "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200",
    provisional:
      "border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200",
    maintenance:
      "border-orange-500/25 bg-orange-500/10 text-orange-900 dark:text-orange-200",
    unavailable:
      "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-200",
    no_availability:
      "border-border bg-muted text-muted-foreground",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function SourceStatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized = status.toLowerCase();

  const style =
    normalized === "healthy"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
      : normalized === "syncing"
        ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200"
        : normalized === "error"
          ? "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-200"
          : "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${style}`}
    >
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

function YachtDetailSkeleton() {
  return (
    <PageContainer>
      <div className="animate-pulse space-y-7">
        <div className="h-10 w-40 rounded-xl bg-muted" />
        <div className="h-80 rounded-[30px] bg-muted" />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-36 rounded-[24px] bg-muted"
            />
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

function YachtIllustration() {
  return (
    <svg
      viewBox="0 0 300 140"
      fill="none"
      className="relative h-36 w-72 text-sky-300"
      aria-hidden="true"
    >
      <path
        d="M32 93h232l-22 28H62L32 93Z"
        stroke="currentColor"
        strokeWidth="3"
      />

      <path
        d="M82 93V51h105l44 42"
        stroke="currentColor"
        strokeWidth="3"
      />

      <path
        d="M110 51V26h52v25"
        stroke="currentColor"
        strokeWidth="3"
      />

      <path
        d="M0 130c32-9 53-9 85 0 32 9 53 9 85 0 32-9 53-9 85 0 16 5 29 6 45 4"
        stroke="currentColor"
        strokeWidth="3"
      />
    </svg>
  );
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
    return `${currency || "EUR"} ${amount.toLocaleString()}`;
  }
}

function formatRateRange(
  lowest: number | null,
  highest: number | null,
  currency: string
): string {
  if (lowest === null && highest === null) {
    return "Rate on request";
  }

  if (
    lowest !== null &&
    highest !== null &&
    lowest !== highest
  ) {
    return `${formatRate(
      lowest,
      currency
    )} – ${formatRate(highest, currency)}`;
  }

  return formatRate(lowest ?? highest, currency);
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

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return "Never";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  const difference = timestamp - Date.now();
  const absoluteDifference = Math.abs(difference);

  const formatter = new Intl.RelativeTimeFormat("en", {
    numeric: "auto",
  });

  if (absoluteDifference < 60_000) {
    return "Just now";
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