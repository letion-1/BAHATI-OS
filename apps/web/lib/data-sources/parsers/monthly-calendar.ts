import type {
  ParsedWorkbook,
  ParsedWorksheet,
  SerializableCellValue,
  WorkbookCellFill,
} from "../source-types";

import type {
  AvailabilityStatus,
  NormalizedAvailability,
  NormalizedYacht,
  ParserDetection,
  ParserResult,
  WorkbookParser,
} from "./types";

const PARSER_ID = "monthly-calendar-v1";

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

type CalendarDay = {
  date: string;
  status: AvailabilityStatus;
  rawValue: SerializableCellValue;
  sourceSheet: string;
  sourceCell: string;
  sourceRow: number;
  sourceColumn: number;
  fill: WorkbookCellFill | undefined;
};

export const monthlyCalendarParser: WorkbookParser = {
  id: PARSER_ID,
  layout: "monthly_calendar",

  detect(workbook: ParsedWorkbook): ParserDetection {
    const sheet = workbook.sheets.find((candidate) =>
      Boolean(findMonthYear(candidate))
    );

    return {
      layout: "monthly_calendar",
      confidence: sheet ? 0.9 : 0,
      parserId: PARSER_ID,
      reasons: sheet
        ? ["Found month/year calendar headings and numbered day cells."]
        : [],
      sheetName: sheet?.name ?? workbook.sheets[0]?.name ?? null,
    };
  },

  parse(
    workbook: ParsedWorkbook,
    detection: ParserDetection
  ): ParserResult {
    const warnings: string[] = [];
    const days: CalendarDay[] = [];

    for (const sheet of workbook.sheets) {
      const monthYear = findMonthYear(sheet);

      if (!monthYear) {
        continue;
      }

      const seenDates = new Set<string>();

      for (const cell of sheet.cells) {
        const day = parseCalendarDay(cell.value);

        if (day === null) {
          continue;
        }

        const date = toIsoDate(
          monthYear.year,
          monthYear.month,
          day
        );

        if (!date || seenDates.has(date)) {
          continue;
        }

        const status = statusFromFill(cell.fill);

        if (status === "unknown") {
          continue;
        }

        seenDates.add(date);
        days.push({
          date,
          status,
          rawValue: cell.value,
          sourceSheet: sheet.name,
          sourceCell: cell.address,
          sourceRow: cell.row,
          sourceColumn: cell.column,
          fill: cell.fill,
        });
      }

      if (seenDates.size === 0) {
        warnings.push(
          `Sheet "${sheet.name}" looked like a monthly calendar, but no styled day cells were recognized.`
        );
      }
    }

    if (days.length === 0) {
      throw new Error(
        "The monthly calendar did not contain any recognizable availability day cells."
      );
    }

    days.sort((first, second) =>
      first.date.localeCompare(second.date)
    );

    const yachtSourceKey = "monthly-calendar:imported-yacht";

    const yacht: NormalizedYacht = {
      sourceKey: yachtSourceKey,
      name: "Imported Yacht",
      sourceSheet: detection.sheetName ?? days[0].sourceSheet,
      sourceRow: null,
      sourceColumn: null,
      brochureUrl: null,
      metadata: {
        parserId: PARSER_ID,
        calendarSheetCount: workbook.sheets.length,
      },
    };

    const availability = aggregateDays(
      days,
      yachtSourceKey,
      yacht.name
    );

    return {
      parserId: PARSER_ID,
      layout: "monthly_calendar",
      confidence: Math.max(detection.confidence, 0.9),
      yachts: [yacht],
      availability,
      warnings,
      metadata: {
        sheetName: detection.sheetName,
        detectedYear: findDetectedYear(days),
        yachtCount: 1,
        availabilityCount: availability.length,
        calendarDayCount: days.length,
      },
    };
  },
};

