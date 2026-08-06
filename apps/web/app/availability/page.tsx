"use client";

import Link from "next/link";
import {
  CalendarDays,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Ship,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AvailabilityTimeline,
  type TimelineAvailabilityRecord,
} from "@/components/availability/availability-timeline";
import { Badge } from "@/components/ui/badge";
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

type YachtRecord = {
  id: string;
  name: string;
  slug: string | null;
  yachtType: string | null;
  builder: string | null;
  model: string | null;
  buildYear: number | null;
  lengthMeters: number | null;
  guestCapacity: number | null;
  sleepingGuests: number | null;
  cabinCount: number | null;
  homePort: string | null;
  cruisingRegions: string[];
  weeklyRateLow: number | null;
  weeklyRateHigh: number | null;
  currency: string;
  heroImageUrl: string | null;
  brochureUrl: string | null;
  status: string;
  lastSyncedAt: string | null;
};

type SourceRecord = {
  id: string;
  name: string;
  type: string;
  status: string | null;
};

type AvailabilityRecord = {
  id: string;
  externalId: string | null;
  startDate: string;
  endDate: string;
  status: AvailabilityStatus;
  location: string | null;
  region: string | null;
  embarkationPort: string | null;
  disembarkationPort: string | null;
  weeklyRate: number | null;
  currency: string;
  notes: string | null;
  lastSyncedAt: string | null;
  yacht: YachtRecord | null;
  source: SourceRecord | null;
};

type AvailabilityStats = {
  yachtCount: number;
  availableYachtCount: number;
  availabilityWindowCount: number;
  recentlyUpdated: number;
};

type AvailabilityResponse = {
  success: boolean;
  error?: string;
  stats?: AvailabilityStats;
  data?: AvailabilityRecord[];
};

type AvailabilityFilters = {
  search: string;
  startDate: string;
  endDate: string;
  status: "" | AvailabilityStatus;
};

type YachtGroup = {
  yacht: YachtRecord;
  windows: AvailabilityRecord[];
};

const EMPTY_STATS: AvailabilityStats = {
  yachtCount: 0,
  availableYachtCount: 0,
  availabilityWindowCount: 0,
  recentlyUpdated: 0,
};

const EMPTY_FILTERS: AvailabilityFilters = {
  search: "",
  startDate: "",
  endDate: "",
  status: "",
};

const STATUS_OPTIONS: Array<{
  value: "" | AvailabilityStatus;
  label: string;
}> = [
  { value: "", label: "All statuses" },
  { value: "available", label: "Available" },
  { value: "provisional", label: "Provisional" },
  { value: "option", label: "Option" },
  { value: "booked", label: "Booked" },
  { value: "unavailable", label: "Unavailable" },
  { value: "maintenance", label: "Maintenance" },
];

