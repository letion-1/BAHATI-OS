"use client";

import { TimelineNavigator } from "@/components/availability/timeline-navigator";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type TimelineAvailabilityStatus =
  | "available"
  | "provisional"
  | "option"
  | "booked"
  | "unavailable"
  | "maintenance";

export type TimelineAvailabilityRecord = {
  id: string;
  startDate: string;
  endDate: string;
  status: TimelineAvailabilityStatus;
  weeklyRate: number | null;
  currency: string;
  notes: string | null;
  location: string | null;
  region: string | null;
  embarkationPort: string | null;
  disembarkationPort: string | null;

  yacht: {
    id: string;
    name: string;
  } | null;

  source: {
    id: string;
    name: string;
  } | null;
};

type TimelineZoom =
  | "week"
  | "month"
  | "quarter";

type TimelineYachtGroup = {
  yachtId: string;
  yachtName: string;
  records: TimelineAvailabilityRecord[];
};

type TimelineDay = {
  date: Date;
  key: string;
  day: number;
  month: string;
  weekday: string;
  isToday: boolean;
  isWeekend: boolean;
};

type TimelineMonthGroup = {
  key: string;
  label: string;
  days: TimelineDay[];
};

type TimelineBarData = {
  record: TimelineAvailabilityRecord;
  left: number;
  width: number;
};

const YACHT_COLUMN_WIDTH = 256;
const ROW_HEIGHT = 76;

const DAY_WIDTHS: Record<
  TimelineZoom,
  number
> = {
  week: 54,
  month: 34,
  quarter: 20,
};

const VISIBLE_DAY_COUNTS: Record<
  TimelineZoom,
  number
> = {
  week: 14,
  month: 35,
  quarter: 98,
};