function findMonthYear(
  sheet: ParsedWorksheet
): { month: number; year: number } | null {
  const sample = [
    sheet.name,
    ...sheet.cells
      .slice(0, 40)
      .map((cell) =>
        cell.formattedValue ?? String(cell.value ?? "")
      ),
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const monthPattern = Object.keys(MONTHS)
    .sort((first, second) => second.length - first.length)
    .join("|");

  const monthThenYear = new RegExp(
    `\\b(${monthPattern})\\s*[,/-]?\\s*(20\\d{2})\\b`,
    "i"
  ).exec(sample);

  if (monthThenYear) {
    return {
      month: MONTHS[monthThenYear[1].toLowerCase()],
      year: Number(monthThenYear[2]),
    };
  }

  const yearThenMonth = new RegExp(
    `\\b(20\\d{2})\\s*[,/-]?\\s*(${monthPattern})\\b`,
    "i"
  ).exec(sample);

  if (yearThenMonth) {
    return {
      month: MONTHS[yearThenMonth[2].toLowerCase()],
      year: Number(yearThenMonth[1]),
    };
  }

  return null;
}

function parseCalendarDay(
  value: SerializableCellValue
): number | null {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 31
  ) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const match = /^\s*(\d{1,2})\s*$/.exec(value);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  return day >= 1 && day <= 31 ? day : null;
}

function statusFromFill(
  fill: WorkbookCellFill | undefined
): AvailabilityStatus {
  const color = normalizeColor(
    fill?.foregroundColor ?? fill?.backgroundColor
  );

  if (!color) {
    return "unknown";
  }

  if (color === "10B981") return "available";
  if (color === "8B5CF6") return "booked";
  if (color === "F59E0B") return "option";
  if (color === "06B6D4") return "reserved";
  if (color === "F97316") return "unavailable";
  if (color === "EF4444") return "unavailable";

  const red = Number.parseInt(color.slice(0, 2), 16);
  const green = Number.parseInt(color.slice(2, 4), 16);
  const blue = Number.parseInt(color.slice(4, 6), 16);

  if (green > red * 1.18 && green > blue * 1.18) {
    return "available";
  }

  if (blue > red * 1.1 && red > green * 1.05) {
    return "booked";
  }

  if (red > 180 && green > 110 && blue < 110) {
    return "option";
  }

  if (red > 170 && green < 140) {
    return "unavailable";
  }

  return "unknown";
}

function normalizeColor(
  value: string | undefined
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .toUpperCase()
    .replace(/^#/, "")
    .replace(/^FF(?=[0-9A-F]{6}$)/, "");

  return /^[0-9A-F]{6}$/.test(normalized)
    ? normalized
    : null;
}

function aggregateDays(
  days: CalendarDay[],
  yachtSourceKey: string,
  yachtName: string
): NormalizedAvailability[] {
  const windows: NormalizedAvailability[] = [];
  let current: CalendarDay[] = [];

  const flush = () => {
    if (current.length === 0) {
      return;
    }

    const first = current[0];
    const last = current[current.length - 1];

    windows.push({
      sourceKey: [
        yachtSourceKey,
        first.date,
        last.date,
        first.status,
      ].join(":"),
      yachtSourceKey,
      yachtName,
      startDate: first.date,
      endDate: last.date,
      status: first.status,
      price: null,
      currency: null,
      rawValue: first.rawValue,
      sourceSheet: first.sourceSheet,
      sourceCell: first.sourceCell,
      sourceRow: first.sourceRow,
      sourceColumn: first.sourceColumn,
      notes: null,
      metadata: {
        parserId: PARSER_ID,
        calendarDayCount: current.length,
        sourceCells: current.map((day) => day.sourceCell),
        sourceFill: first.fill ?? null,
      },
    });

    current = [];
  };

  for (const day of days) {
    const previous = current[current.length - 1];

    if (
      previous &&
      (previous.status !== day.status ||
        addDays(previous.date, 1) !== day.date)
    ) {
      flush();
    }

    current.push(day);
  }

  flush();
  return windows;
}

function toIsoDate(
  year: number,
  month: number,
  day: number
): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function addDays(
  isoDate: string,
  amount: number
): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function findDetectedYear(
  days: CalendarDay[]
): number | null {
  const year = Number(days[0]?.date.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}