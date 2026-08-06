"use client";

import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type TimelineNavigatorStatus =
  | "available"
  | "provisional"
  | "option"
  | "booked"
  | "unavailable"
  | "maintenance";

export type TimelineNavigatorRecord = {
  id: string;
  startDate: string;
  endDate: string;
  status: TimelineNavigatorStatus;
};

type TimelineNavigatorProps = {
  records: TimelineNavigatorRecord[];
  visibleStart: Date;
  visibleDayCount: number;
  onVisibleStartChange: (date: Date) => void;
};

type NavigatorWindow = {
  start: Date;
  end: Date;
  totalDays: number;
};

type NavigatorMonth = {
  key: string;
  label: string;
  leftPercent: number;
  widthPercent: number;
};

type NavigatorBar = {
  id: string;
  status: TimelineNavigatorStatus;
  leftPercent: number;
  widthPercent: number;
};

const MINIMUM_NAVIGATOR_DAYS = 365;
const RANGE_PADDING_DAYS = 45;

export function TimelineNavigator({
  records,
  visibleStart,
  visibleDayCount,
  onVisibleStartChange,
}: TimelineNavigatorProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const navigatorWindow = useMemo(
    () =>
      buildNavigatorWindow({
        records,
        visibleStart,
        visibleDayCount,
      }),
    [records, visibleStart, visibleDayCount]
  );

  const months = useMemo(
    () => buildNavigatorMonths(navigatorWindow),
    [navigatorWindow]
  );

  const bars = useMemo(
    () => buildNavigatorBars(records, navigatorWindow),
    [records, navigatorWindow]
  );

  const viewport = useMemo(
    () =>
      buildViewportPosition({
        visibleStart,
        visibleDayCount,
        navigatorWindow,
      }),
    [visibleStart, visibleDayCount, navigatorWindow]
  );

  function handleTrackPointerDown(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    if (event.button !== 0 || !trackRef.current) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest("[data-timeline-viewport]")) {
      return;
    }

    const bounds = trackRef.current.getBoundingClientRect();
    const pointerPercent = clamp(
      ((event.clientX - bounds.left) / bounds.width) * 100,
      0,
      100
    );

    const nextLeftPercent = clamp(
      pointerPercent - viewport.widthPercent / 2,
      0,
      100 - viewport.widthPercent
    );

    updateVisibleStartFromPercent(nextLeftPercent);
  }

  function handleViewportPointerDown(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    if (event.button !== 0 || !trackRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const bounds = trackRef.current.getBoundingClientRect();
    const viewportLeftPixels =
      (viewport.leftPercent / 100) * bounds.width;

    dragOffsetRef.current =
      event.clientX - bounds.left - viewportLeftPixels;

    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleViewportPointerMove(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    if (!isDragging || !trackRef.current) {
      return;
    }

    const bounds = trackRef.current.getBoundingClientRect();
    const nextLeftPixels =
      event.clientX - bounds.left - dragOffsetRef.current;

    const maximumLeftPixels =
      bounds.width * ((100 - viewport.widthPercent) / 100);

    const constrainedLeftPixels = clamp(
      nextLeftPixels,
      0,
      maximumLeftPixels
    );

    const nextLeftPercent =
      bounds.width > 0
        ? (constrainedLeftPixels / bounds.width) * 100
        : 0;

    updateVisibleStartFromPercent(nextLeftPercent);
  }

  function handleViewportPointerUp(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function updateVisibleStartFromPercent(leftPercent: number) {
    const maximumStartOffset = Math.max(
      navigatorWindow.totalDays - visibleDayCount,
      0
    );

    const availablePercent = Math.max(
      100 - viewport.widthPercent,
      0
    );

    const progress =
      availablePercent > 0
        ? clamp(leftPercent / availablePercent, 0, 1)
        : 0;

    const dayOffset = Math.round(maximumStartOffset * progress);

    onVisibleStartChange(addDays(navigatorWindow.start, dayOffset));
  }

  return (
    <section className="w-full min-w-0 max-w-full border-b border-border bg-card/80 px-5 py-4 backdrop-blur-xl dark:bg-zinc-950/70">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Season navigator
          </p>

          <p className="mt-1 text-xs text-muted-foreground/75">
            Click the season or drag the highlighted viewport.
          </p>
        </div>

        <p className="hidden text-xs text-muted-foreground/75 sm:block">
          {formatCompactDate(visibleStart)}
          {" – "}
          {formatCompactDate(
            addDays(visibleStart, visibleDayCount - 1)
          )}
        </p>
      </div>

      <div className="relative">
        <div
          className="relative flex h-6 overflow-hidden rounded-t-lg border-x border-t border-border bg-muted/45 dark:bg-zinc-900"
          aria-hidden="true"
        >
          {months.map((month) => (
            <div
              key={month.key}
              className="absolute inset-y-0 border-r border-border/70 px-2"
              style={{
                left: `${month.leftPercent}%`,
                width: `${month.widthPercent}%`,
              }}
            >
              <span className="block truncate pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {month.label}
              </span>
            </div>
          ))}
        </div>

        <div
          ref={trackRef}
          onPointerDown={handleTrackPointerDown}
          className="relative h-16 cursor-crosshair touch-none overflow-hidden rounded-b-lg border border-border bg-muted/70 dark:bg-zinc-900/80"
        >
          <NavigatorGrid months={months} />

          <div className="absolute inset-x-0 top-2 h-2">
            {bars
              .filter((bar) => bar.status === "available")
              .map((bar) => (
                <NavigatorRecordBar key={bar.id} bar={bar} />
              ))}
          </div>

          <div className="absolute inset-x-0 top-5 h-2">
            {bars
              .filter(
                (bar) =>
                  bar.status === "provisional" ||
                  bar.status === "option"
              )
              .map((bar) => (
                <NavigatorRecordBar key={bar.id} bar={bar} />
              ))}
          </div>

          <div className="absolute inset-x-0 top-8 h-2">
            {bars
              .filter((bar) => bar.status === "booked")
              .map((bar) => (
                <NavigatorRecordBar key={bar.id} bar={bar} />
              ))}
          </div>

          <div className="absolute inset-x-0 top-11 h-2">
            {bars
              .filter(
                (bar) =>
                  bar.status === "maintenance" ||
                  bar.status === "unavailable"
              )
              .map((bar) => (
                <NavigatorRecordBar key={bar.id} bar={bar} />
              ))}
          </div>

          <div
            data-timeline-viewport
            role="slider"
            aria-label="Visible timeline period"
            aria-valuemin={0}
            aria-valuemax={Math.max(
              navigatorWindow.totalDays - visibleDayCount,
              0
            )}
            aria-valuenow={Math.max(
              differenceInDays(visibleStart, navigatorWindow.start),
              0
            )}
            tabIndex={0}
            onPointerDown={handleViewportPointerDown}
            onPointerMove={handleViewportPointerMove}
            onPointerUp={handleViewportPointerUp}
            onPointerCancel={handleViewportPointerUp}
            onKeyDown={(event) => {
              if (
                event.key !== "ArrowLeft" &&
                event.key !== "ArrowRight"
              ) {
                return;
              }

              event.preventDefault();

              onVisibleStartChange(
                addDays(
                  visibleStart,
                  event.key === "ArrowLeft" ? -1 : 1
                )
              );
            }}
            className={`absolute inset-y-1 z-20 touch-none rounded-md border-2 border-primary bg-primary/10 shadow-[0_0_24px_rgba(70,45,28,0.12)] outline-none transition-shadow focus:ring-2 focus:ring-primary/35 dark:border-white dark:bg-white/10 dark:shadow-[0_0_24px_rgba(255,255,255,0.12)] dark:focus:ring-white/40 ${
              isDragging
                ? "cursor-grabbing shadow-[0_0_30px_rgba(70,45,28,0.22)] dark:shadow-[0_0_30px_rgba(255,255,255,0.22)]"
                : "cursor-grab"
            }`}
            style={{
              left: `${viewport.leftPercent}%`,
              width: `${viewport.widthPercent}%`,
            }}
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-primary/25 dark:bg-white/20" />
            <div className="absolute left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary/55 dark:bg-white/50" />
            <div className="absolute right-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary/55 dark:bg-white/50" />
          </div>
        </div>
      </div>
    </section>
  );
}

function NavigatorGrid({
  months,
}: {
  months: NavigatorMonth[];
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {months.map((month) => (
        <div
          key={month.key}
          className="absolute inset-y-0 border-r border-border/50"
          style={{
            left: `${month.leftPercent}%`,
            width: `${month.widthPercent}%`,
          }}
        />
      ))}
    </div>
  );
}

function NavigatorRecordBar({
  bar,
}: {
  bar: NavigatorBar;
}) {
  return (
    <div
      className={`absolute h-full min-w-px rounded-full opacity-75 ${navigatorStatusClass(
        bar.status
      )}`}
      style={{
        left: `${bar.leftPercent}%`,
        width: `${bar.widthPercent}%`,
      }}
    />
  );
}

function buildNavigatorWindow({
  records,
  visibleStart,
  visibleDayCount,
}: {
  records: TimelineNavigatorRecord[];
  visibleStart: Date;
  visibleDayCount: number;
}): NavigatorWindow {
  const recordDates = records.flatMap((record) => {
    const start = parseDate(record.startDate);
    const end = parseDate(record.endDate);

    return [start, end].filter(
      (date): date is Date => date instanceof Date
    );
  });

  const visibleEnd = addDays(
    visibleStart,
    Math.max(visibleDayCount - 1, 0)
  );

  const earliestRecord =
    recordDates.length > 0
      ? new Date(
          Math.min(...recordDates.map((date) => date.getTime()))
        )
      : visibleStart;

  const latestRecord =
    recordDates.length > 0
      ? new Date(
          Math.max(...recordDates.map((date) => date.getTime()))
        )
      : visibleEnd;

  const earliestRelevant =
    earliestRecord < visibleStart ? earliestRecord : visibleStart;

  const latestRelevant =
    latestRecord > visibleEnd ? latestRecord : visibleEnd;

  let start = startOfMonth(
    addDays(earliestRelevant, -RANGE_PADDING_DAYS)
  );

  let end = endOfMonth(
    addDays(latestRelevant, RANGE_PADDING_DAYS)
  );

  const currentTotalDays = differenceInDays(end, start) + 1;

  if (currentTotalDays < MINIMUM_NAVIGATOR_DAYS) {
    const missingDays = MINIMUM_NAVIGATOR_DAYS - currentTotalDays;
    const before = Math.floor(missingDays / 2);
    const after = missingDays - before;

    start = startOfMonth(addDays(start, -before));
    end = endOfMonth(addDays(end, after));
  }

  return {
    start,
    end,
    totalDays: differenceInDays(end, start) + 1,
  };
}

function buildNavigatorMonths(
  window: NavigatorWindow
): NavigatorMonth[] {
  const months: NavigatorMonth[] = [];
  let cursor = startOfMonth(window.start);

  while (cursor <= window.end) {
    const monthStart = cursor < window.start ? window.start : cursor;
    const rawMonthEnd = endOfMonth(cursor);
    const monthEnd = rawMonthEnd > window.end ? window.end : rawMonthEnd;
    const startOffset = differenceInDays(monthStart, window.start);
    const duration = differenceInDays(monthEnd, monthStart) + 1;

    months.push({
      key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
      label: cursor.toLocaleDateString("en-US", {
        month: "short",
        year: cursor.getMonth() === 0 ? "numeric" : undefined,
      }),
      leftPercent: (startOffset / window.totalDays) * 100,
      widthPercent: (duration / window.totalDays) * 100,
    });

    cursor = addMonths(cursor, 1);
  }

  return months;
}

function buildNavigatorBars(
  records: TimelineNavigatorRecord[],
  window: NavigatorWindow
): NavigatorBar[] {
  return records
    .map((record) => {
      const start = parseDate(record.startDate);
      const end = parseDate(record.endDate);

      if (
        !start ||
        !end ||
        end < window.start ||
        start > window.end
      ) {
        return null;
      }

      const clippedStart = start < window.start ? window.start : start;
      const clippedEnd = end > window.end ? window.end : end;
      const startOffset = differenceInDays(clippedStart, window.start);
      const duration = differenceInDays(clippedEnd, clippedStart) + 1;

      return {
        id: record.id,
        status: record.status,
        leftPercent: (startOffset / window.totalDays) * 100,
        widthPercent: Math.max(
          (duration / window.totalDays) * 100,
          0.15
        ),
      };
    })
    .filter((bar): bar is NavigatorBar => bar !== null);
}

function buildViewportPosition({
  visibleStart,
  visibleDayCount,
  navigatorWindow,
}: {
  visibleStart: Date;
  visibleDayCount: number;
  navigatorWindow: NavigatorWindow;
}) {
  const maximumStartOffset = Math.max(
    navigatorWindow.totalDays - visibleDayCount,
    0
  );

  const rawStartOffset = differenceInDays(
    visibleStart,
    navigatorWindow.start
  );

  const constrainedStartOffset = clamp(
    rawStartOffset,
    0,
    maximumStartOffset
  );

  const widthPercent = clamp(
    (visibleDayCount / navigatorWindow.totalDays) * 100,
    2,
    100
  );

  const maximumLeftPercent = Math.max(100 - widthPercent, 0);

  const leftPercent =
    maximumStartOffset > 0
      ? (constrainedStartOffset / maximumStartOffset) *
        maximumLeftPercent
      : 0;

  return {
    leftPercent,
    widthPercent,
  };
}

function parseDate(value: string): Date | null {
  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return startOfDay(result);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function differenceInDays(later: Date, earlier: Date) {
  return Math.round(
    (startOfDay(later).getTime() - startOfDay(earlier).getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

function formatCompactDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function navigatorStatusClass(status: TimelineNavigatorStatus) {
  switch (status) {
    case "available":
      return "bg-emerald-400";
    case "provisional":
      return "bg-cyan-400";
    case "option":
      return "bg-amber-400";
    case "booked":
      return "bg-violet-400";
    case "maintenance":
      return "bg-orange-400";
    case "unavailable":
    default:
      return "bg-red-400";
  }
}