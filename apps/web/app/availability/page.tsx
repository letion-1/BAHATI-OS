"use client";

import {
  Anchor,
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
  type ReactNode,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <PageContainer>
      <div>
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

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Fleet yachts"
            value={stats.yachtCount}
            description={`${stats.availableYachtCount} available in this view`}
            icon={<Ship className="size-5" />}
            tone="cyan"
          />

          <StatCard
            title="Available windows"
            value={statusSummary.available}
            description="Open charter periods"
            icon={<CheckCircle2 className="size-5" />}
            tone="emerald"
          />

          <StatCard
            title="Booked or blocked"
            value={statusSummary.committed}
            description={`${statusSummary.held} additional holds or options`}
            icon={<Clock3 className="size-5" />}
            tone="violet"
          />

          <StatCard
            title="Mapped port routes"
            value={statusSummary.routed}
            description="Windows with embarkation data"
            icon={<Route className="size-5" />}
            tone="amber"
          />
        </section>

        <section className="mt-8">
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
          <section className="mt-6">
            <div className="rounded-2xl border border-red-500/30 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          </section>
        )}

        <section className="mt-6">
          {isLoading &&
          timelineRecords.length === 0 ? (
            <Card className="border-border bg-card text-foreground ">
              <CardContent className="flex min-h-80 items-center justify-center">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading availability timeline
                </div>
              </CardContent>
            </Card>
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

        <section className="mt-6">
          <Card className="border-border bg-card text-foreground ">
            <CardHeader className="border-b border-border">
              <CardTitle>
                Matching yachts
              </CardTitle>

              <p className="text-sm text-muted-foreground">
                {groupedYachts.length} yacht
                {groupedYachts.length === 1
                  ? ""
                  : "s"}{" "}
                in the current result
              </p>
            </CardHeader>

            <CardContent className="p-5">
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
                        <div
                          key={yacht.id}
                          className="rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/15 dark:bg-[#0d1118]"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-3">
                              {yacht.heroImageUrl ? (
                                <img
                                  src={yacht.heroImageUrl}
                                  alt=""
                                  className="size-12 rounded-xl border border-border object-cover"
                                />
                              ) : (
                                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-50 text-cyan-700 dark:border-cyan-400/15 dark:bg-cyan-400/[0.06] dark:text-cyan-300">
                                  <Ship className="size-5" />
                                </div>
                              )}

                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  {yacht.name}
                                </p>

                                <p className="mt-1 truncate text-xs text-muted-foreground">
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
                            </div>

                            <Badge className="shrink-0 border border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                              {
                                availableWindows.length
                              }{" "}
                              available
                            </Badge>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Starting rate
                              </p>

                              <p className="mt-1">
                                {minimumRate
                                  ? formatMoney(
                                      minimumRate.amount,
                                      minimumRate.currency
                                    )
                                  : "On request"}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs text-muted-foreground">
                                Route
                              </p>

                              <p className="mt-1 truncate">
                                {formatWindowRoute(windows) ??
                                  yacht.homePort ??
                                  "Not specified"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                            {statuses.map(
                              (status) => (
                                <Badge
                                  key={status}
                                  className={`border ${statusClass(
                                    status
                                  )}`}
                                >
                                  {formatStatus(
                                    status
                                  )}
                                </Badge>
                              )
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </PageContainer>
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

function StatCard({
  title,
  value,
  description,
  icon,
  tone,
}: {
  title: string;
  value: number;
  description: string;
  icon: ReactNode;
  tone: "cyan" | "emerald" | "violet" | "amber";
}) {
  const toneClass = {
    cyan: "border-cyan-500/25 bg-cyan-50 text-cyan-700 dark:border-cyan-400/15 dark:bg-cyan-400/[0.06] dark:text-cyan-300",
    emerald:
      "border-emerald-500/25 bg-emerald-50 text-emerald-700 dark:border-emerald-400/15 dark:bg-emerald-400/[0.06] dark:text-emerald-300",
    violet:
      "border-violet-500/25 bg-violet-50 text-violet-700 dark:border-violet-400/15 dark:bg-violet-400/[0.06] dark:text-violet-300",
    amber:
      "border-amber-500/25 bg-amber-50 text-amber-800 dark:border-amber-400/15 dark:bg-amber-400/[0.06] dark:text-amber-300",
  }[tone];

  return (
    <Card className="group overflow-hidden border-border bg-card text-card-foreground transition hover:-translate-y-0.5 hover:border-foreground/15">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {title}
            </p>

            <p className="mt-5 text-3xl font-semibold tracking-tight">
              {value.toLocaleString("en-US")}
            </p>

            <p className="mt-2 text-xs text-muted-foreground">
              {description}
            </p>
          </div>

          <div
            className={`flex size-11 items-center justify-center rounded-xl border ${toneClass}`}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
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