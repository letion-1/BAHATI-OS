import * as XLSX from "xlsx";

import type {
  ParsedWorkbook,
  ParsedWorksheet,
  SerializableCellValue,
} from "../source-types";

import { detectWorkbookLayout } from "./detect-layout";

import type {
  AvailabilityStatus,
  NormalizedAvailability,
  NormalizedYacht,
  ParserDetection,
  ParserResult,
  WorkbookParser,
} from "./types";

type DateRange = {
  startDate: string | null;
  endDate: string | null;
};

type ClassifiedValue = {
  status: AvailabilityStatus;
  price: number | null;
  currency: string | null;
  notes: string | null;
  bookingCode: string | null;
  embarkationPort: string | null;
  disembarkationPort: string | null;
  availabilityColorDetected: boolean;
};

const PARSER_ID =
  "horizontal-yacht-calendar-v1";

const IGNORED_YACHT_NAMES = new Set([
  "e-brochure",
  "brochure",
  "availability",
  "price",
  "prices",
  "booking",
  "bookings",
  "calendar",
  "week",
  "weeks",
  "date",
  "dates",
  "status",
  "from",
  "to",
  "start",
  "end",
]);

const OUT_OF_SERVICE_PATTERNS = [
  /out\s*of\s*service/i,
  /not\s*in\s*service/i,
  /maintenance/i,
  /dry\s*dock/i,
  /inactive/i,
];

const UNAVAILABLE_PATTERNS = [
  /^unavailable$/i,
  /^not\s*available$/i,
  /^n\/a$/i,
];

const OPTION_PATTERNS = [
  /\boption\b/i,
  /\bopt\b/i,
];

const RESERVED_PATTERNS = [
  /\breserved\b/i,
  /\breserve\b/i,
  /\bhold\b/i,
];

const PRICE_ON_REQUEST_PATTERNS = [
  /\bpor\b/i,
  /price\s*on\s*request/i,
  /on\s*request/i,
];


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

