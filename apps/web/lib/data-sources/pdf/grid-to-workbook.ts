import "server-only";

import type {
  ParsedWorkbook,
  ParsedWorksheet,
  SerializableCellValue,
  WorkbookCell,
} from "../workbook-parser";

import type { ReconstructedGrid } from "./reconstruct-grid";

/**
 * Turn reconstructed PDF pages into a ParsedWorkbook.
 *
 * This is the whole reason the PDF connector is shaped this way. Once a PDF
 * is a workbook, every parser already written for spreadsheets works on it
 * unchanged: booking tables, horizontal calendars, monthly calendars, the
 * layout detector, all of it. No PDF-specific parsing logic is needed, and a
 * future improvement to any parser benefits PDFs for free.
 *
 * One page becomes one sheet, so a multi-page availability list keeps its
 * structure and the layout detector can pick the best page on its own.
 */

export function pdfGridsToWorkbook({
  grids,
  fileName,
}: {
  grids: ReconstructedGrid[];
  fileName: string | null;
}): ParsedWorkbook {
  const usable = grids.filter((grid) => grid.matrix.length > 0);

  const sheets: ParsedWorksheet[] = usable.map((grid) =>
    gridToWorksheet(grid, fileName)
  );

  return {
    kind: "workbook",
    sheetCount: sheets.length,
    rowCount: sheets.reduce((total, sheet) => total + sheet.rowCount, 0),
    sheetNames: sheets.map((sheet) => sheet.name),
    sheets,
  };
}

function gridToWorksheet(
  grid: ReconstructedGrid,
  fileName: string | null
): ParsedWorksheet {
  const matrix: SerializableCellValue[][] = grid.matrix.map((row) =>
    row.map((cell) => (cell === null ? null : cell))
  );

  const columnCount = matrix.reduce(
    (widest, row) => Math.max(widest, row.length),
    0
  );

  const cells: WorkbookCell[] = [];

  matrix.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (value === null || value === "") {
        return;
      }

      cells.push({
        address: toAddress(rowIndex, columnIndex),
        row: rowIndex,
        column: columnIndex,
        value,
        formattedValue: String(value),
        // A PDF carries no cell fill in its text layer, so colour-coded
        // calendars lose their colour here. Those pages score low on table
        // likeness and get routed to AI extraction instead, which reads the
        // page visually.
      });
    });
  });

  return {
    name: sheetName(grid, fileName),
    range:
      matrix.length > 0
        ? `A1:${toAddress(matrix.length - 1, Math.max(0, columnCount - 1))}`
        : null,
    rowCount: matrix.length,
    columnCount,
    matrix,
    cells,
    merges: [],
    records: buildRecords(matrix),
  };
}

/**
 * Mirror the record shape produced for real spreadsheets: first row as keys,
 * remaining rows as values. Parsers that read `records` rather than `matrix`
 * then behave identically on PDF input.
 */
function buildRecords(
  matrix: SerializableCellValue[][]
): Record<string, SerializableCellValue>[] {
  const [header, ...body] = matrix;

  if (!header) {
    return [];
  }

  return body.map((row) => {
    const record: Record<string, SerializableCellValue> = {};

    header.forEach((key, index) => {
      if (typeof key === "string" && key.trim()) {
        record[key.trim()] = row[index] ?? null;
      }
    });

    return record;
  });
}

function sheetName(
  grid: ReconstructedGrid,
  fileName: string | null
): string {
  const base = fileName?.replace(/\.pdf$/i, "").trim();

  return base
    ? `${base} (page ${grid.pageNumber})`
    : `Page ${grid.pageNumber}`;
}

function toAddress(row: number, column: number): string {
  let remaining = column;
  let letters = "";

  while (remaining >= 0) {
    letters = String.fromCharCode((remaining % 26) + 65) + letters;
    remaining = Math.floor(remaining / 26) - 1;
  }

  return `${letters}${row + 1}`;
}