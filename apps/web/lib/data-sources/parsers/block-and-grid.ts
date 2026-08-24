import type { ParsedWorkbook, ParsedWorksheet } from "../source-types";

import type {
  AvailabilityStatus,
  NormalizedAvailability,
  NormalizedYacht,
  ParserDetection,
  ParserResult,
  WorkbookParser,
} from "./types";

/**
 * Two layouts the existing parsers do not cover, handled together because
 * they share the same underlying problem: the yacht name is not in a column
 * on every row.
 *
 * BLOCK LAYOUT — how management companies write
 *
 *     M/Y SOLARIS — 38m · 10 guests
 *     Charter week            Status      Base port   Rate
 *     2026-06-06 to 2026-06-13  available   Athens     78000
 *     2026-06-13 to 2026-06-20  available   Athens     78000
 *
 * The yacht is named once as a heading and every row beneath belongs to it.
 * A flat-table parser sees no yacht column and gives up.
 *
 * GRID LAYOUT — how partner networks share availability
 *
 *     Yacht              06-06  06-13  06-20  06-27
 *     M/Y Ocean Pearl      A      A      B      O
 *     M/Y Neptune          A      B      A      A
 *
 * Dates run across the top, single-letter codes fill the body. A booking
 * table parser sees one date column and no start or end pair.
 *
 * Both are common enough that a charter platform that cannot read them is
 * missing a large share of real supplier files.
 */

const PARSER_ID = "block-and-grid-v1";

const STATUS_WORDS: Record<string, AvailabilityStatus> = {
  available: "available",
  avail: "available",
  free: "available",
  open: "available",
  a: "available",
  booked: "booked",
  b: "booked",
  chartered: "booked",
  taken: "booked",
  sold: "booked",
  option: "option",
  optioned: "option",
  o: "option",
  hold: "option",
  held: "option",
  provisional: "option",
  reserved: "reserved",
  r: "reserved",
  unavailable: "unavailable",
  x: "unavailable",
  n: "unavailable",
  closed: "unavailable",
  refit: "out_of_service",
  maintenance: "out_of_service",
  yard: "out_of_service",
};

const YACHT_PREFIX = /\b(m\/y|s\/y|m\/s|sy|my)\b/i;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DATE_RANGE = /(\d{4}-\d{2}-\d{2})\s*(?:to|–|-|—|until)\s*(\d{4}-\d{2}-\d{2})/i;
const SHORT_DATE = /^(\d{1,2})[-/.](\d{1,2})$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function toStatus(value: string): AvailabilityStatus | null {
  const key = value.trim().toLowerCase().replace(/[^a-z]/g, "");
  return key ? STATUS_WORDS[key] ?? null : null;
}

function looksLikeYachtHeading(value: string): boolean {
  if (!value || value.length > 90) return false;
  if (!YACHT_PREFIX.test(value)) return false;
  // A heading names a yacht; a data row also carries a date.
  return !ISO_DATE.test(value);
}