function normalizeText(
  value: SerializableCellValue
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(
  value: string
): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getMatrixValue(
  worksheet: ParsedWorksheet,
  row: number,
  column: number
): SerializableCellValue {
  return (
    worksheet.matrix[row - 1]?.[
      column - 1
    ] ?? null
  );
}

function getCellAddress(
  row: number,
  column: number
): string {
  return XLSX.utils.encode_cell({
    r: row - 1,
    c: column - 1,
  });
}

function isYearValue(
  value: SerializableCellValue
): boolean {
  if (
    typeof value === "number" &&
    value >= 2000 &&
    value <= 2100
  ) {
    return true;
  }

  return /^(20\d{2}|21\d{2})$/.test(
    normalizeText(value)
  );
}

function looksLikeDatePart(
  value: SerializableCellValue
): boolean {
  const text = normalizeText(value);

  return (
    /^\d{1,2}[./-]\d{1,2}[./-]?$/.test(
      text
    ) ||
    /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(
      text
    )
  );
}

function parseDatePart(
  value: SerializableCellValue,
  fallbackYear: number
): string | null {
  const text = normalizeText(value);

  const match = text.match(
    /^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?[./-]?$/
  );

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);

  let year = match[3]
    ? Number(match[3])
    : fallbackYear;

  if (year < 100) {
    year += 2000;
  }

  if (
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !==
      month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date
    .toISOString()
    .slice(0, 10);
}

function findDetectedSheet(
  workbook: ParsedWorkbook,
  detection: ParserDetection
): ParsedWorksheet | null {
  if (detection.sheetName) {
    const matchingSheet =
      workbook.sheets.find(
        (sheet) =>
          sheet.name ===
          detection.sheetName
      );

    if (matchingSheet) {
      return matchingSheet;
    }
  }

  return workbook.sheets[0] ?? null;
}

function findHeaderRow(
  worksheet: ParsedWorksheet
): number | null {
  const candidates = new Map<
    number,
    number[]
  >();

  for (const cell of worksheet.cells) {
    if (
      cell.row > 20 ||
      !isPotentialYachtName(
        cell.value
      )
    ) {
      continue;
    }

    const columns =
      candidates.get(cell.row) ?? [];

    columns.push(cell.column);

    candidates.set(
      cell.row,
      columns
    );
  }

  let bestRow: number | null = null;
  let bestScore = -1;

  for (
    const [row, columns]
    of candidates.entries()
  ) {
    const sortedColumns = [
      ...columns,
    ].sort(
      (first, second) =>
        first - second
    );

    let twoColumnGaps = 0;

    for (
      let index = 1;
      index < sortedColumns.length;
      index += 1
    ) {
      if (
        sortedColumns[index] -
          sortedColumns[index - 1] ===
        2
      ) {
        twoColumnGaps += 1;
      }
    }

    const dateRowsBelow =
      countDateRowsBelow(
        worksheet,
        row
      );

    const hasYear =
      worksheet.cells.some(
        (cell) =>
          cell.row === row &&
          isYearValue(cell.value)
      );

    const score =
      columns.length * 10 +
      twoColumnGaps * 5 +
      dateRowsBelow * 5 +
      (hasYear ? 10 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestRow = row;
    }
  }

  return bestRow;
}

function countDateRowsBelow(
  worksheet: ParsedWorksheet,
  headerRow: number
): number {
  let count = 0;

  const finalRow = Math.min(
    worksheet.rowCount,
    headerRow + 25
  );

  for (
    let row = headerRow + 1;
    row <= finalRow;
    row += 1
  ) {
    const values =
      worksheet.matrix[row - 1] ??
      [];

    const firstTen =
      values.slice(0, 10);

    const dates = firstTen.filter(
      looksLikeDatePart
    );

    const hasSeparator =
      firstTen.some(
        (value) => {
          const text =
            normalizeText(value);

          return (
            text === "-" ||
            text === "–" ||
            text === "—"
          );
        }
      );

    if (
      dates.length >= 2 &&
      hasSeparator
    ) {
      count += 1;
    }
  }

  return count;
}

function findCalendarYear(
  worksheet: ParsedWorksheet,
  headerRow: number
): number | null {
  const headerValues =
    worksheet.matrix[
      headerRow - 1
    ] ?? [];

  for (
    const value
    of headerValues
  ) {
    if (isYearValue(value)) {
      return Number(
        normalizeText(value)
      );
    }
  }

  const sheetNameMatch =
    worksheet.name.match(
      /\b(20\d{2}|21\d{2})\b/
    );

  if (sheetNameMatch) {
    return Number(
      sheetNameMatch[1]
    );
  }

  for (const cell of worksheet.cells) {
    if (
      cell.row <= 10 &&
      isYearValue(cell.value)
    ) {
      return Number(
        normalizeText(cell.value)
      );
    }
  }

  return null;
}

function findDateRange(
  worksheet: ParsedWorksheet,
  row: number,
  fallbackYear: number
): DateRange {
  const values =
    worksheet.matrix[row - 1] ??
    [];

  const dateParts: string[] = [];

  for (
    let columnIndex = 0;
    columnIndex <
      Math.min(values.length, 10);
    columnIndex += 1
  ) {
    const value =
      values[columnIndex];

    if (!looksLikeDatePart(value)) {
      continue;
    }

    const parsedDate =
      parseDatePart(
        value,
        fallbackYear
      );

    if (parsedDate) {
      dateParts.push(parsedDate);
    }
  }

  if (dateParts.length < 2) {
    return {
      startDate: null,
      endDate: null,
    };
  }

  const startDate = dateParts[0];
  let endDate = dateParts[1];

  const start = new Date(
    `${startDate}T00:00:00Z`
  );

  const end = new Date(
    `${endDate}T00:00:00Z`
  );

  if (
    end.getTime() <
    start.getTime()
  ) {
    end.setUTCFullYear(
      end.getUTCFullYear() + 1
    );

    endDate = end
      .toISOString()
      .slice(0, 10);
  }

  return {
    startDate,
    endDate,
  };
}

function isPotentialYachtName(
  value: SerializableCellValue
): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const text = normalizeText(value);

  if (
    text.length < 3 ||
    text.length > 100
  ) {
    return false;
  }

  const lower =
    text.toLowerCase();

  if (
    IGNORED_YACHT_NAMES.has(
      lower
    )
  ) {
    return false;
  }

  if (
    text.includes("@") ||
    /^https?:\/\//i.test(text) ||
    text.includes(".com") ||
    text.includes(".hr")
  ) {
    return false;
  }

  if (
    isYearValue(value) ||
    looksLikeDatePart(value)
  ) {
    return false;
  }

  if (
    /^[\d\s.,€$£-]+$/.test(
      text
    )
  ) {
    return false;
  }

  const letters =
    text.match(
      /[A-Za-zÀ-ž]/g
    )?.length ?? 0;

  if (letters < 3) {
    return false;
  }

  const uppercaseLetters =
    text.match(
      /[A-ZÀ-Ž]/g
    )?.length ?? 0;

  const uppercaseRatio =
    uppercaseLetters /
    Math.max(letters, 1);

  return uppercaseRatio >= 0.5;
}

