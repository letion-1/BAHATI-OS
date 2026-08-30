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
import { AccessTypeSelect } from "@/components/data-sources/access-type-select";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { getYachtPlaceholderMedia } from "@/lib/yachts/placeholder-media";

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

type SortOption =
  | "name"
  | "status"
  | "rate-low"
  | "rate-high"
  | "availability";

type FleetResponse = {
  success: boolean;

  overview: {
    yachtCount: number;
    availableCount: number;
    bookedCount: number;
    optionCount: number;
    maintenanceCount: number;
    sourceCount: number;
  };

  yachts: Array<{
    id: string;
    name: string;
    status: YachtStatus;
    weeklyRate: number | null;
    currency: string;

    nextAvailable: {
      startDate: string;
      endDate: string;
    } | null;

    source: {
      id: string;
      name: string;
      type: string;
      status: string;
      updatedAt: string | null;
    } | null;

    availabilityCount: number;

    access: {
      accessType: string | null;
      clientProposalPermission: boolean;
      /** True when a person set this yacht's access, not its source. */
      isOverridden: boolean;
    };

    statusCounts: Record<AvailabilityStatus, number>;
  }>;

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

export default function FleetPage() {
  const [data, setData] = useState<FleetResponse | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<YachtStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  /*
   * A separate filter rather than a value in the source dropdown, because
   * "which yachts cannot be offered to a client" cuts across sources and is
   * the question a broker actually needs answered after a bulk import.
   */
  const [accessFilter, setAccessFilter] = useState<
    "all" | "unclassified" | "overridden"
  >("all");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const [sort, setSort] = useState<SortOption>("name");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFleet = useCallback(async (refreshing: boolean) => {
    try {
      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError(null);

      const response = await fetch("/api/fleet", {
        method: "GET",
        cache: "no-store",
      });

      const result = (await response.json()) as FleetResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ?? "Could not load yachts."
        );
      }

      setData(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load yachts."
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadFleet(false);
  }, [loadFleet]);

  const sourceOptions = useMemo(() => {
    if (!data) {
      return [];
    }

    const values = data.yachts
      .map((yacht) => yacht.source?.name)
      .filter((value): value is string => Boolean(value));

    return Array.from(new Set(values)).sort((left, right) =>
      left.localeCompare(right)
    );
  }, [data]);

  const filteredYachts = useMemo(() => {
    if (!data) {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();

    const filtered = data.yachts.filter((yacht) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        yacht.name.toLowerCase().includes(normalizedQuery) ||
        yacht.source?.name
          .toLowerCase()
          .includes(normalizedQuery) === true;

      const matchesStatus =
        statusFilter === "all" ||
        yacht.status === statusFilter;

      const matchesSource =
        sourceFilter === "all" ||
        yacht.source?.name === sourceFilter;

      const matchesAccess =
        accessFilter === "all" ||
        (accessFilter === "unclassified" &&
          !yacht.access.clientProposalPermission) ||
        (accessFilter === "overridden" && yacht.access.isOverridden);

      return (
        matchesQuery &&
        matchesStatus &&
        matchesSource &&
        matchesAccess
      );
    });

    return [...filtered].sort((left, right) => {
      if (sort === "rate-low") {
        return compareRates(left.weeklyRate, right.weeklyRate);
      }

      if (sort === "rate-high") {
        return compareRates(
          right.weeklyRate,
          left.weeklyRate
        );
      }

      if (sort === "availability") {
        return compareDates(
          left.nextAvailable?.startDate,
          right.nextAvailable?.startDate
        );
      }

      if (sort === "status") {
        return statusLabels[left.status].localeCompare(
          statusLabels[right.status]
        );
      }

      return left.name.localeCompare(right.name);
    });
  }, [accessFilter, data, query, sort, sourceFilter, statusFilter]);

  const hasFilters =
    query.trim().length > 0 ||
    statusFilter !== "all" ||
    sourceFilter !== "all" ||
    accessFilter !== "all";

  const blockedCount =
    data?.yachts.filter(
      (yacht) => !yacht.access.clientProposalPermission
    ).length ?? 0;

  /**
   * Apply one access type to every selected yacht.
   *
   * Flagged as an override server-side, so the choice survives future syncs
   * of the source these yachts came from.
   */
  async function applyAccess(accessType: string | null) {
    if (selectedIds.size === 0) {
      return;
    }

    setIsSavingAccess(true);
    setAccessMessage("");

    try {
      const response = await fetch("/api/yacht-access/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          accessType === null
            ? { yachtIds: [...selectedIds], clearOverride: true }
            : { yachtIds: [...selectedIds], accessType }
        )
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Could not update those yachts.");
      }

      setAccessMessage(
        payload.message ??
          `Updated ${payload.updated ?? selectedIds.size} yachts.`
      );

      setSelectedIds(new Set());
      await loadFleet(true);
    } catch (caught) {
      setAccessMessage(
        caught instanceof Error
          ? caught.message
          : "Could not update those yachts."
      );
    } finally {
      setIsSavingAccess(false);
    }
  }

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setSourceFilter("all");
    setAccessFilter("all");
    setSort("name");
  }

  if (isLoading) {
    return <FleetSkeleton />;
  }

  if (!data) {
    return (
      <PageContainer>
        <HeroCard
          eyebrow="Yacht intelligence"
          title="Yachts unavailable"
          description="The connected fleet could not be loaded from the protected workspace."
        />

        <div className="mt-8 rounded-2xl border border-red-500/25 bg-red-500/10 p-6">
          <p className="text-sm text-red-700 dark:text-red-200">
            {error ?? "Could not load yachts."}
          </p>

          <button
            type="button"
            onClick={() => void loadFleet(false)}
            className="ui-primary-button apple-transition mt-5 px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer contentClassName="space-y-7">
      <HeroCard
        eyebrow="Yacht intelligence"
        title="Explore your yacht access"
        description="Search yachts, compare availability and work with controlled, managed, broker-access and reference yachts from one workspace."
        actions={
          <button
            type="button"
            onClick={() => void loadFleet(true)}
            disabled={isRefreshing}
            className="ui-primary-button apple-transition inline-flex min-h-12 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshIcon spinning={isRefreshing} />
            {isRefreshing ? "Refreshing..." : "Refresh yachts"}
          </button>
        }
      />

      {error ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-4 text-sm text-amber-800 dark:text-amber-100">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Yachts"
          value={data.overview.yachtCount}
          subtitle="Connected yacht records"
          tone="neutral"
        />
        <StatCard
          label="Available"
          value={data.overview.availableCount}
          subtitle="Open for charter"
          tone="emerald"
        />
        <StatCard
          label="Booked"
          value={data.overview.bookedCount}
          subtitle="Confirmed future periods"
          tone="violet"
        />
        <StatCard
          label="Options"
          value={data.overview.optionCount}
          subtitle="Held or tentative"
          tone="amber"
        />
        <StatCard
          label="Sources"
          value={data.overview.sourceCount}
          subtitle="Connected supplier feeds"
          tone="cyan"
        />
      </section>

      <section className="ui-panel rounded-[24px] p-4 sm:p-5">
        <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-[minmax(280px,1fr)_190px_220px_190px_auto]">
          <label className="relative block">
            <span className="sr-only">Search yachts</span>
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted-foreground">
              <SearchIcon />
            </span>

            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search yachts or sources..."
              className="ui-input h-12 pl-11 pr-4 text-sm"
            />
          </label>

          <Select
            value={statusFilter}
            onChange={(value) =>
              setStatusFilter(value as YachtStatus | "all")
            }
            ariaLabel="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="booked">Booked</option>
            <option value="option">Option</option>
            <option value="provisional">Provisional</option>
            <option value="maintenance">Maintenance</option>
            <option value="unavailable">Unavailable</option>
            <option value="no_availability">No availability</option>
          </Select>

          <Select
            value={sourceFilter}
            onChange={setSourceFilter}
            ariaLabel="Filter by source"
          >
            <option value="all">All sources</option>
            {sourceOptions.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </Select>

          <Select
            value={accessFilter}
            onChange={(value) =>
              setAccessFilter(value as "all" | "unclassified" | "overridden")
            }
            ariaLabel="Filter by client access"
          >
            <option value="all">All access</option>
            <option value="unclassified">Not offerable to clients</option>
            <option value="overridden">Set individually</option>
          </Select>

          <Select
            value={sort}
            onChange={(value) => setSort(value as SortOption)}
            ariaLabel="Sort yachts"
          >
            <option value="name">Name A-Z</option>
            <option value="status">Status</option>
            <option value="availability">Next availability</option>
            <option value="rate-low">Rate: low to high</option>
            <option value="rate-high">Rate: high to low</option>
          </Select>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="ui-secondary-button apple-transition h-12 px-4 text-sm font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            Clear
          </button>
        </div>
      </section>

      <section>
        <SectionHeader
          eyebrow="Yacht catalogue"
          title="Yacht results"
          subtitle={`${filteredYachts.length} of ${data.overview.yachtCount} yachts`}
          className="mb-5"
        />

        {/*
          The bar appears only with a selection, so the page is not carrying
          a permanently visible toolbar for something most visits never do.
        */}
        {selectedIds.size > 0 ? (
          <div className="mb-5 flex flex-col gap-3 rounded-[22px] border border-border bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-foreground">
              {selectedIds.size} selected
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <AccessTypeSelect
                value=""
                disabled={isSavingAccess}
                onChange={(value) => {
                  void applyAccess(value === "" ? null : value);
                }}
              />

              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="ui-secondary-button apple-transition h-11 px-4 text-sm font-semibold hover:bg-accent"
              >
                Clear
              </button>
            </div>
          </div>
        ) : null}

        {accessMessage ? (
          <p className="mb-4 text-sm leading-6 text-muted-foreground">
            {accessMessage}
          </p>
        ) : null}

        {blockedCount > 0 && accessFilter === "all" ? (
          <button
            type="button"
            onClick={() => setAccessFilter("unclassified")}
            className="mb-5 w-full rounded-[22px] border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-left text-sm leading-6 text-amber-800 hover:bg-amber-500/[0.12] dark:text-amber-300"
          >
            {blockedCount} {blockedCount === 1 ? "yacht" : "yachts"} cannot be
            offered to clients yet. Show them.
          </button>
        ) : null}

        {filteredYachts.length === 0 ? (
          <div className="ui-panel rounded-[28px] border-dashed px-6 py-16 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-[20px] bg-accent text-accent-foreground">
              <span className="font-heading text-3xl">Y</span>
            </div>

            <h3 className="mt-5 font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
              No yachts found
            </h3>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              Adjust the search or remove one of the active filters.
            </p>

            <button
              type="button"
              onClick={clearFilters}
              className="ui-primary-button apple-transition mt-6 px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid gap-4 [&>*]:min-w-0 md:grid-cols-2 2xl:grid-cols-3">
            {filteredYachts.map((yacht) => (
              <YachtCard
                key={yacht.id}
                yacht={yacht}
                selected={selectedIds.has(yacht.id)}
                onToggle={() =>
                  setSelectedIds((current) => {
                    const next = new Set(current);

                    if (next.has(yacht.id)) {
                      next.delete(yacht.id);
                    } else {
                      next.add(yacht.id);
                    }

                    return next;
                  })
                }
              />
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  );
}

function YachtCard({
  yacht,
  selected,
  onToggle,
}: {
  yacht: FleetResponse["yachts"][number];
  selected: boolean;
  onToggle: () => void;
}) {
  const placeholderMedia =
    getYachtPlaceholderMedia(
      yacht.id
    );

  return (
    <article className="ui-panel apple-transition group overflow-hidden rounded-[26px] hover:-translate-y-1 hover:border-ring/25">
      <div className="relative h-44 overflow-hidden border-b border-border bg-muted">
        <img
          src={placeholderMedia.hero}
          alt={yacht.name}
          className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-[1.03]"
          loading="lazy"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-black/10" />

        <div className="absolute left-4 top-4">
          <StatusBadge status={yacht.status} />
        </div>

        {/*
          A checkbox on the image rather than a row of them down one side,
          because the fleet is a card grid and a broker picking eight yachts
          out of a hundred is looking at the yachts, not at a column.
        */}
        <label className="absolute right-4 top-4 flex size-8 cursor-pointer items-center justify-center rounded-xl border border-white/25 bg-black/40 backdrop-blur-sm">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="size-4 accent-white"
            aria-label={`Select ${yacht.name}`}
          />
        </label>

        {/*
          Stated on the card, because a yacht that cannot be offered is
          otherwise indistinguishable from one that can until a proposal
          refuses it.
        */}
        {!yacht.access.clientProposalPermission ? (
          <div className="absolute bottom-4 left-4 rounded-full border border-amber-400/30 bg-amber-500/20 px-2.5 py-1 text-[11px] font-medium text-amber-100 backdrop-blur-sm">
            Not offerable to clients
          </div>
        ) : null}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <h3 className="truncate font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
              {yacht.name}
            </h3>

            <p className="mt-2 truncate text-sm text-muted-foreground">
              {yacht.source?.name ?? "No connected source"}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="font-semibold text-foreground">
              {formatRate(yacht.weeklyRate, yacht.currency)}
            </p>

            <p className="mt-1 text-xs text-muted-foreground/70">
              weekly rate
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <CardMetric
            label="Windows"
            value={String(yacht.availabilityCount)}
          />

          <CardMetric
            label="Next available"
            value={
              yacht.nextAvailable
                ? formatShortDate(yacht.nextAvailable.startDate)
                : "Not scheduled"
            }
          />
        </div>

        {yacht.nextAvailable ? (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700/75 dark:text-emerald-300/75">
              Upcoming availability
            </p>

            <p className="mt-1 text-sm font-medium text-emerald-800 dark:text-emerald-100">
              {formatDateRange(
                yacht.nextAvailable.startDate,
                yacht.nextAvailable.endDate
              )}
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground/70">
            {yacht.source
              ? formatSourceType(yacht.source.type)
              : "Manual yacht record"}
          </p>

          <Link
            href={`/fleet/${yacht.id}`}
            className="apple-transition inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 hover:opacity-75 dark:text-cyan-300"
          >
            Open yacht
            <span className="transition group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

function CardMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="ui-panel-soft rounded-xl px-3 py-3">
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
  const style: Record<YachtStatus, string> = {
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
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${style[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function Select({
  value,
  onChange,
  ariaLabel,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className="ui-input h-12 px-4 text-sm"
    >
      {children}
    </select>
  );
}

function FleetSkeleton() {
  return (
    <PageContainer>
      <div className="animate-pulse space-y-7">
        <div className="h-64 rounded-[30px] bg-muted" />

        <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-36 rounded-[24px] bg-muted"
            />
          ))}
        </div>

        <div className="h-24 rounded-[24px] bg-muted" />

        <div className="grid gap-4 [&>*]:min-w-0 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-96 rounded-[26px] bg-muted"
            />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
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

function compareRates(
  left: number | null,
  right: number | null
): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left - right;
}

function compareDates(
  left: string | undefined,
  right: string | undefined
): number {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  return left.localeCompare(right);
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

function formatShortDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
    }
  );
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

function formatSourceType(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}