import "server-only";

import type { PdfPage, PdfTextItem } from "./extract-text";

/**
 * Reconstructing a table from a PDF.
 *
 * A PDF stores glyphs at coordinates. It has no rows, no columns, no cells.
 * A table only exists visually, in how the text happens to line up. So the
 * job here is the same one a person's eye does: group text that shares a
 * baseline into rows, find the vertical gutters that separate columns, and
 * drop each fragment into the cell it visually occupies.
 *
 * The output is a matrix, which is exactly what the existing yacht parsers
 * already consume. That is the point of this module: a PDF becomes a
 * workbook, and every parser written for spreadsheets works on it unchanged.
 */

export type ReconstructedGrid = {
  pageNumber: number;
  matrix: (string | null)[][];
  /** Left edge of each detected column, in PDF points. */
  columnPositions: number[];
  /**
   * 0 to 1. How table-like the page looked. Low values usually mean prose or
   * a designed brochure, where AI extraction will do better than parsing.
   */
  confidence: number;
};

/**
 * Two items belong to the same row if their baselines are within this many
 * points. Tight enough to keep adjacent table rows apart at typical 9 to 12
 * point body sizes, loose enough to absorb sub-pixel baseline drift.
 */
const ROW_TOLERANCE = 4;

/**
 * Two left-edges start the same column unless separated by at least this
 * much. Below roughly 10 points the gap is usually inter-word spacing rather
 * than a real gutter.
 */
const COLUMN_GAP = 12;

/** Slack when assigning an item to a column, for slightly ragged alignment. */
const COLUMN_SNAP = 6;

/** A grid needs at least this many rows before it is worth calling a table. */
const MIN_TABLE_ROWS = 3;

export function reconstructGrid(page: PdfPage): ReconstructedGrid {
  if (page.items.length === 0) {
    return {
      pageNumber: page.pageNumber,
      matrix: [],
      columnPositions: [],
      confidence: 0,
    };
  }

  const rows = groupIntoRows(page.items);
  const columnPositions = detectColumns(page.items);

  const matrix = rows.map((row) => {
    const cells: (string | null)[] = new Array(columnPositions.length).fill(
      null
    );

    // Sort left to right so fragments of the same cell concatenate in
    // reading order rather than extraction order.
    for (const item of [...row.items].sort((a, b) => a.x - b.x)) {
      const columnIndex = assignColumn(item, columnPositions);
      const existing = cells[columnIndex];

      cells[columnIndex] = existing
        ? `${existing} ${item.text}`
        : item.text;
    }

    return cells;
  });

  return {
    pageNumber: page.pageNumber,
    matrix,
    columnPositions,
    confidence: scoreTableLikeness(matrix, columnPositions.length),
  };
}

/**
 * Group items sharing a baseline. Sorted top-down, because PDF y-coordinates
 * increase upward while a reader expects the first row first.
 */
function groupIntoRows(
  items: PdfTextItem[]
): { y: number; items: PdfTextItem[] }[] {
  const rows: { y: number; items: PdfTextItem[] }[] = [];

  for (const item of [...items].sort((a, b) => b.y - a.y)) {
    const row = rows.find(
      (candidate) => Math.abs(candidate.y - item.y) <= ROW_TOLERANCE
    );

    if (row) {
      row.items.push(item);
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  return rows;
}

/**
 * Find column gutters from the distribution of left edges. Text in a table
 * column shares a left edge; prose does not, which is what makes this a
 * usable signal for telling the two apart.
 */
function detectColumns(items: PdfTextItem[]): number[] {
  const edges = [...new Set(items.map((item) => Math.round(item.x)))].sort(
    (a, b) => a - b
  );

  const columns: number[] = [];

  for (const edge of edges) {
    const previous = columns[columns.length - 1];

    if (previous === undefined || edge - previous > COLUMN_GAP) {
      columns.push(edge);
    }
  }

  return columns;
}

function assignColumn(item: PdfTextItem, columns: number[]): number {
  let index = 0;

  for (let i = 0; i < columns.length; i += 1) {
    if (item.x >= columns[i] - COLUMN_SNAP) {
      index = i;
    }
  }

  return index;
}

/**
 * How much does this page look like a table rather than prose?
 *
 * Two signals, both cheap and both robust:
 *   fill      - what fraction of grid positions actually hold text. A real
 *               table is dense; prose scattered across detected columns is
 *               sparse.
 *   regularity- how consistently rows use the same number of columns. Table
 *               rows agree with each other. Paragraph lines do not.
 */
function scoreTableLikeness(
  matrix: (string | null)[][],
  columnCount: number
): number {
  if (matrix.length < MIN_TABLE_ROWS || columnCount < 2) {
    return 0;
  }

  const total = matrix.length * columnCount;
  const filled = matrix.reduce(
    (count, row) => count + row.filter((cell) => cell !== null).length,
    0
  );
  const fill = filled / total;

  const widths = matrix.map(
    (row) => row.filter((cell) => cell !== null).length
  );
  const mean = widths.reduce((sum, w) => sum + w, 0) / widths.length;

  if (mean === 0) {
    return 0;
  }

  const variance =
    widths.reduce((sum, w) => sum + (w - mean) ** 2, 0) / widths.length;

  // Coefficient of variation, inverted, so consistent rows score high.
  const regularity = 1 / (1 + Math.sqrt(variance) / mean);

  return Math.min(1, fill * 0.5 + regularity * 0.5);
}