function extractBrochureUrl(
  worksheet: ParsedWorksheet,
  row: number,
  column: number
): string | null {
  const directValue =
    normalizeText(
      getMatrixValue(
        worksheet,
        row,
        column
      )
    );

  if (
    /^https?:\/\//i.test(
      directValue
    )
  ) {
    return directValue;
  }

  const matchingCell =
    worksheet.cells.find(
      (cell) =>
        cell.row === row &&
        cell.column === column
    );

  const cellMetadata =
    matchingCell as
      | {
          hyperlink?: string;
          link?: {
            target?: string;
          };
        }
      | undefined;

  if (
    typeof cellMetadata?.hyperlink ===
    "string"
  ) {
    return cellMetadata.hyperlink;
  }

  if (
    typeof cellMetadata?.link
      ?.target === "string"
  ) {
    return cellMetadata.link.target;
  }

  return null;
}

function extractYachts(
  worksheet: ParsedWorksheet,
  headerRow: number
): NormalizedYacht[] {
  const yachts:
    NormalizedYacht[] = [];

  const headerValues =
    worksheet.matrix[
      headerRow - 1
    ] ?? [];

  for (
    let column = 1;
    column <= headerValues.length;
    column += 1
  ) {
    const value =
      getMatrixValue(
        worksheet,
        headerRow,
        column
      );

    if (
      !isPotentialYachtName(value)
    ) {
      continue;
    }

    const previousValue =
      column > 1
        ? normalizeText(
            getMatrixValue(
              worksheet,
              headerRow,
              column - 1
            )
          )
        : "";

    const nextValue =
      normalizeText(
        getMatrixValue(
          worksheet,
          headerRow,
          column + 1
        )
      );

    const hasCalendarSpacing =
      !previousValue ||
      !nextValue;

    if (!hasCalendarSpacing) {
      continue;
    }

    const name =
      normalizeText(value);

    const sourceKey =
      `${slugify(
        worksheet.name
      )}:${column}:${slugify(name)}`;

    yachts.push({
      sourceKey,
      name,
      sourceSheet:
        worksheet.name,
      sourceRow: headerRow,
      sourceColumn: column,
      brochureUrl:
        extractBrochureUrl(
          worksheet,
          headerRow + 1,
          column
        ),
      metadata: {
        parserId: PARSER_ID,
        headerRow,
        brochureLabel:
          normalizeText(
            getMatrixValue(
              worksheet,
              headerRow + 1,
              column
            )
          ) || null,
      },
    });
  }

  return yachts;
}

function parsePrice(
  rawValue: SerializableCellValue,
  rawText: string
): {
  price: number | null;
  currency: string | null;
} {
  let currency: string | null =
    null;

  if (
    /€|\beur\b/i.test(rawText)
  ) {
    currency = "EUR";
  } else if (
    /\$|\busd\b/i.test(rawText)
  ) {
    currency = "USD";
  } else if (
    /£|\bgbp\b/i.test(rawText)
  ) {
    currency = "GBP";
  }

  if (
    typeof rawValue === "number" &&
    Number.isFinite(rawValue) &&
    rawValue > 0
  ) {
    return {
      price: rawValue,
      currency:
        currency ?? "EUR",
    };
  }

  const cleaned = rawText
    .replace(/[€$£]/g, "")
    .replace(
      /\b(EUR|USD|GBP)\b/gi,
      ""
    )
    .trim();

  if (
    !/^\d[\d\s.,]*$/.test(
      cleaned
    )
  ) {
    return {
      price: null,
      currency,
    };
  }

  const numericText =
    cleaned.replace(
      /[\s.,]/g,
      ""
    );

  if (!numericText) {
    return {
      price: null,
      currency,
    };
  }

  const numericValue =
    Number(numericText);

  if (
    !Number.isFinite(
      numericValue
    ) ||
    numericValue <= 0
  ) {
    return {
      price: null,
      currency,
    };
  }

  return {
    price: numericValue,
    currency:
      currency ?? "EUR",
  };
}

