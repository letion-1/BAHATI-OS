import * as XLSX from "xlsx";

import type {
  ParsedWorkbook,
  ParsedWorksheet,
  SerializableCellValue,
} from "../source-types";

import type {
  AvailabilityStatus,
  NormalizedAvailability,
  NormalizedYacht,
  ParserDetection,
  ParserResult,
  WorkbookParser,
} from "./types";

const PARSER_ID = "single-yacht-weekly-calendar-v1";

const GENERIC_TITLE_WORDS = new Set([
  "booking","booking list","booking 2026","booking 2027",
  "availability","summer 2026","summer 2027",
  "private charter","cabin charter","available routes",
  "updated","documents",
]);

const PORT_CODE_MAP: Record<string, string> = {
  S: "Split",
  D: "Dubrovnik",
};

function getWorkbookCell(
  worksheet: ParsedWorksheet,
  row: number,
  column: number
) {
  return worksheet.cells.find(
    (cell) =>
      cell.row === row &&
      cell.column === column
  );
}

function normalizeColor(value?: string): string {
  return (value ?? "")
    .toUpperCase()
    .replace(/^#/, "")
    .replace(/^FF(?=[0-9A-F]{6}$)/, "");
}

function isWhiteColor(value?: string): boolean {
  const normalized = normalizeColor(value);

  return (
    normalized === "" ||
    normalized === "FFFFFF" ||
    normalized === "FFFFFFFF" ||
    normalized === "00000000" ||
    normalized === "TRANSPARENT" ||
    normalized === "THEME:0" ||
    normalized === "INDEXED:9" ||
    normalized === "INDEXED:64"
  );
}

function hasAvailabilityFill(
  worksheet: ParsedWorksheet,
  row: number,
  column: number
): boolean {
  const fill = getWorkbookCell(
    worksheet,
    row,
    column
  )?.fill;

  if (!fill) {
    return false;
  }

  const pattern = (
    fill.patternType ?? ""
  ).toLowerCase();

  if (
    pattern === "none" ||
    pattern === "gray125"
  ) {
    return false;
  }

  return (
    !isWhiteColor(fill.foregroundColor) ||
    !isWhiteColor(fill.backgroundColor)
  );
}

function extractRouteCode(
  value: string
): string | null {
  const match = value
    .toUpperCase()
    .match(
      /(?:^|\s)([SD])\s*-\s*([SD])(?:\s|$|[.,;])/i
    );

  return match
    ? `${match[1].toUpperCase()}-${match[2].toUpperCase()}`
    : null;
}

function decodeRoute(
  routeCode: string | null
): {
  embarkationPort: string | null;
  disembarkationPort: string | null;
} {
  if (!routeCode) {
    return {
      embarkationPort: null,
      disembarkationPort: null,
    };
  }

  const [fromCode, toCode] =
    routeCode.split("-");

  return {
    embarkationPort:
      PORT_CODE_MAP[fromCode] ?? null,
    disembarkationPort:
      PORT_CODE_MAP[toCode] ?? null,
  };
}


function normalizeText(value: SerializableCellValue): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function getCellAddress(row: number, column: number): string {
  return XLSX.utils.encode_cell({ r: row - 1, c: column - 1 });
}

function detectYear(worksheet: ParsedWorksheet): number {
  const sheetMatch = worksheet.name.match(/\b(20\d{2}|21\d{2})\b/);
  if (sheetMatch) return Number(sheetMatch[1]);

  for (const cell of worksheet.cells) {
    const match = normalizeText(cell.value).match(/\b(20\d{2}|21\d{2})\b/);
    if (match) return Number(match[1]);
  }

  return new Date().getUTCFullYear();
}

function parseDateRange(
  value: SerializableCellValue,
  year: number
): {
  startDate: string;
  endDate: string;
} | null {
  const text = normalizeText(value)
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ");

  /*
   * A source cell may contain both the dates and route:
   * "01.08. - 08.08. D-D".
   */
  const match = text.match(
    /(?:^|\s)(\d{1,2})[./-](\d{1,2})[./-]?\s*-\s*(\d{1,2})[./-](\d{1,2})[./-]?/i
  );

  if (!match) {
    return null;
  }

  const startDay = Number(match[1]);
  const startMonth = Number(match[2]);
  const endDay = Number(match[3]);
  const endMonth = Number(match[4]);

  const start = new Date(
    Date.UTC(year, startMonth - 1, startDay)
  );

  const end = new Date(
    Date.UTC(year, endMonth - 1, endDay)
  );

  if (
    start.getUTCDate() !== startDay ||
    start.getUTCMonth() !== startMonth - 1 ||
    end.getUTCDate() !== endDay ||
    end.getUTCMonth() !== endMonth - 1
  ) {
    return null;
  }

  if (end < start) {
    end.setUTCFullYear(
      end.getUTCFullYear() + 1
    );
  }

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function looksLikePrice(value: SerializableCellValue): boolean {
  if (typeof value === "number" && Number.isFinite(value) && value > 100) return true;
  const text = normalizeText(value);
  return /\d/.test(text) && /€|\$|£|\bEUR\b|\bUSD\b|\bGBP\b/i.test(text);
}

function parsePrice(value: SerializableCellValue): {
  price: number | null;
  currency: string | null;
} {
  const text = normalizeText(value);
  let currency: string | null = null;

  if (/€|\bEUR\b/i.test(text)) currency = "EUR";
  else if (/\$|\bUSD\b/i.test(text)) currency = "USD";
  else if (/£|\bGBP\b/i.test(text)) currency = "GBP";

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return { price: value, currency: currency ?? "EUR" };
  }

  const cleaned = text
    .replace(/[€$£]/g, "")
    .replace(/\b(EUR|USD|GBP)\b/gi, "")
    .replace(/\s/g, "")
    .replace(/,(?=\d{3}\b)/g, "")
    .replace(/,(?=\d{1,2}\b)/, ".");

  const match = cleaned.match(/\d+(?:\.\d+)?/);
  if (!match) return { price: null, currency };

  const amount = Number(match[0]);
  return {
    price: Number.isFinite(amount) && amount > 0 ? amount : null,
    currency: currency ?? (Number.isFinite(amount) ? "EUR" : null),
  };
}

function classifyStatus({
  worksheet,
  row,
  columns,
  values,
}: {
  worksheet: ParsedWorksheet;
  row: number;
  columns: number[];
  values: SerializableCellValue[];
}): {
  status: AvailabilityStatus;
  notes: string | null;
  rawValue: SerializableCellValue;
  routeCode: string | null;
  embarkationPort: string | null;
  disembarkationPort: string | null;
  availabilityColorDetected: boolean;
} {
  const nonEmpty = values
    .map((value) => ({
      value,
      text: normalizeText(value),
    }))
    .filter((item) => item.text);

  const combined = nonEmpty
    .map((item) => item.text)
    .join(" | ");

  const routeCode =
    extractRouteCode(combined);

  const route = decodeRoute(routeCode);

  const availabilityColorDetected =
    columns.some((column) =>
      hasAvailabilityFill(
        worksheet,
        row,
        column
      )
    );

  const common = {
    routeCode,
    embarkationPort:
      route.embarkationPort,
    disembarkationPort:
      route.disembarkationPort,
    availabilityColorDetected,
  };

  if (
    /maintenance|out\s*of\s*service|dry\s*dock/i.test(
      combined
    )
  ) {
    return {
      status: "out_of_service",
      notes: combined || null,
      rawValue: nonEmpty[0]?.value ?? null,
      ...common,
    };
  }

  if (
    /not\s*available|unavailable|\bn\/a\b/i.test(
      combined
    )
  ) {
    return {
      status: "unavailable",
      notes: combined || null,
      rawValue: nonEmpty[0]?.value ?? null,
      ...common,
    };
  }

  if (/\boption\b|\bopt\b/i.test(combined)) {
    return {
      status: "option",
      notes: combined || null,
      rawValue: nonEmpty[0]?.value ?? null,
      ...common,
    };
  }

  if (/\breserved\b|\bhold\b/i.test(combined)) {
    return {
      status: "reserved",
      notes: combined || null,
      rawValue: nonEmpty[0]?.value ?? null,
      ...common,
    };
  }

  if (/\bbooked\b|\bbooking\b/i.test(combined)) {
    return {
      status: "booked",
      notes: combined || null,
      rawValue: nonEmpty[0]?.value ?? null,
      ...common,
    };
  }

  return {
    status: availabilityColorDetected
      ? "available"
      : "unavailable",
    notes: combined || null,
    rawValue: nonEmpty[0]?.value ?? null,
    ...common,
  };
}

function findYachtName(
  worksheet: ParsedWorksheet
): { name: string; row: number | null; column: number | null } {
  const year = detectYear(worksheet);

  const candidates = worksheet.cells
    .filter((cell) => {
      if (cell.row > 15 || typeof cell.value !== "string") return false;

      const text = normalizeText(cell.value);
      const lower = text.toLowerCase();

      if (
        text.length < 3 ||
        text.length > 100 ||
        GENERIC_TITLE_WORDS.has(lower) ||
        /^https?:\/\//i.test(text) ||
        parseDateRange(text, year)
      ) {
        return false;
      }

      if (/gulet|yacht|m\/s|m\/y|msy|motor yacht|sailing yacht|catamaran/i.test(text)) {
        return true;
      }

      const letters = text.match(/[A-Za-zÀ-ž]/g)?.length ?? 0;
      const uppercase = text.match(/[A-ZÀ-Ž]/g)?.length ?? 0;

      return letters >= 4 && uppercase / Math.max(letters, 1) >= 0.65;
    })
    .sort((a, b) => a.row - b.row);

  const selected =
    candidates.find((cell) =>
      /gulet|yacht|m\/s|m\/y|msy|motor yacht|sailing yacht|catamaran/i.test(
        normalizeText(cell.value)
      )
    ) ?? candidates[0];

  if (selected) {
    const raw = normalizeText(selected.value);
    const cleaned = raw
      .replace(/^(?:gulet|motor yacht|sailing yacht|catamaran|m\/s|m\/y|msy)\s*/i, "")
      .replace(/^["']|["']$/g, "")
      .trim();

    return {
      name: cleaned || raw,
      row: selected.row,
      column: selected.column,
    };
  }

  const fallback = worksheet.name
    .replace(/\bbooking\b/gi, "")
    .replace(/\b20\d{2}\b/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    name: fallback || "Imported yacht",
    row: null,
    column: null,
  };
}

function parseSingleYachtWeeklyCalendar(
  workbook: ParsedWorkbook,
  detection: ParserDetection
): ParserResult {
  const worksheet =
    workbook.sheets.find((sheet) => sheet.name === detection.sheetName) ??
    workbook.sheets[0];

  if (!worksheet) {
    throw new Error("The detected weekly calendar worksheet was not found.");
  }

  const identity = findYachtName(worksheet);
  const yachtSourceKey = `${slugify(worksheet.name)}:${slugify(identity.name)}`;

  const yacht: NormalizedYacht = {
    sourceKey: yachtSourceKey,
    name: identity.name,
    sourceSheet: worksheet.name,
    sourceRow: identity.row,
    sourceColumn: identity.column,
    brochureUrl: null,
    metadata: {
      parserId: PARSER_ID,
      detectedFrom: identity.row ? "worksheet_title" : "worksheet_name",
    },
  };

  const availability: NormalizedAvailability[] = [];
  const year = detectYear(worksheet);

  for (let row = 1; row <= worksheet.rowCount; row += 1) {
    const values = worksheet.matrix[row - 1] ?? [];

    for (let column = 1; column <= values.length; column += 1) {
      const range = parseDateRange(values[column - 1], year);
      if (!range) continue;

      const dateCellValue =
        values[column - 1] ?? null;

      const afterDate = values.slice(column);
      const priceValue =
        afterDate.find(looksLikePrice) ?? null;

      const { price, currency } =
        parsePrice(priceValue);

      const statusEntries = [
        {
          value: dateCellValue,
          column,
        },
        ...afterDate.map((value, index) => ({
          value,
          column: column + index + 1,
        })),
      ].filter(
        (entry) => entry.value !== priceValue
      );

      const classification = classifyStatus({
        worksheet,
        row,
        columns: statusEntries.map(
          (entry) => entry.column
        ),
        values: statusEntries.map(
          (entry) => entry.value
        ),
      });

      availability.push({
        sourceKey: [yachtSourceKey, range.startDate, range.endDate, row].join(":"),
        yachtSourceKey,
        yachtName: yacht.name,
        startDate: range.startDate,
        endDate: range.endDate,
        status: classification.status,
        price,
        currency,
        rawValue: classification.rawValue,
        sourceSheet: worksheet.name,
        sourceCell: getCellAddress(row, column),
        sourceRow: row,
        sourceColumn: column,
        notes: classification.notes,
        metadata: {
          parserId: PARSER_ID,
          dateColumn: column,
          detectedYear: year,
          routeCode:
            classification.routeCode,
          embarkationPort:
            classification.embarkationPort,
          disembarkationPort:
            classification.disembarkationPort,
          location:
            classification.embarkationPort,
          region: "Croatia",
          availabilityColorDetected:
            classification.availabilityColorDetected,
        },
      });

      break;
    }
  }

  if (availability.length === 0) {
    throw new Error(
      "The single-yacht weekly calendar parser found the yacht title but no weekly date ranges."
    );
  }

  return {
    parserId: PARSER_ID,
    layout: "single_yacht_weekly_calendar",
    confidence: detection.confidence,
    yachts: [yacht],
    availability,
    warnings: [],
    metadata: {
      sheetName: worksheet.name,
      detectedYear: year,
      yachtCount: 1,
      availabilityCount: availability.length,
      yachtName: yacht.name,
    },
  };
}

export const singleYachtWeeklyCalendarParser: WorkbookParser = {
  id: PARSER_ID,
  layout: "single_yacht_weekly_calendar",

  detect(workbook: ParsedWorkbook): ParserDetection {
    return {
      layout: "single_yacht_weekly_calendar",
      confidence: 0,
      parserId: PARSER_ID,
      reasons: [],
      sheetName: workbook.sheets[0]?.name ?? null,
    };
  },

  parse(
    workbook: ParsedWorkbook,
    detection: ParserDetection
  ): ParserResult {
    return parseSingleYachtWeeklyCalendar(workbook, detection);
  },
};