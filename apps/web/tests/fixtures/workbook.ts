import type {
  ParsedWorkbook,
  ParsedWorksheet,
  SerializableCellValue,
  WorkbookCell,
  WorkbookCellFill,
} from "@/lib/data-sources/workbook-parser";

/**
 * Fixture builders that construct ParsedWorkbook objects directly, without
 * going through XLSX.
 *
 * The point is to test the parsers, not SheetJS. Building the intermediate
 * shape by hand means a test can express "this cell is filled green" or "this
 * row is a merged header" precisely, which is exactly the kind of detail that
 * real supplier spreadsheets vary on and that regressions hide in.
 */

export function cellAddress(row: number, column: number): string {
  let remaining = column;
  let letters = "";

  while (remaining >= 0) {
    letters = String.fromCharCode((remaining % 26) + 65) + letters;
    remaining = Math.floor(remaining / 26) - 1;
  }

  return `${letters}${row + 1}`;
}

export function makeSheet(
  name: string,
  matrix: SerializableCellValue[][],
  options: {
    /** Fills keyed by "row,column", zero-indexed. */
    fills?: Record<string, WorkbookCellFill>;
    merges?: { start: string; end: string }[];
  } = {}
): ParsedWorksheet {
  const rowCount = matrix.length;
  const columnCount = matrix.reduce(
    (widest, row) => Math.max(widest, row.length),
    0
  );

  const cells: WorkbookCell[] = [];

  matrix.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (value === null || value === "") {
        // Still emit the cell when it carries a fill: an empty green cell is
        // meaningful in a yacht calendar, and dropping it loses the signal.
        if (!options.fills?.[`${rowIndex},${columnIndex}`]) {
          return;
        }
      }

      cells.push({
        address: cellAddress(rowIndex, columnIndex),
        row: rowIndex,
        column: columnIndex,
        value,
        formattedValue: value === null ? undefined : String(value),
        fill: options.fills?.[`${rowIndex},${columnIndex}`],
      });
    });
  });

  const [header = [], ...body] = matrix;

  const records = body.map((row) => {
    const record: Record<string, SerializableCellValue> = {};

    header.forEach((key, index) => {
      if (typeof key === "string" && key.trim()) {
        record[key] = row[index] ?? null;
      }
    });

    return record;
  });

  return {
    name,
    range: `A1:${cellAddress(Math.max(0, rowCount - 1), Math.max(0, columnCount - 1))}`,
    rowCount,
    columnCount,
    matrix,
    cells,
    merges: options.merges ?? [],
    records,
  };
}

export function makeWorkbook(sheets: ParsedWorksheet[]): ParsedWorkbook {
  return {
    kind: "workbook",
    sheetCount: sheets.length,
    rowCount: sheets.reduce((total, sheet) => total + sheet.rowCount, 0),
    sheetNames: sheets.map((sheet) => sheet.name),
    sheets,
  };
}

/** Fill colours seen in real supplier calendars. */
export const FILL = {
  green: { patternType: "solid", foregroundColor: "FF00B050" },
  red: { patternType: "solid", foregroundColor: "FFFF0000" },
  amber: { patternType: "solid", foregroundColor: "FFFFC000" },
  grey: { patternType: "solid", foregroundColor: "FFBFBFBF" },
  white: { patternType: "solid", foregroundColor: "FFFFFFFF" },
} satisfies Record<string, WorkbookCellFill>;