export function AvailabilityTimeline({
  records,
  focusDate,
}: {
  records: TimelineAvailabilityRecord[];
  focusDate?: string;
}) {
  const initialDate = useMemo(() => {
    const selectedDate = focusDate
      ? parseDate(focusDate)
      : null;

    return selectedDate ?? getInitialDate(records);
  }, [focusDate, records]);

  const [zoom, setZoom] =
    useState<TimelineZoom>("month");

  const [visibleStart, setVisibleStart] =
    useState<Date>(initialDate);

  const [selectedRecord, setSelectedRecord] =
    useState<TimelineAvailabilityRecord | null>(null);

  useEffect(() => {
    setVisibleStart(initialDate);
  }, [initialDate]);

  const dayWidth = DAY_WIDTHS[zoom];

  const visibleDays = useMemo(
    () =>
      buildTimelineDays(
        visibleStart,
        VISIBLE_DAY_COUNTS[zoom]
      ),
    [visibleStart, zoom]
  );

  const visibleEnd =
    visibleDays.at(-1)?.date ??
    visibleStart;

  const monthGroups = useMemo(
    () => groupDaysByMonth(visibleDays),
    [visibleDays]
  );

  const yachtGroups = useMemo(
    () =>
      groupRecordsByYacht(
        records,
        visibleStart,
        visibleEnd
      ),
    [records, visibleStart, visibleEnd]
  );

  const timelineWidth =
    visibleDays.length * dayWidth;

  const fullGridWidth =
    YACHT_COLUMN_WIDTH + timelineWidth;

  function moveTimeline(
    direction: -1 | 1
  ) {
    const amount =
      zoom === "week"
        ? 7
        : zoom === "month"
          ? 30
          : 90;

    setVisibleStart((current) =>
      addDays(
        current,
        amount * direction
      )
    );
  }

  function jumpToToday() {
    setVisibleStart(
      startOfDay(new Date())
    );
  }

  return (
    <Card className="ui-panel overflow-hidden rounded-[28px]">
      <CardHeader className="border-b border-border bg-[linear-gradient(135deg,var(--hero-start),var(--hero-middle),var(--hero-end))] text-[var(--hero-foreground)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <CardTitle className="text-xl font-semibold tracking-tight">
              Live availability calendar
            </CardTitle>

            <p className="ui-hero-muted mt-1 text-sm">
              View synchronized yacht availability
              across a shared calendar.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-border bg-background/60 p-1">
              <ZoomButton
                active={zoom === "week"}
                label="Week"
                onClick={() =>
                  setZoom("week")
                }
              />

              <ZoomButton
                active={zoom === "month"}
                label="Month"
                onClick={() =>
                  setZoom("month")
                }
              />

              <ZoomButton
                active={zoom === "quarter"}
                label="Quarter"
                onClick={() =>
                  setZoom("quarter")
                }
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="border-border bg-card/55 text-foreground"
              onClick={jumpToToday}
            >
              <CalendarDays className="size-4" />
              Today
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="border-border bg-card/55 text-foreground"
              onClick={() =>
                moveTimeline(-1)
              }
              aria-label="Previous period"
            >
              <ChevronLeft className="size-4" />
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="border-border bg-card/55 text-foreground"
              onClick={() =>
                moveTimeline(1)
              }
              aria-label="Next period"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <TimelineNavigator
          records={records}
          visibleStart={visibleStart}
          visibleDayCount={
            VISIBLE_DAY_COUNTS[zoom]
          }
          onVisibleStartChange={
            setVisibleStart
          }
        />

        <TimelineLegend />

        <div className="relative overflow-x-auto">
          <div
            className="min-w-max"
            style={{
              width: fullGridWidth,
            }}
          >
            <TimelineHeader
              days={visibleDays}
              monthGroups={monthGroups}
              dayWidth={dayWidth}
              timelineWidth={
                timelineWidth
              }
            />

            {yachtGroups.length === 0 ? (
              <div
                className="grid min-h-64 border-t border-border"
                style={{
                  gridTemplateColumns: `${YACHT_COLUMN_WIDTH}px ${timelineWidth}px`,
                }}
              >
                <div className="sticky left-0 z-20 border-r border-border bg-card" />

                <div className="flex items-center justify-center">
                  <div className="text-center">
                    <p className="font-medium">
                      No availability in this period
                    </p>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Move the timeline or adjust your filters.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              yachtGroups.map(
                (group) => (
                  <TimelineRow
                    key={group.yachtId}
                    group={group}
                    visibleStart={
                      visibleStart
                    }
                    visibleEnd={
                      visibleEnd
                    }
                    days={
                      visibleDays
                    }
                    dayWidth={
                      dayWidth
                    }
                    timelineWidth={
                      timelineWidth
                    }
                    onSelectRecord={
                      setSelectedRecord
                    }
                  />
                )
              )
            )}
          </div>
        </div>

        {selectedRecord ? (
          <AvailabilityRecordDetails
            record={selectedRecord}
            onClose={() =>
              setSelectedRecord(null)
            }
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function TimelineHeader({
  days,
  monthGroups,
  dayWidth,
  timelineWidth,
}: {
  days: TimelineDay[];
  monthGroups: TimelineMonthGroup[];
  dayWidth: number;
  timelineWidth: number;
}) {
  return (
    <div className="sticky top-0 z-30 bg-background">
      <div
        className="grid border-b border-border"
        style={{
          gridTemplateColumns: `${YACHT_COLUMN_WIDTH}px ${timelineWidth}px`,
        }}
      >
        <div className="sticky left-0 z-40 flex items-center border-r border-border bg-background/60 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Yacht
          </p>
        </div>

        <div
          className="flex overflow-hidden"
          style={{
            width: timelineWidth,
          }}
        >
          {monthGroups.map(
            (group) => (
              <div
                key={group.key}
                className="shrink-0 border-r border-border px-3 py-3"
                style={{
                  width:
                    group.days.length *
                    dayWidth,
                }}
              >
                <p className="truncate text-sm font-medium">
                  {group.label}
                </p>
              </div>
            )
          )}
        </div>
      </div>

      <div
        className="grid border-b border-border"
        style={{
          gridTemplateColumns: `${YACHT_COLUMN_WIDTH}px ${timelineWidth}px`,
        }}
      >
        <div className="sticky left-0 z-40 border-r border-border bg-background/60 px-4 py-2">
          <p className="text-xs text-muted-foreground">
            {days.length} day view
          </p>
        </div>

        <div
          className="flex overflow-hidden"
          style={{
            width: timelineWidth,
          }}
        >
          {days.map((day) => (
            <div
              key={day.key}
              className={`shrink-0 border-r border-border/70 px-1 py-2 text-center ${
                day.isToday
                  ? "bg-emerald-500/10"
                  : day.isWeekend
                    ? "bg-muted/55"
                    : ""
              }`}
              style={{
                width: dayWidth,
              }}
            >
              <p className="truncate text-[10px] uppercase text-muted-foreground">
                {day.weekday}
              </p>

              <p
                className={`mt-1 text-xs ${
                  day.isToday
                    ? "font-semibold text-emerald-700 dark:text-emerald-300"
                    : "text-muted-foreground"
                }`}
              >
                {day.day}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  group,
  visibleStart,
  visibleEnd,
  days,
  dayWidth,
  timelineWidth,
  onSelectRecord,
}: {
  group: TimelineYachtGroup;
  visibleStart: Date;
  visibleEnd: Date;
  days: TimelineDay[];
  dayWidth: number;
  timelineWidth: number;
  onSelectRecord: (
    record: TimelineAvailabilityRecord
  ) => void;
}) {
  const bars = group.records
    .map((record) =>
      buildTimelineBar({
        record,
        visibleStart,
        visibleEnd,
        dayWidth,
      })
    )
    .filter(
      (
        bar
      ): bar is TimelineBarData =>
        Boolean(bar)
    );

  return (
    <div
      className="grid border-b border-border"
      style={{
        gridTemplateColumns: `${YACHT_COLUMN_WIDTH}px ${timelineWidth}px`,
        minHeight: ROW_HEIGHT,
      }}
    >
      <div className="sticky left-0 z-20 flex min-w-0 items-center border-r border-border bg-card px-4 py-3 shadow-[8px_0_18px_rgba(70,45,28,0.08)] dark:shadow-[8px_0_18px_rgba(0,0,0,0.22)]">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {group.yachtName}
          </p>

          <p className="mt-1 truncate text-xs text-muted-foreground">
            {group.records.length} window
            {group.records.length === 1
              ? ""
              : "s"}
          </p>
        </div>
      </div>

      <div
        className="relative isolate overflow-hidden"
        style={{
          width: timelineWidth,
          minHeight: ROW_HEIGHT,
        }}
      >
        <TimelineGrid
          days={days}
          dayWidth={dayWidth}
        />

        {bars.map((bar) => (
          <TimelineBar
            key={bar.record.id}
            bar={bar}
            onSelect={() =>
              onSelectRecord(bar.record)
            }
          />
        ))}
      </div>
    </div>
  );
}

function TimelineGrid({
  days,
  dayWidth,
}: {
  days: TimelineDay[];
  dayWidth: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 flex">
      {days.map((day) => (
        <div
          key={day.key}
          className={`h-full shrink-0 border-r border-border/70 ${
            day.isToday
              ? "bg-emerald-500/[0.035]"
              : day.isWeekend
                ? "bg-muted/40"
                : ""
          }`}
          style={{
            width: dayWidth,
          }}
        />
      ))}
    </div>
  );
}

function TimelineBar({
  bar,
  onSelect,
}: {
  bar: TimelineBarData;
  onSelect: () => void;
}) {
  const usableWidth = Math.max(
    bar.width - 6,
    12
  );

  const showStatus =
    usableWidth >= 56;

  const showRate =
    usableWidth >= 100;

  const title = [
    bar.record.yacht?.name ??
      "Unknown yacht",
    formatStatus(
      bar.record.status
    ),
    formatDateRange(
      bar.record.startDate,
      bar.record.endDate
    ),
    formatRoute(bar.record),
    bar.record.weeklyRate !== null
      ? formatMoney(
          bar.record.weeklyRate,
          bar.record.currency
        )
      : "Rate on request",
    bar.record.source?.name
      ? `Source: ${bar.record.source.name}`
      : null,
    bar.record.notes
      ? `Notes: ${bar.record.notes}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <button
      type="button"
      onClick={onSelect}
      title={title}
      aria-label={title}
      className={`absolute top-1/2 z-10 flex h-10 -translate-y-1/2 items-center overflow-hidden rounded-lg border text-left shadow-sm transition hover:z-20 hover:brightness-125 ${statusClass(
        bar.record.status
      )}`}
      style={{
        left: bar.left + 3,
        width: usableWidth,
      }}
    >
      {showStatus ? (
        <div className="min-w-0 px-2 py-1">
          <p className="truncate whitespace-nowrap text-xs font-medium">
            {formatStatus(
              bar.record.status
            )}
          </p>

          {showRate && (
            <p className="truncate whitespace-nowrap text-[10px] opacity-80">
              {formatRoute(bar.record) ??
                (bar.record.weeklyRate !== null
                  ? formatMoney(
                      bar.record.weeklyRate,
                      bar.record.currency
                    )
                  : bar.record.source?.name ??
                    "On request")}
            </p>
          )}
        </div>
      ) : (
        <span className="sr-only">
          {formatStatus(
            bar.record.status
          )}
        </span>
      )}
    </button>
  );
}

function AvailabilityRecordDetails({
  record,
  onClose,
}: {
  record: TimelineAvailabilityRecord;
  onClose: () => void;
}) {
  return (
    <div className="border-t border-border bg-background p-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">
            Availability details
          </p>
          <h3 className="mt-2 text-xl font-semibold">
            {record.yacht?.name ?? "Unknown yacht"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatDateRange(record.startDate, record.endDate)}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="border-border bg-card/55 text-foreground"
          onClick={onClose}
        >
          Close details
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailCard
          label="Status"
          value={formatStatus(record.status)}
        />
        <DetailCard
          label="Route"
          value={formatRoute(record) ?? "Not specified"}
        />
        <DetailCard
          label="Weekly rate"
          value={
            record.weeklyRate !== null
              ? formatMoney(record.weeklyRate, record.currency)
              : "Rate on request"
          }
        />
        <DetailCard
          label="Source"
          value={record.source?.name ?? "Not specified"}
        />
      </div>

      {record.notes ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/50 p-4 dark:bg-black/20">
          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Notes</p>
          <p className="mt-2 text-sm leading-6 text-foreground/80">{record.notes}</p>
        </div>
      ) : null}
    </div>
  );
}

function DetailCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/50 p-4 dark:bg-black/20">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-foreground">
        {value}
      </p>
    </div>
  );
}

function TimelineLegend() {
  const entries: Array<{
    status: TimelineAvailabilityStatus;
    label: string;
  }> = [
    {
      status: "available",
      label: "Available",
    },
    {
      status: "provisional",
      label: "Provisional",
    },
    {
      status: "option",
      label: "Option",
    },
    {
      status: "booked",
      label: "Booked",
    },
    {
      status: "maintenance",
      label: "Maintenance",
    },
    {
      status: "unavailable",
      label: "Unavailable",
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
      {entries.map((entry) => (
        <Badge
          key={entry.status}
          className={`border ${statusClass(
            entry.status
          )}`}
        >
          {entry.label}
        </Badge>
      ))}

      <div className="ml-auto hidden items-center gap-2 text-xs text-muted-foreground md:flex">
        <Minus className="size-3" />
        Scroll horizontally
        <Plus className="size-3" />
      </div>
    </div>
  );
}

function ZoomButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs transition ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function groupRecordsByYacht(
  records: TimelineAvailabilityRecord[],
  visibleStart: Date,
  visibleEnd: Date
): TimelineYachtGroup[] {
  const groups = new Map<
    string,
    TimelineYachtGroup
  >();

  for (const record of records) {
    if (!record.yacht) {
      continue;
    }

    const recordStart =
      parseDate(record.startDate);

    const recordEnd =
      parseDate(record.endDate);

    if (
      !recordStart ||
      !recordEnd ||
      recordEnd < visibleStart ||
      recordStart > visibleEnd
    ) {
      continue;
    }

    const existing = groups.get(
      record.yacht.id
    );

    if (existing) {
      existing.records.push(record);
      continue;
    }

    groups.set(record.yacht.id, {
      yachtId: record.yacht.id,
      yachtName:
        record.yacht.name,
      records: [record],
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      records: [...group.records].sort(
        (first, second) =>
          first.startDate.localeCompare(
            second.startDate
          )
      ),
    }))
    .sort((first, second) =>
      first.yachtName.localeCompare(
        second.yachtName
      )
    );
}

function buildTimelineBar({
  record,
  visibleStart,
  visibleEnd,
  dayWidth,
}: {
  record: TimelineAvailabilityRecord;
  visibleStart: Date;
  visibleEnd: Date;
  dayWidth: number;
}): TimelineBarData | null {
  const recordStart =
    parseDate(record.startDate);

  const recordEnd =
    parseDate(record.endDate);

  if (!recordStart || !recordEnd) {
    return null;
  }

  if (
    recordEnd < visibleStart ||
    recordStart > visibleEnd
  ) {
    return null;
  }

  const clippedStart =
    recordStart < visibleStart
      ? visibleStart
      : recordStart;

  const clippedEnd =
    recordEnd > visibleEnd
      ? visibleEnd
      : recordEnd;

  const startOffset =
    differenceInDays(
      clippedStart,
      visibleStart
    );

  const duration =
    differenceInDays(
      clippedEnd,
      clippedStart
    ) + 1;

  return {
    record,
    left: startOffset * dayWidth,
    width: duration * dayWidth,
  };
}

function buildTimelineDays(
  startDate: Date,
  count: number
): TimelineDay[] {
  return Array.from(
    {
      length: count,
    },
    (_, index) => {
      const date = addDays(
        startDate,
        index
      );

      return {
        date,
        key: formatDateKey(date),
        day: date.getDate(),
        month:
          date.toLocaleDateString(
            "en-US",
            {
              month: "short",
            }
          ),
        weekday:
          date.toLocaleDateString(
            "en-US",
            {
              weekday: "short",
            }
          ),
        isToday: isSameDay(
          date,
          new Date()
        ),
        isWeekend:
          date.getDay() === 0 ||
          date.getDay() === 6,
      };
    }
  );
}

function groupDaysByMonth(
  days: TimelineDay[]
): TimelineMonthGroup[] {
  const groups: TimelineMonthGroup[] =
    [];

  for (const day of days) {
    const key = `${day.date.getFullYear()}-${day.date.getMonth()}`;

    const existing =
      groups.at(-1);

    if (
      existing &&
      existing.key === key
    ) {
      existing.days.push(day);
      continue;
    }

    groups.push({
      key,
      label:
        day.date.toLocaleDateString(
          "en-US",
          {
            month: "long",
            year: "numeric",
          }
        ),
      days: [day],
    });
  }

  return groups;
}

function getInitialDate(
  records: TimelineAvailabilityRecord[]
) {
  const dates = records
    .map((record) =>
      parseDate(record.startDate)
    )
    .filter(
      (
        value
      ): value is Date =>
        value instanceof Date
    )
    .sort(
      (first, second) =>
        first.getTime() -
        second.getTime()
    );

  return (
    dates[0] ??
    startOfDay(new Date())
  );
}

function parseDate(
  value: string
): Date | null {
  const date = new Date(
    `${value}T00:00:00`
  );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : startOfDay(date);
}

function addDays(
  date: Date,
  amount: number
) {
  const result = new Date(date);

  result.setDate(
    result.getDate() + amount
  );

  return startOfDay(result);
}

function differenceInDays(
  later: Date,
  earlier: Date
) {
  const milliseconds =
    startOfDay(later).getTime() -
    startOfDay(earlier).getTime();

  return Math.round(
    milliseconds /
      (1000 * 60 * 60 * 24)
  );
}

function startOfDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

function isSameDay(
  first: Date,
  second: Date
) {
  return (
    first.getFullYear() ===
      second.getFullYear() &&
    first.getMonth() ===
      second.getMonth() &&
    first.getDate() ===
      second.getDate()
  );
}

function formatDateKey(
  date: Date
) {
  const year =
    date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatStatus(
  status: TimelineAvailabilityStatus
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

function formatDateRange(
  startDate: string,
  endDate: string
) {
  const start =
    parseDate(startDate);

  const end =
    parseDate(endDate);

  if (!start || !end) {
    return `${startDate} – ${endDate}`;
  }

  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
      }
    );

  return `${formatter.format(
    start
  )} – ${formatter.format(end)}`;
}

function formatRoute(
  record: TimelineAvailabilityRecord
): string | null {
  const embarkation =
    record.embarkationPort?.trim();

  const disembarkation =
    record.disembarkationPort?.trim();

  if (embarkation && disembarkation) {
    return `${embarkation} → ${disembarkation}`;
  }

  if (embarkation) {
    return `From ${embarkation}`;
  }

  if (disembarkation) {
    return `To ${disembarkation}`;
  }

  return (
    record.location?.trim() ||
    record.region?.trim() ||
    null
  );
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

function statusClass(
  status: TimelineAvailabilityStatus
) {
  switch (status) {
    case "available":
      return "border-emerald-500/35 bg-emerald-500/15 text-emerald-800 dark:text-emerald-100";

    case "provisional":
      return "border-cyan-500/35 bg-cyan-500/15 text-cyan-800 dark:text-cyan-100";

    case "option":
      return "border-amber-500/35 bg-amber-500/15 text-amber-900 dark:text-amber-100";

    case "booked":
      return "border-violet-500/35 bg-violet-500/15 text-violet-800 dark:text-violet-100";

    case "maintenance":
      return "border-orange-500/35 bg-orange-500/15 text-orange-900 dark:text-orange-100";

    case "unavailable":
    default:
      return "border-red-500/35 bg-red-500/15 text-red-800 dark:text-red-100";
  }
}