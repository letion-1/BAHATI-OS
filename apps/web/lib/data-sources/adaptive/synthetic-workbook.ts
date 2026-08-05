import type {
  ParsedWorkbook,
  ParsedWorksheet,
  SerializableCellValue,
  WorkbookCell,
} from "../source-types";

import type {
  AdaptiveExtraction,
} from "./types";

const HEADERS = [
  "Yacht",
  "Start",
  "End",
  "Status",
  "Price",
  "Currency",
  "Location",
  "Region",
  "Embarkation Port",
  "Disembarkation Port",
  "Notes",
  "Evidence",
  "Confidence",
] as const;

export function adaptiveExtractionToWorkbook({
  extraction,
  sourceUrl,
}: {
  extraction:
    AdaptiveExtraction;

  sourceUrl:
    string;
}): ParsedWorkbook {
  const matrix:
    SerializableCellValue[][] = [
      [
        ...HEADERS,
      ],

      ...extraction.availability.map(
        (
          window
        ) => [
          window.yachtName,
          window.startDate,
          window.endDate,
          window.status,
          window.price,
          window.currency,
          window.location,
          window.region,
          window.embarkationPort,
          window.disembarkationPort,
          window.notes,
          window.evidence,
          window.confidence,
        ]
      ),
    ];

  const worksheet =
    buildWorksheet(
      extraction.title?.trim() ||
        "Adaptive Website Extraction",

      matrix,

      {
        sourceUrl,

        strategy:
          extraction.strategy,

        confidence:
          extraction.confidence,

        legend:
          extraction.legend,

        warnings:
          extraction.warnings,
      }
    );

  return {
    kind:
      "workbook",

    sheetCount:
      1,

    rowCount:
      worksheet.rowCount,

    sheetNames: [
      worksheet.name,
    ],

    sheets: [
      worksheet,
    ],
  };
}

function buildWorksheet(
  name: string,
  matrix:
    SerializableCellValue[][],
  metadata:
    Record<
      string,
      unknown
    >
): ParsedWorksheet {
  const rowCount =
    matrix.length;

  const columnCount =
    Math.max(
      0,
      ...matrix.map(
        (
          row
        ) =>
          row.length
      )
    );

  const cells:
    WorkbookCell[] = [];

  matrix.forEach(
    (
      row,
      rowIndex
    ) => {
      row.forEach(
        (
          value,
          columnIndex
        ) => {
          if (
            value === null ||
            value === undefined ||
            value === ""
          ) {
            return;
          }

          cells.push({
            address:
              encodeCellAddress(
                rowIndex +
                  1,

                columnIndex +
                  1
              ),

            row:
              rowIndex +
              1,

            column:
              columnIndex +
              1,

            value,

            formattedValue:
              String(
                value
              ),

            type:
              typeof value ===
                "number"
                ? "n"
                : typeof value ===
                    "boolean"
                  ? "b"
                  : "s",
          });
        }
      );
    }
  );

  const records =
    matrix
      .slice(
        1
      )
      .map(
        (
          row
        ) =>
          Object.fromEntries(
            HEADERS.map(
              (
                header,
                index
              ) => [
                header,

                row[
                  index
                ] ??
                  null,
              ]
            )
          )
      );

  return {
    name:
      name.slice(
        0,
        80
      ),

    range:
      rowCount >
        0 &&
      columnCount >
        0
        ? `A1:${encodeCellAddress(
            rowCount,
            columnCount
          )}`
        : null,

    rowCount,

    columnCount,

    matrix,

    cells,

    merges:
      [],

    records:
      records.map(
        (
          record
        ) => ({
          ...record,

          __adaptive_metadata:
            JSON.stringify(
              metadata
            ),
        })
      ),
  };
}

function encodeCellAddress(
  row: number,
  column: number
): string {
  return `${columnToLetters(
    column
  )}${row}`;
}

function columnToLetters(
  column: number
): string {
  let result =
    "";

  let current =
    column;

  while (
    current >
    0
  ) {
    const remainder =
      (
        current -
        1
      ) %
      26;

    result =
      String.fromCharCode(
        65 +
          remainder
      ) +
      result;

    current =
      Math.floor(
        (
          current -
          1
        ) /
          26
      );
  }

  return result ||
    "A";
}