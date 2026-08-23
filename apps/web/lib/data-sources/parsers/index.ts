import type {
  ParsedWorkbook,
} from "../source-types";

import {
  bookingTableParser,
} from "./booking-table";
import {
  detectWorkbookLayout,
} from "./detect-layout";
import {
  genericYachtTableParser,
} from "./generic-yacht-table";
import {
  horizontalYachtCalendarParser,
} from "./horizontal-yacht-calendar";
import {
  monthlyCalendarParser,
} from "./monthly-calendar";
import {
  singleYachtWeeklyCalendarParser,
} from "./single-yacht-weekly-calendar";

import type {
  ParserDetection,
  ParserResult,
  WorkbookParser,
} from "./types";

export type {
  AvailabilityStatus,
  NormalizedAvailability,
  NormalizedYacht,
  ParserDetection,
  ParserLayout,
  ParserResult,
  WorkbookParser,
  WorksheetAnalysis,
} from "./types";
import { sanitizeParsedValue } from "@/lib/security/sanitize-parsed";

const parsers:
  WorkbookParser[] = [
    singleYachtWeeklyCalendarParser,
    horizontalYachtCalendarParser,
    bookingTableParser,
    genericYachtTableParser,
    monthlyCalendarParser,
  ];

export function parseYachtWorkbook(
  workbook:
    ParsedWorkbook
): ParserResult {
  const detection =
    detectWorkbookLayout(
      workbook
    );

  /*
   * Prefer an exact parser ID and layout match.
   *
   * The layout fallback keeps parsing compatible when a parser
   * implementation is upgraded from v1 to v2 while detect-layout
   * still returns the older parser ID.
   */
  const parser =
    parsers.find(
      (
        candidate
      ) =>
        candidate.id ===
          detection.parserId &&
        candidate.layout ===
          detection.layout
    ) ??
    parsers.find(
      (
        candidate
      ) =>
        candidate.layout ===
        detection.layout
    );

  /*
   * Ordered list of parsers to attempt.
   *
   * The detector's choice goes first, then every other parser as a fallback.
   * Previously only the detected parser ran, and if it threw, the whole
   * import died. That is what happened with real operator files: the
   * detector committed to the single-yacht weekly calendar on a management
   * company's per-yacht block layout, that parser raised "found the yacht
   * title but no weekly date ranges", and the broker saw a raw internal
   * error instead of a working import or a clean fallback to AI extraction.
   *
   * A parser that cannot handle a workbook should step aside, not stop the
   * chain.
   */
  const candidates = parser
    ? [parser, ...parsers.filter((other) => other.id !== parser.id)]
    : [...parsers];

  const attempts: { parserId: string; reason: string }[] = [];

  for (const candidate of candidates) {
    const compatibleDetection: ParserDetection = {
      ...detection,

      /*
       * Use the attempted parser's own ID so the parser result, activity log
       * and stored metadata stay internally consistent.
       */
      parserId: candidate.id,
      layout: candidate.layout,
    };

    let attempt: ParserResult;

    try {
      attempt = sanitizeParsedValue(
        candidate.parse(workbook, compatibleDetection)
      );
    } catch (error) {
      attempts.push({
        parserId: candidate.id,
        reason:
          error instanceof Error ? error.message : "parser threw",
      });
      continue;
    }

    // A parser that returns nothing has not understood the file either.
    if (
      attempt.yachts.length === 0 &&
      attempt.availability.length === 0
    ) {
      attempts.push({
        parserId: candidate.id,
        reason: "no yachts or availability found",
      });
      continue;
    }

    return {
      ...attempt,
      warnings: [
        ...(attempt.warnings ?? []),
        ...attempts.map(
          (failed) => `${failed.parserId}: ${failed.reason}`
        ),
      ],
    };
  }

  /*
   * Nothing could read it. The message names what was tried, because "could
   * not parse" tells a broker nothing about whether to fix the file or send
   * it to AI extraction.
   */
  throw new Error(
    "No parser could read this file. " +
      `Tried ${attempts.length} layout${attempts.length === 1 ? "" : "s"}: ` +
      attempts.map((failed) => failed.parserId).join(", ") +
      ". If the availability is laid out as prose or a designed brochure, " +
      "use AI extraction instead."
  );
}

export function detectYachtWorkbook(
  workbook:
    ParsedWorkbook
): ParserDetection {
  return detectWorkbookLayout(
    workbook
  );
}