function extractBookingCode(
  text: string
): string | null {
  const match = text.match(
    /\b([A-ZČĆŽŠĐ]{2,8})\s*-\s*([A-ZČĆŽŠĐ]{2,8})\b/
  );

  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}`;
}

function classifyValue({
  rawValue,
  worksheet,
  row,
  column,
}: {
  rawValue: SerializableCellValue;
  worksheet: ParsedWorksheet;
  row: number;
  column: number;
}): ClassifiedValue {
  const rawText = normalizeText(rawValue);

  const availabilityColorDetected =
    hasAvailabilityFill(
      worksheet,
      row,
      column
    );

  const bookingCode =
    extractRouteCode(rawText);

  const route = decodeRoute(bookingCode);

  const common = {
    bookingCode,
    embarkationPort:
      route.embarkationPort,
    disembarkationPort:
      route.disembarkationPort,
    availabilityColorDetected,
  };

  if (
    OUT_OF_SERVICE_PATTERNS.some(
      (pattern) => pattern.test(rawText)
    )
  ) {
    return {
      status: "out_of_service",
      price: null,
      currency: null,
      notes: rawText || null,
      ...common,
    };
  }

  if (
    UNAVAILABLE_PATTERNS.some(
      (pattern) => pattern.test(rawText)
    )
  ) {
    return {
      status: "unavailable",
      price: null,
      currency: null,
      notes: rawText || null,
      ...common,
    };
  }

  if (
    OPTION_PATTERNS.some(
      (pattern) => pattern.test(rawText)
    )
  ) {
    return {
      status: "option",
      price: null,
      currency: null,
      notes: rawText || null,
      ...common,
    };
  }

  if (
    RESERVED_PATTERNS.some(
      (pattern) => pattern.test(rawText)
    )
  ) {
    return {
      status: "reserved",
      price: null,
      currency: null,
      notes: rawText || null,
      ...common,
    };
  }

  const parsedPrice = parsePrice(
    rawValue,
    rawText
  );

  return {
    status: availabilityColorDetected
      ? "available"
      : "unavailable",
    price: parsedPrice.price,
    currency: parsedPrice.currency,
    notes: rawText || null,
    ...common,
  };
}

function findFirstAvailabilityRow(
  worksheet: ParsedWorksheet,
  headerRow: number,
  year: number
): number | null {
  for (
    let row = headerRow + 1;
    row <= worksheet.rowCount;
    row += 1
  ) {
    const range =
      findDateRange(
        worksheet,
        row,
        year
      );

    if (
      range.startDate &&
      range.endDate
    ) {
      return row;
    }
  }

  return null;
}

function emptyResult(
  detection: ParserDetection,
  warnings: string[],
  metadata: Record<
    string,
    unknown
  > = {}
): ParserResult {
  return {
    parserId: PARSER_ID,
    layout:
      "horizontal_yacht_calendar",
    confidence:
      detection.confidence,
    yachts: [],
    availability: [],
    warnings,
    metadata: {
      sheetName:
        detection.sheetName,
      detectedYear: null,
      yachtCount: 0,
      availabilityCount: 0,
      ...metadata,
    },
  };
}

function parseHorizontalCalendar(
  workbook: ParsedWorkbook,
  detection: ParserDetection
): ParserResult {
  const worksheet =
    findDetectedSheet(
      workbook,
      detection
    );

  if (!worksheet) {
    return emptyResult(
      detection,
      [
        "The detected worksheet could not be found.",
      ]
    );
  }

  const headerRow =
    findHeaderRow(worksheet);

  if (!headerRow) {
    return emptyResult(
      detection,
      [
        "The yacht header row could not be detected.",
      ],
      {
        sheetName:
          worksheet.name,
      }
    );
  }

  const detectedYear =
    findCalendarYear(
      worksheet,
      headerRow
    );

  if (!detectedYear) {
    return emptyResult(
      detection,
      [
        "The calendar year could not be detected.",
      ],
      {
        sheetName:
          worksheet.name,
        headerRow,
      }
    );
  }

  const yachts =
    extractYachts(
      worksheet,
      headerRow
    );

  if (yachts.length === 0) {
    return emptyResult(
      detection,
      [
        "No yacht names were found in the detected header row.",
      ],
      {
        sheetName:
          worksheet.name,
        detectedYear,
        headerRow,
      }
    );
  }

  const firstAvailabilityRow =
    findFirstAvailabilityRow(
      worksheet,
      headerRow,
      detectedYear
    );

  if (!firstAvailabilityRow) {
    return {
      parserId: PARSER_ID,
      layout:
        "horizontal_yacht_calendar",
      confidence:
        detection.confidence,
      yachts,
      availability: [],
      warnings: [
        "No weekly availability rows were found below the yacht header.",
      ],
      metadata: {
        sheetName:
          worksheet.name,
        detectedYear,
        yachtCount:
          yachts.length,
        availabilityCount: 0,
        headerRow,
      },
    };
  }

  const availability:
    NormalizedAvailability[] = [];

  let rowsWithoutDates = 0;

  for (
    let row =
      firstAvailabilityRow;
    row <= worksheet.rowCount;
    row += 1
  ) {
    const dateRange =
      findDateRange(
        worksheet,
        row,
        detectedYear
      );

    if (
      !dateRange.startDate ||
      !dateRange.endDate
    ) {
      rowsWithoutDates += 1;

      if (
        rowsWithoutDates >= 8
      ) {
        break;
      }

      continue;
    }

    rowsWithoutDates = 0;

    for (const yacht of yachts) {
      if (
        yacht.sourceColumn ===
        null
      ) {
        continue;
      }

      const rawValue =
        getMatrixValue(
          worksheet,
          row,
          yacht.sourceColumn
        );

      const classified =
        classifyValue({
          rawValue,
          worksheet,
          row,
          column: yacht.sourceColumn,
        });

      const sourceCell =
        getCellAddress(
          row,
          yacht.sourceColumn
        );

      const sourceKey =
        [
          yacht.sourceKey,
          dateRange.startDate,
          dateRange.endDate,
          sourceCell,
        ].join(":");

      availability.push({
        sourceKey,
        yachtSourceKey:
          yacht.sourceKey,
        yachtName:
          yacht.name,

        startDate:
          dateRange.startDate,
        endDate:
          dateRange.endDate,

        status:
          classified.status,

        price:
          classified.price,
        currency:
          classified.currency,

        rawValue,

        sourceSheet:
          worksheet.name,
        sourceCell,
        sourceRow: row,
        sourceColumn:
          yacht.sourceColumn,

        notes:
          classified.notes,

        metadata: {
          parserId: PARSER_ID,
          bookingCode:
            classified.bookingCode,
          routeCode:
            classified.bookingCode,
          embarkationPort:
            classified.embarkationPort,
          disembarkationPort:
            classified.disembarkationPort,
          location:
            classified.embarkationPort,
          region: "Croatia",
          availabilityColorDetected:
            classified.availabilityColorDetected,
          rawText:
            normalizeText(
              rawValue
            ) || null,
          headerRow,
        },
      });
    }
  }

  const statusCounts =
    availability.reduce<
      Record<string, number>
    >(
      (counts, item) => {
        counts[item.status] =
          (counts[
            item.status
          ] ?? 0) + 1;

        return counts;
      },
      {}
    );

  return {
    parserId: PARSER_ID,
    layout:
      "horizontal_yacht_calendar",
    confidence:
      detection.confidence,

    yachts,
    availability,

    warnings:
      availability.length === 0
        ? [
            "The parser found yachts but produced no availability records.",
          ]
        : [],

    metadata: {
      sheetName:
        worksheet.name,
      detectedYear,
      yachtCount:
        yachts.length,
      availabilityCount:
        availability.length,
      headerRow,
      firstAvailabilityRow,
      statusCounts,
    },
  };
}

export const horizontalYachtCalendarParser:
  WorkbookParser = {
  id: PARSER_ID,

  layout:
    "horizontal_yacht_calendar",

  detect(
    workbook: ParsedWorkbook
  ): ParserDetection {
    return detectWorkbookLayout(
      workbook
    );
  },

  parse(
    workbook: ParsedWorkbook,
    detection: ParserDetection
  ): ParserResult {
    return parseHorizontalCalendar(
      workbook,
      detection
    );
  },
};