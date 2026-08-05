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

  if (!parser) {
    throw new Error(
      `Unsupported workbook layout "${detection.layout}" ` +
        `with parser ID "${detection.parserId}".`
    );
  }

  const compatibleDetection:
    ParserDetection = {
      ...detection,

      /*
       * Use the selected parser's current ID so the parser result,
       * activity log and stored metadata remain internally consistent.
       */
      parserId:
        parser.id,
  };

  const result =
    parser.parse(
      workbook,
      compatibleDetection
    );

  if (
    result.yachts.length ===
      0 &&
    result.availability.length ===
      0
  ) {
    const warnings =
      result.warnings.length >
      0
        ? ` ${result.warnings.join(
            " "
          )}`
        : "";

    throw new Error(
      `Parser "${result.parserId}" produced no yachts or ` +
        `availability records.${warnings}`
    );
  }

  return result;
}

export function detectYachtWorkbook(
  workbook:
    ParsedWorkbook
): ParserDetection {
  return detectWorkbookLayout(
    workbook
  );
}