function yachtNameFrom(value: string): string {
  // "M/Y SOLARIS — 38m · 10 guests · 5 cabins" -> "M/Y Solaris"
  const head = value.split(/[—·|,(]/)[0].trim();
  const match = head.match(/((?:m\/y|s\/y|m\/s|sy|my)\s+[A-Za-zÀ-ÿ'’\- ]+)/i);
  const raw = (match ? match[1] : head).trim();

  return raw
    .split(/\s+/)
    .map((word, index) =>
      index === 0
        ? word.toUpperCase().replace("MY", "M/Y").replace("SY", "S/Y")
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
}

function sourceKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * A weekly rate, or null.
 *
 * Two guards, both learned the hard way. An earlier version stripped every
 * non-digit from the cell, so "2026-07-25 to 2026-08-01" became the number
 * 2026072520260801 and the insert died with a numeric field overflow.
 *
 *   1. A cell containing a date is never a price.
 *   2. The result must be within a plausible charter rate. No week costs
 *      a billion euros, and nothing real costs less than a hundred.
 */
const MIN_WEEKLY_RATE = 100;
const MAX_WEEKLY_RATE = 100_000_000;

function priceFrom(value: string): number | null {
  if (ISO_DATE.test(value) || /\d{4}-\d{2}/.test(value)) {
    return null;
  }

  // Thousands separators only; a stray hyphen or slash means it is not a
  // plain number.
  const cleaned = value.replace(/[\s,'']/g, "");

  if (!/^[€$£]?\d+(?:\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }

  const n = Number(cleaned.replace(/^[€$£]/, ""));

  if (!Number.isFinite(n)) return null;

  return n >= MIN_WEEKLY_RATE && n <= MAX_WEEKLY_RATE ? n : null;
}

/** Expand "06-13" against a year seen elsewhere on the sheet. */
function expandShortDate(value: string, year: number): string | null {
  const m = value.trim().match(SHORT_DATE);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  // Month-day, which is how these grids are written.
  const month = a <= 12 ? a : b;
  const day = a <= 12 ? b : a;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function detectYear(sheet: ParsedWorksheet): number {
  for (const row of sheet.matrix) {
    for (const cell of row) {
      const m = text(cell).match(ISO_DATE);
      if (m) return Number(m[1]);
    }
  }
  for (const row of sheet.matrix) {
    for (const cell of row) {
      const m = text(cell).match(/\b(20\d{2})\b/);
      if (m) return Number(m[1]);
    }
  }
  return new Date().getUTCFullYear();
}

// ---------------------------------------------------------------- block
function parseBlocks(sheet: ParsedWorksheet) {
  const yachts: NormalizedYacht[] = [];
  const availability: NormalizedAvailability[] = [];

  let current: { name: string; key: string } | null = null;

  sheet.matrix.forEach((row, rowIndex) => {
    const cells = row.map((c) => text(c));
    const joined = cells.join(" ").trim();

    if (!joined) return;

    // A heading names a yacht and carries no dates.
    const headingCell = cells.find((c) => looksLikeYachtHeading(c));

    if (headingCell) {
      const name = yachtNameFrom(headingCell);
      const key = sourceKey(name);

      if (!yachts.some((y) => y.sourceKey === key)) {
        yachts.push({
          sourceKey: key,
          name,
          sourceSheet: sheet.name,
          sourceRow: rowIndex,
          sourceColumn: null,
          brochureUrl: null,
          metadata: { heading: headingCell },
        });
      }

      current = { name, key };
      return;
    }

    if (!current) return;

    // A data row under a heading: needs a date range and a status.
    const range = joined.match(DATE_RANGE);
    if (!range) return;

    const status = cells.map((c) => toStatus(c)).find((s): s is AvailabilityStatus => s !== null);
    if (!status) return;

    const price = cells.map((c) => priceFrom(c)).find((p): p is number => p !== null) ?? null;

    availability.push({
      sourceKey: `${current.key}:${range[1]}`,
      yachtSourceKey: current.key,
      yachtName: current.name,
      startDate: range[1],
      endDate: range[2],
      status,
      price,
      currency: null,
      rawValue: joined,
      sourceSheet: sheet.name,
      sourceCell: null,
      sourceRow: rowIndex,
      sourceColumn: null,
      notes: null,
      metadata: { layout: "block" },
    });
  });

  return { yachts, availability };
}

// ----------------------------------------------------------------- grid
function parseGrid(sheet: ParsedWorksheet, year: number) {
  const yachts: NormalizedYacht[] = [];
  const availability: NormalizedAvailability[] = [];

  // Find the header row: the one with the most date-like cells.
  let headerRow = -1;
  let dateColumns: { column: number; start: string }[] = [];

  sheet.matrix.forEach((row, rowIndex) => {
    const found: { column: number; start: string }[] = [];

    row.forEach((cell, columnIndex) => {
      const value = text(cell);
      const iso = value.match(ISO_DATE)?.[0] ?? expandShortDate(value, year);
      if (iso) found.push({ column: columnIndex, start: iso });
    });

    if (found.length > dateColumns.length && found.length >= 3) {
      headerRow = rowIndex;
      dateColumns = found;
    }
  });

  if (headerRow === -1) return { yachts, availability };

  for (let rowIndex = headerRow + 1; rowIndex < sheet.matrix.length; rowIndex += 1) {
    const row = sheet.matrix[rowIndex] ?? [];
    const label = row.map((c) => text(c)).find((c) => looksLikeYachtHeading(c));

    if (!label) continue;

    const name = yachtNameFrom(label);
    const key = sourceKey(name);

    if (!yachts.some((y) => y.sourceKey === key)) {
      yachts.push({
        sourceKey: key,
        name,
        sourceSheet: sheet.name,
        sourceRow: rowIndex,
        sourceColumn: null,
        brochureUrl: null,
        metadata: { layout: "grid" },
      });
    }

    for (const column of dateColumns) {
      const status = toStatus(text(row[column.column]));
      if (!status) continue;

      availability.push({
        sourceKey: `${key}:${column.start}`,
        yachtSourceKey: key,
        yachtName: name,
        startDate: column.start,
        // Week columns: a charter week runs to the next Saturday.
        endDate: addDays(column.start, 7),
        status,
        price: null,
        currency: null,
        rawValue: text(row[column.column]),
        sourceSheet: sheet.name,
        sourceCell: null,
        sourceRow: rowIndex,
        sourceColumn: column.column,
        notes: null,
        metadata: { layout: "grid" },
      });
    }
  }

  return { yachts, availability };
}

// ---------------------------------------------------------------- parser
function analyse(workbook: ParsedWorkbook) {
  let best: {
    sheet: ParsedWorksheet;
    yachts: NormalizedYacht[];
    availability: NormalizedAvailability[];
    mode: "block" | "grid";
  } | null = null;

  for (const sheet of workbook.sheets) {
    const year = detectYear(sheet);

    for (const [mode, result] of [
      ["block", parseBlocks(sheet)] as const,
      ["grid", parseGrid(sheet, year)] as const,
    ]) {
      if (result.availability.length === 0) continue;

      if (!best || result.availability.length > best.availability.length) {
        best = { sheet, mode, ...result };
      }
    }
  }

  return best;
}

export const blockAndGridParser: WorkbookParser = {
  id: PARSER_ID,
  layout: "generic_table",

  detect(workbook: ParsedWorkbook): ParserDetection {
    const best = analyse(workbook);

    if (!best) {
      return {
        layout: "unknown",
        confidence: 0,
        parserId: PARSER_ID,
        reasons: ["no per-yacht blocks or date grid found"],
        sheetName: null,
      };
    }

    return {
      layout: "generic_table",
      // Scaled by how much was recovered, capped so a better-matched parser
      // can still win the detector's ranking.
      confidence: Math.min(0.8, 0.4 + best.availability.length * 0.02),
      parserId: PARSER_ID,
      reasons: [
        `${best.mode} layout`,
        `${best.yachts.length} yachts`,
        `${best.availability.length} availability rows`,
      ],
      sheetName: best.sheet.name,
    };
  },

  parse(workbook: ParsedWorkbook, detection: ParserDetection): ParserResult {
    const best = analyse(workbook);

    if (!best) {
      throw new Error(
        "No per-yacht blocks or date grid could be read from this workbook."
      );
    }

    return {
      parserId: PARSER_ID,
      layout: "generic_table",
      confidence: detection.confidence,
      yachts: best.yachts,
      availability: best.availability,
      warnings: [],
      metadata: {
        sheetName: best.sheet.name,
        detectedYear: detectYear(best.sheet),
        yachtCount: best.yachts.length,
        availabilityCount: best.availability.length,
        mode: best.mode,
      },
    };
  },
};