export default function AvailabilityPage() {
  const [records, setRecords] = useState<AvailabilityRecord[]>([]);
  const [stats, setStats] =
    useState<AvailabilityStats>(EMPTY_STATS);

  const [searchInput, setSearchInput] = useState("");
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");
  const [statusInput, setStatusInput] =
    useState<"" | AvailabilityStatus>("");

  const [appliedFilters, setAppliedFilters] =
    useState<AvailabilityFilters>(EMPTY_FILTERS);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  const loadAvailability = useCallback(
    async (
      filters: AvailabilityFilters,
      refreshing = false
    ) => {
      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError(null);

      try {
        const params = new URLSearchParams();

        if (filters.search.trim()) {
          params.set("search", filters.search.trim());
        }

        if (filters.startDate) {
          params.set("startDate", filters.startDate);
        }

        if (filters.endDate) {
          params.set("endDate", filters.endDate);
        }

        if (filters.status) {
          params.set("status", filters.status);
        }

        params.set("limit", "1000");

        const response = await fetch(
          `/api/availability?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const payload =
          (await response.json()) as AvailabilityResponse;

        if (!response.ok || !payload.success) {
          throw new Error(
            payload.error ?? "Could not load availability."
          );
        }

        setRecords(payload.data ?? []);
        setStats(payload.stats ?? EMPTY_STATS);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load availability.";

        setError(message);
        setRecords([]);
        setStats(EMPTY_STATS);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadAvailability(EMPTY_FILTERS);
  }, [loadAvailability]);

  function handleSearch(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      startDateInput &&
      endDateInput &&
      startDateInput > endDateInput
    ) {
      setError(
        "The end date cannot be earlier than the start date."
      );
      return;
    }

    const nextFilters: AvailabilityFilters = {
      search: searchInput.trim(),
      startDate: startDateInput,
      endDate: endDateInput,
      status: statusInput,
    };

    setAppliedFilters(nextFilters);
    void loadAvailability(nextFilters);
  }

  function clearFilters() {
    setSearchInput("");
    setStartDateInput("");
    setEndDateInput("");
    setStatusInput("");
    setAppliedFilters(EMPTY_FILTERS);

    void loadAvailability(EMPTY_FILTERS);
  }

  const hasFilters =
    appliedFilters.search.length > 0 ||
    appliedFilters.startDate.length > 0 ||
    appliedFilters.endDate.length > 0 ||
    appliedFilters.status.length > 0;

  const groupedYachts = useMemo<YachtGroup[]>(() => {
    const yachts = new Map<string, YachtGroup>();

    for (const record of records) {
      if (!record.yacht) {
        continue;
      }

      const existing = yachts.get(record.yacht.id);

      if (existing) {
        existing.windows.push(record);
        continue;
      }

      yachts.set(record.yacht.id, {
        yacht: record.yacht,
        windows: [record],
      });
    }

    return [...yachts.values()].sort((first, second) =>
      first.yacht.name.localeCompare(second.yacht.name)
    );
  }, [records]);

  const statusSummary = useMemo(() => {
    const available = records.filter(
      (record) => record.status === "available"
    ).length;

    const booked = records.filter(
      (record) =>
        record.status === "booked" ||
        record.status === "unavailable"
    ).length;

    const options = records.filter(
      (record) =>
        record.status === "option" ||
        record.status === "provisional"
    ).length;

    const sourceCount = new Set(
      records
        .map((record) => record.source?.id)
        .filter((value): value is string => Boolean(value))
    ).size;

    return {
      available,
      booked,
      options,
      sourceCount,
    };
  }, [records]);

  const timelineRecords =
    useMemo<TimelineAvailabilityRecord[]>(
      () =>
        records.map((record) => ({
          id: record.id,
          startDate: record.startDate,
          endDate: record.endDate,
          status: record.status,
          weeklyRate: record.weeklyRate,
          currency: record.currency,
          notes: record.notes,
          location: record.location,
          region: record.region,
          embarkationPort: record.embarkationPort,
          disembarkationPort: record.disembarkationPort,
          yacht: record.yacht
            ? {
                id: record.yacht.id,
                name: record.yacht.name,
                yachtType: record.yacht.yachtType,
                lengthMeters: record.yacht.lengthMeters,
                homePort: record.yacht.homePort,
                heroImageUrl: record.yacht.heroImageUrl,
              }
            : null,
          source: record.source
            ? {
                id: record.source.id,
                name: record.source.name,
              }
            : null,
        })),
      [records]
    );

  if (isLoading && records.length === 0) {
    return <AvailabilitySkeleton />;
  }

  return (
    <PageContainer contentClassName="min-w-0 max-w-full space-y-7 overflow-x-clip">
      <HeroCard
        eyebrow="Availability intelligence"
        title="Command your live availability"
        description="Search synchronized charter windows, compare future openings and inspect every connected yacht in one calm command deck."
        actions={
          <button
            type="button"
            onClick={() =>
              void loadAvailability(appliedFilters, true)
            }
            disabled={isRefreshing}
            className="ui-primary-button apple-transition inline-flex min-h-12 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`size-4 ${
                isRefreshing ? "animate-spin" : ""
              }`}
            />
            {isRefreshing
              ? "Refreshing..."
              : "Refresh availability"}
          </button>
        }
      />

      {error ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-4 text-sm text-amber-800 dark:text-amber-100">
          {error}
        </div>
      ) : null}

      <section className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <StatCard
          label="Fleet yachts"
          value={stats.yachtCount}
          subtitle="Connected yacht records"
          tone="neutral"
        />
        <StatCard
          label="Available"
          value={statusSummary.available}
          subtitle="Open charter windows"
          tone="emerald"
        />
        <StatCard
          label="Booked"
          value={statusSummary.booked}
          subtitle="Confirmed or blocked"
          tone="violet"
        />
        <StatCard
          label="Options"
          value={statusSummary.options}
          subtitle="Held or provisional"
          tone="amber"
        />
        <StatCard
          label="Sources"
          value={statusSummary.sourceCount}
          subtitle="Connected supplier feeds"
          tone="cyan"
        />
      </section>

      <section className="ui-panel rounded-[24px] p-4 sm:p-5">
        <form
          onSubmit={handleSearch}
          className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(160px,0.8fr)_minmax(160px,0.8fr)] 2xl:grid-cols-[minmax(280px,1fr)_190px_190px_190px_auto_auto]"
        >
          <label className="relative block">
            <span className="sr-only">
              Search availability
            </span>

            <Search className="pointer-events-none absolute inset-y-0 left-4 my-auto size-4 text-muted-foreground" />

            <input
              type="search"
              value={searchInput}
              onChange={(event) =>
                setSearchInput(event.target.value)
              }
              placeholder="Search yachts, regions or suppliers..."
              className="ui-input h-12 pl-11 pr-4 text-sm"
            />
          </label>

          <DatePickerField
            label="Start date"
            value={startDateInput}
            inputRef={startDateRef}
            onChange={(value) => {
              setStartDateInput(value);

              if (
                endDateInput &&
                value > endDateInput
              ) {
                setEndDateInput("");
              }
            }}
          />

          <DatePickerField
            label="End date"
            value={endDateInput}
            min={startDateInput || undefined}
            inputRef={endDateRef}
            onChange={setEndDateInput}
          />

          <label className="relative block">
            <span className="sr-only">
              Filter by availability status
            </span>

            <Filter className="pointer-events-none absolute inset-y-0 left-4 my-auto size-4 text-muted-foreground" />

            <select
              value={statusInput}
              onChange={(event) =>
                setStatusInput(
                  event.target.value as
                    | ""
                    | AvailabilityStatus
                )
              }
              className="ui-input h-12 appearance-none pl-11 pr-4 text-sm"
            >
              {STATUS_OPTIONS.map((option) => (
                <option
                  key={option.value || "all"}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="ui-primary-button apple-transition inline-flex h-12 items-center justify-center gap-2 px-5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Search
          </button>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters || isLoading}
            className="ui-secondary-button apple-transition inline-flex h-12 items-center justify-center gap-2 px-4 text-sm font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30"
          >
            <X className="size-4" />
            Clear
          </button>
        </form>
      </section>

      <section className="min-w-0 max-w-full">
        <SectionHeader
          eyebrow="Live calendar"
          title="Availability timeline"
          subtitle={`${stats.availabilityWindowCount} synchronized charter windows`}
          className="mb-5"
        />

        <div className="min-w-0 max-w-full overflow-hidden">
          <AvailabilityTimeline
            records={timelineRecords}
            focusDate={
              appliedFilters.startDate ||
              timelineRecords[0]?.startDate
            }
          />
        </div>
      </section>

      <section>
        <SectionHeader
          eyebrow="Connected inventory"
          title="Matching yachts"
          subtitle={`${groupedYachts.length} yacht${
            groupedYachts.length === 1 ? "" : "s"
          } in the current result`}
          className="mb-5"
        />

        {groupedYachts.length === 0 ? (
          <AvailabilityEmptyState
            hasFilters={hasFilters}
            onClear={clearFilters}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {groupedYachts.map(({ yacht, windows }) => (
              <AvailabilityYachtCard
                key={yacht.id}
                yacht={yacht}
                windows={windows}
              />
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  );
}

function AvailabilityYachtCard({
  yacht,
  windows,
}: {
  yacht: YachtRecord;
  windows: AvailabilityRecord[];
}) {
  const availableWindows = windows
    .filter((window) => window.status === "available")
    .sort((first, second) =>
      first.startDate.localeCompare(second.startDate)
    );

  const nextAvailable = availableWindows[0] ?? null;
  const minimumRate = getMinimumRate(availableWindows);
  const statuses = [
    ...new Set(windows.map((window) => window.status)),
  ];

  const sourceName =
    windows.find((window) => window.source)?.source?.name ??
    "No connected source";

  return (
    <article className="ui-panel apple-transition group overflow-hidden rounded-[26px] hover:-translate-y-1 hover:border-ring/25">
      <div className="relative flex h-44 items-center justify-center overflow-hidden border-b border-border bg-[linear-gradient(135deg,var(--hero-start),var(--hero-middle),var(--hero-end))]">
        <div className="absolute h-36 w-36 rounded-full bg-cyan-400/10 blur-3xl" />

        {yacht.heroImageUrl ? (
          <img
            src={yacht.heroImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-500 group-hover:scale-105"
          />
        ) : (
          <YachtIllustration />
        )}

        <div className="absolute left-4 top-4">
          <AvailabilityBadge
            availableCount={availableWindows.length}
          />
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <h3 className="truncate font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
              {yacht.name}
            </h3>

            <p className="mt-2 truncate text-sm text-muted-foreground">
              {sourceName}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="font-semibold text-foreground">
              {minimumRate
                ? formatMoney(
                    minimumRate.amount,
                    minimumRate.currency
                  )
                : "Rate on request"}
            </p>

            <p className="mt-1 text-xs text-muted-foreground/70">
              starting rate
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <CardMetric
            label="Windows"
            value={String(windows.length)}
          />

          <CardMetric
            label="Next available"
            value={
              nextAvailable
                ? formatShortDate(nextAvailable.startDate)
                : "Not scheduled"
            }
          />
        </div>

        {nextAvailable ? (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700/75 dark:text-emerald-300/75">
              Upcoming availability
            </p>

            <p className="mt-1 text-sm font-medium text-emerald-800 dark:text-emerald-100">
              {formatDateRange(
                nextAvailable.startDate,
                nextAvailable.endDate
              )}
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4">
          <div className="flex min-w-0 flex-wrap gap-2">
            {statuses.slice(0, 3).map((status) => (
              <Badge
                key={status}
                className={`border ${statusClass(status)}`}
              >
                {formatStatus(status)}
              </Badge>
            ))}
          </div>

          <Link
            href={`/fleet/${yacht.id}`}
            className="apple-transition inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-cyan-700 hover:opacity-75 dark:text-cyan-300"
          >
            Open yacht
            <span className="transition group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
}

function AvailabilityBadge({
  availableCount,
}: {
  availableCount: number;
}) {
  if (availableCount > 0) {
    return (
      <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100 backdrop-blur-xl">
        {availableCount} available
      </span>
    );
  }

  return (
    <span className="rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-semibold text-muted-foreground backdrop-blur-xl">
      No open windows
    </span>
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

function DatePickerField({
  label,
  value,
  min,
  inputRef,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
}) {
  function openPicker() {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.focus();

    try {
      input.showPicker();
    } catch {
      // Native focus fallback.
    }
  }

  return (
    <label
      className="relative block cursor-pointer"
      onClick={openPicker}
    >
      <span className="sr-only">{label}</span>

      <CalendarDays className="pointer-events-none absolute inset-y-0 left-4 my-auto size-4 text-muted-foreground" />

      <input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        aria-label={label}
        onChange={(event) =>
          onChange(event.target.value)
        }
        onClick={(event) => {
          event.stopPropagation();

          try {
            event.currentTarget.showPicker();
          } catch {
            // Native browser fallback.
          }
        }}
        className="ui-input h-12 cursor-pointer pl-11 pr-4 text-sm"
      />
    </label>
  );
}

function AvailabilityEmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="ui-panel rounded-[28px] border-dashed px-6 py-16 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-[20px] bg-accent text-accent-foreground">
        <Ship className="size-6" />
      </div>

      <h3 className="mt-5 font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
        No matching availability
      </h3>

      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        {hasFilters
          ? "Adjust the search dates or remove one of the active filters."
          : "Connect and synchronize a source to populate live charter availability."}
      </p>

      {hasFilters ? (
        <button
          type="button"
          onClick={onClear}
          className="ui-primary-button apple-transition mt-6 px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function AvailabilitySkeleton() {
  return (
    <PageContainer contentClassName="min-w-0 max-w-full overflow-x-clip">
      <div className="animate-pulse space-y-7">
        <div className="h-64 rounded-[30px] bg-muted" />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-36 rounded-[24px] bg-muted"
            />
          ))}
        </div>

        <div className="h-24 rounded-[24px] bg-muted" />
        <div className="h-[520px] rounded-[28px] bg-muted" />

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
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

function YachtIllustration() {
  return (
    <svg
      viewBox="0 0 260 120"
      fill="none"
      className="relative h-28 w-64 text-slate-500 transition duration-500 group-hover:scale-105 group-hover:text-sky-300"
      aria-hidden="true"
    >
      <path
        d="M30 80h200l-18 24H55L30 80Z"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M75 80V45h90l38 35"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M98 45V25h45v20"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M0 111c28-8 46-8 74 0 28 8 46 8 74 0 28-8 46-8 74 0 14 4 25 5 38 4"
        stroke="currentColor"
        strokeWidth="3"
      />
    </svg>
  );
}

function getMinimumRate(
  records: AvailabilityRecord[]
): {
  amount: number;
  currency: string;
} | null {
  const pricedRecords = records.filter(
    (
      record
    ): record is AvailabilityRecord & {
      weeklyRate: number;
    } =>
      typeof record.weeklyRate === "number" &&
      Number.isFinite(record.weeklyRate)
  );

  if (pricedRecords.length === 0) {
    return null;
  }

  const lowest = pricedRecords.reduce((current, record) =>
    record.weeklyRate < current.weeklyRate
      ? record
      : current
  );

  return {
    amount: lowest.weeklyRate,
    currency: lowest.currency || "EUR",
  };
}

function formatMoney(
  amount: number,
  currency: string
) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || "EUR"} ${amount.toLocaleString(
      "en-GB"
    )}`;
  }
}

function formatShortDate(value: string) {
  return new Date(
    `${value}T00:00:00`
  ).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatDateRange(
  startDate: string,
  endDate: string
) {
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

function formatStatus(status: AvailabilityStatus) {
  return status
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

function statusClass(status: AvailabilityStatus) {
  switch (status) {
    case "available":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
    case "provisional":
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200";
    case "option":
      return "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200";
    case "booked":
      return "border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200";
    case "maintenance":
      return "border-orange-500/25 bg-orange-500/10 text-orange-900 dark:text-orange-200";
    case "unavailable":
    default:
      return "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-200";
  }
}