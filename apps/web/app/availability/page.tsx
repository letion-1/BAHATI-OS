"use client";

import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  Loader2,
  RefreshCw,
  Route,
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
import { HeroCard } from "@/components/ui/hero-card";
import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  {
    value: "",
    label: "All statuses",
  },
  {
    value: "available",
    label: "Available",
  },
  {
    value: "provisional",
    label: "Provisional",
  },
  {
    value: "option",
    label: "Option",
  },
  {
    value: "booked",
    label: "Booked",
  },
  {
    value: "unavailable",
    label: "Unavailable",
  },
  {
    value: "maintenance",
    label: "Maintenance",
  },
];

export default function AvailabilityPage() {
  const [records, setRecords] = useState<
    AvailabilityRecord[]
  >([]);

  const [stats, setStats] =
    useState<AvailabilityStats>(EMPTY_STATS);

  const [searchInput, setSearchInput] =
    useState("");

  const [startDateInput, setStartDateInput] =
    useState("");

  const [endDateInput, setEndDateInput] =
    useState("");

  const [statusInput, setStatusInput] =
    useState<"" | AvailabilityStatus>("");

  const [appliedFilters, setAppliedFilters] =
    useState<AvailabilityFilters>(EMPTY_FILTERS);

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const startDateRef =
    useRef<HTMLInputElement>(null);

  const endDateRef =
    useRef<HTMLInputElement>(null);

  const loadAvailability = useCallback(
    async (filters: AvailabilityFilters) => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();

        if (filters.search.trim()) {
          params.set(
            "search",
            filters.search.trim()
          );
        }

        if (filters.startDate) {
          params.set(
            "startDate",
            filters.startDate
          );
        }

        if (filters.endDate) {
          params.set(
            "endDate",
            filters.endDate
          );
        }

        if (filters.status) {
          params.set(
            "status",
            filters.status
          );
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
            payload.error ??
              "Could not load availability."
          );
        }

        setRecords(payload.data ?? []);
        setStats(
          payload.stats ?? EMPTY_STATS
        );
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
      }
    },
    []
  );

  useEffect(() => {
    void loadAvailability(EMPTY_FILTERS);
  }, [loadAvailability]);

  const handleSearch = (
    event: FormEvent<HTMLFormElement>
  ) => {
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
  };

  const clearFilters = () => {
    setSearchInput("");
    setStartDateInput("");
    setEndDateInput("");
    setStatusInput("");
    setAppliedFilters(EMPTY_FILTERS);

    void loadAvailability(EMPTY_FILTERS);
  };

  const hasFilters =
    appliedFilters.search.length > 0 ||
    appliedFilters.startDate.length > 0 ||
    appliedFilters.endDate.length > 0 ||
    appliedFilters.status.length > 0;

  const groupedYachts = useMemo(() => {
    const yachts = new Map<
      string,
      {
        yacht: YachtRecord;
        windows: AvailabilityRecord[];
      }
    >();

    for (const record of records) {
      if (!record.yacht) {
        continue;
      }

      const existing = yachts.get(
        record.yacht.id
      );

      if (existing) {
        existing.windows.push(record);
        continue;
      }

      yachts.set(record.yacht.id, {
        yacht: record.yacht,
        windows: [record],
      });
    }

    return [...yachts.values()].sort(
      (first, second) =>
        first.yacht.name.localeCompare(
          second.yacht.name
        )
    );
  }, [records]);

  const statusSummary = useMemo(() => {
    const available = records.filter(
      (record) => record.status === "available"
    ).length;

    const committed = records.filter(
      (record) =>
        record.status === "booked" ||
        record.status === "unavailable"
    ).length;

    const held = records.filter(
      (record) =>
        record.status === "option" ||
        record.status === "provisional"
    ).length;

    const routed = records.filter(
      (record) =>
        Boolean(record.embarkationPort) ||
        Boolean(record.disembarkationPort)
    ).length;

    return {
      available,
      committed,
      held,
      routed,
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
          embarkationPort:
            record.embarkationPort,
          disembarkationPort:
            record.disembarkationPort,

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

  return (
    <PageContainer contentClassName="space-y-7">
      <div className="space-y-7">
        <HeroCard
          eyebrow="Charter inventory"
          title="Availability"
          description="Search and visualize normalized yacht availability imported from every connected supplier."
          actions={
            <Button
              type="button"
              className="ui-primary-button apple-transition min-h-11 px-5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
              disabled={isLoading}
              onClick={() =>
                void loadAvailability(
                  appliedFilters
                )
              }
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}

              Refresh availability
            </Button>
          }
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Fleet yachts"
            value={stats.yachtCount}
            subtitle={`${stats.availableYachtCount} available in this view`}
            tone="cyan"
          />

          <StatCard
            label="Available windows"
            value={statusSummary.available}
            subtitle="Open charter periods"
            tone="emerald"
          />

          <StatCard
            label="Booked or blocked"
            value={statusSummary.committed}
            subtitle={`${statusSummary.held} additional holds or options`}
            tone="violet"
          />

          <StatCard
            label="Mapped port routes"
            value={statusSummary.routed}
            subtitle="Windows with embarkation data"
            tone="amber"
          />
        </section>

        <section>
          <form
            onSubmit={handleSearch}
            className="ui-panel rounded-[24px] p-4 sm:p-5"
          >
            <div className="grid gap-3 xl:grid-cols-[minmax(240px,1fr)_180px_180px_180px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) =>
                    setSearchInput(
                      event.target.value
                    )
                  }
                  placeholder="Search yacht, destination or supplier"
                  className="h-11 w-full rounded-xl border border-input bg-background/55 pl-10 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/75 focus:border-sky-400/40"
                />
              </div>

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
                min={
                  startDateInput ||
                  undefined
                }
                inputRef={endDateRef}
                onChange={setEndDateInput}
              />

              <label className="relative">
                <span className="sr-only">
                  Availability status
                </span>

                <Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

                <select
                  value={statusInput}
                  onChange={(event) =>
                    setStatusInput(
                      event.target
                        .value as
                        | ""
                        | AvailabilityStatus
                    )
                  }
                  className="h-11 w-full appearance-none rounded-xl border border-input bg-background/55 pl-10 pr-4 text-sm text-foreground outline-none focus:border-sky-400/40"
                >
                  {STATUS_OPTIONS.map(
                    (option) => (
                      <option
                        key={
                          option.value ||
                          "all"
                        }
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    )
                  )}
                </select>
              </label>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="h-11 flex-1"
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}

                  Search
                </Button>

                {hasFilters && (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="size-11 border-border bg-card/50 text-foreground"
                    onClick={clearFilters}
                    aria-label="Clear filters"
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </form>
        </section>

        {error && (
          <section>
            <div className="rounded-2xl border border-red-500/30 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          </section>
        )}

        <section>
          {isLoading &&
          timelineRecords.length === 0 ? (
            <div className="ui-panel flex min-h-80 items-center justify-center rounded-[28px]">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading availability timeline
              </div>
            </div>
          ) : (
            <AvailabilityTimeline
              records={timelineRecords}
              focusDate={
                appliedFilters.startDate ||
                timelineRecords[0]?.startDate
              }
            />
          )}
        </section>

        <section>
          <div className="ui-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader
              eyebrow="Connected inventory"
              title="Matching yachts"
              subtitle={`${groupedYachts.length} yacht${groupedYachts.length === 1 ? "" : "s"} in the current result`}
              className="mb-5"
            />
              {isLoading &&
              groupedYachts.length === 0 ? (
                <LoadingState />
              ) : groupedYachts.length ===
                0 ? (
                <EmptyState />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {groupedYachts.map(
                    ({ yacht, windows }) => {
                      const availableWindows =
                        windows.filter(
                          (window) =>
                            window.status ===
                            "available"
                        );

                      const minimumRate =
                        getMinimumRate(
                          availableWindows
                        );

                      const statuses = [
                        ...new Set(
                          windows.map(
                            (window) =>
                              window.status
                          )
                        ),
                      ];

                      return (
                        <AvailabilityYachtCard
                          key={yacht.id}
                          yacht={yacht}
                          windows={windows}
                          availableWindows={availableWindows}
                          minimumRate={minimumRate}
                          statuses={statuses}
                        />
                      );
                    }
                  )}
                </div>
              )}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}


function AvailabilityYachtCard({
  yacht,
  windows,
  availableWindows,
  minimumRate,
  statuses,
}: {
  yacht: YachtRecord;
  windows: AvailabilityRecord[];
  availableWindows: AvailabilityRecord[];
  minimumRate: {
    amount: number;
    currency: string;
  } | null;
  statuses: AvailabilityStatus[];
}) {
  return (
    <article className="ui-panel apple-transition group overflow-hidden rounded-[26px] hover:-translate-y-1 hover:border-ring/25">
      <div className="relative flex h-40 items-center justify-center overflow-hidden border-b border-border bg-[linear-gradient(135deg,var(--hero-start),var(--hero-middle),var(--hero-end))]">
        <div className="absolute h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />

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
          <Badge className="border border-emerald-500/25 bg-emerald-500/10 text-emerald-100 backdrop-blur-xl">
            {availableWindows.length} available
          </Badge>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <h3 className="truncate font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
              {yacht.name}
            </h3>

            <p className="mt-2 truncate text-sm text-muted-foreground">
              {[
                yacht.yachtType,
                yacht.lengthMeters
                  ? `${yacht.lengthMeters} m`
                  : null,
                yacht.homePort,
              ]
                .filter(Boolean)
                .join(" · ") ||
                `${windows.length} matching windows`}
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
          <AvailabilityMetric
            label="Windows"
            value={String(windows.length)}
          />

          <AvailabilityMetric
            label="Route"
            value={
              formatWindowRoute(windows) ??
              yacht.homePort ??
              "Not specified"
            }
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          {statuses.map((status) => (
            <Badge
              key={status}
              className={`border ${statusClass(status)}`}
            >
              {formatStatus(status)}
            </Badge>
          ))}
        </div>
      </div>
    </article>
  );
}

function AvailabilityMetric({
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

function YachtIllustration() {
  return (
    <svg
      viewBox="0 0 260 120"
      fill="none"
      className="relative h-24 w-56 text-slate-500 transition duration-500 group-hover:scale-105 group-hover:text-sky-300"
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
  const openPicker = () => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    input.focus();

    try {
      input.showPicker();
    } catch {
      // Older browsers still open the picker
      // when the date input receives focus.
    }
  };

  return (
    <div
      className="relative cursor-pointer"
      onClick={openPicker}
    >
      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />

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
        className="h-11 w-full cursor-pointer rounded-xl border border-input bg-background/55 pl-10 pr-3 text-sm text-foreground outline-none focus:border-sky-400/40"
      />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-48 items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading yachts
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center text-center">
      <Ship className="size-8 text-muted-foreground" />

      <p className="mt-3 font-medium">
        No matching availability
      </p>

      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        No yacht is continuously available
        for the selected dates and filters.
      </p>
    </div>
  );
}

function formatWindowRoute(
  windows: AvailabilityRecord[]
): string | null {
  const routedWindow = windows.find(
    (window) =>
      window.embarkationPort ||
      window.disembarkationPort
  );

  if (!routedWindow) {
    return null;
  }

  const from = routedWindow.embarkationPort;
  const to = routedWindow.disembarkationPort;

  if (from && to) {
    return `${from} → ${to}`;
  }

  return from ?? to ?? null;
}

function getMinimumRate(
  records: AvailabilityRecord[]
): {
  amount: number;
  currency: string;
} | null {
  const pricedRecords =
    records.filter(
      (
        record
      ): record is AvailabilityRecord & {
        weeklyRate: number;
      } =>
        typeof record.weeklyRate ===
          "number" &&
        Number.isFinite(
          record.weeklyRate
        )
    );

  if (pricedRecords.length === 0) {
    return null;
  }

  const lowest = pricedRecords.reduce(
    (current, record) =>
      record.weeklyRate <
      current.weeklyRate
        ? record
        : current
  );

  return {
    amount: lowest.weeklyRate,
    currency:
      lowest.currency || "EUR",
  };
}

function formatMoney(
  amount: number,
  currency: string
) {
  try {
    return new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency:
          currency || "EUR",
        maximumFractionDigits: 0,
      }
    ).format(amount);
  } catch {
    return `${currency || "EUR"} ${amount.toLocaleString(
      "en-US"
    )}`;
  }
}

function formatStatus(
  status: AvailabilityStatus
) {
  return status
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

function statusClass(
  status: AvailabilityStatus
) {
  switch (status) {
    case "available":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";

    case "provisional":
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";

    case "option":
      return "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";

    case "booked":
      return "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300";

    case "maintenance":
      return "border-orange-500/25 bg-orange-500/10 text-orange-800 dark:text-orange-300";

    case "unavailable":
    default:
      return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
  }
}