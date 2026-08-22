import * as cheerio from "cheerio";
// Element is cheerio's underlying DOM node type, re-exported by domhandler.
// Using it instead of `any` keeps .attr()/.children() type-checked.
import type { Element } from "domhandler";

import {
  adaptiveExtractionToWorkbook,
  collectPageSignals,
  extractAvailabilityWithAI,
  renderWebsiteHtml,
} from "../adaptive";

import type {
  ParsedWorkbook,
  ParsedWorksheet,
  SerializableCellValue,
  WorkbookCell,
  WorkbookCellFill,
  WorkbookConnectorResult,
  WorkbookMerge,
} from "../source-types";

const MAX_TABLES = 30;
const MAX_ROWS_PER_TABLE = 2_000;
const MAX_COLUMNS_PER_TABLE = 200;

export async function fetchWebsiteSource(
  sourceUrl: string
): Promise<WorkbookConnectorResult> {
  const staticResponse = await fetch(sourceUrl, {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; BahariOS/1.0 (+https://bahari-os.com))",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9",
    },
  });

  if (!staticResponse.ok) {
    throw new Error(
      `Website request failed with status ${staticResponse.status}.`
    );
  }

  const contentType =
    staticResponse.headers.get("content-type") ?? "";

  if (!contentType.includes("text/html")) {
    throw new Error(
      `Expected an HTML webpage but received "${contentType}".`
    );
  }

  const finalUrl = staticResponse.url || sourceUrl;
  const staticHtml = await staticResponse.text();
  const staticPage = cheerio.load(staticHtml);
  const staticSheets = parseWebsiteTables(staticPage);

  if (staticSheets.length > 0) {
    return createWorkbookResult({
      sheets: staticSheets,
      sourceUrl: finalUrl,
      pageTitle:
        getPageTitle(staticPage) ?? getFileNameFromUrl(finalUrl),
    });
  }

  let renderedHtml: string | null = null;

  try {
    renderedHtml = await renderWebsiteHtml(finalUrl);
  } catch (renderError) {
    console.warn(
      `Rendered website fallback failed for ${finalUrl}:`,
      renderError
    );
  }

  if (renderedHtml) {
    const renderedPage = cheerio.load(renderedHtml);
    const renderedSheets = parseWebsiteTables(renderedPage);

    if (renderedSheets.length > 0) {
      return createWorkbookResult({
        sheets: renderedSheets,
        sourceUrl: finalUrl,
        pageTitle:
          getPageTitle(renderedPage) ?? getFileNameFromUrl(finalUrl),
      });
    }
  }

  return fetchAdaptiveWebsiteSource(finalUrl, {
    staticHtml,
    renderedHtml,
  });
}

export async function fetchAdaptiveWebsiteSource(
  sourceUrl: string,
  existing?: {
    staticHtml?: string | null;
    renderedHtml?: string | null;
  }
): Promise<WorkbookConnectorResult> {
  let staticHtml = existing?.staticHtml ?? null;
  let renderedHtml = existing?.renderedHtml ?? null;
  let finalUrl = sourceUrl;

  if (!staticHtml) {
    const response = await fetch(sourceUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; BahariOS/1.0 (+https://bahari-os.com))",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Website request failed with status ${response.status}.`
      );
    }

    finalUrl = response.url || sourceUrl;
    staticHtml = await response.text();
  }

  if (!renderedHtml) {
    try {
      renderedHtml = await renderWebsiteHtml(finalUrl);
    } catch (renderError) {
      console.warn(
        `Rendered website fallback failed for ${finalUrl}:`,
        renderError
      );
    }
  }

  const extractionHtml = renderedHtml ?? staticHtml;
  const signals = collectPageSignals({
    html: extractionHtml,
    url: finalUrl,
  });

  try {
    const extraction = await extractAvailabilityWithAI(signals);
    const workbook = adaptiveExtractionToWorkbook({
      extraction,
      sourceUrl: finalUrl,
    });

    return {
      kind: "workbook",
      sourceType: "website",
      fileName:
        extraction.title ??
        signals.title ??
        getFileNameFromUrl(finalUrl),
      workbook,
    };
  } catch (adaptiveError) {
    const message =
      adaptiveError instanceof Error
        ? adaptiveError.message
        : "Adaptive website extraction failed.";

    throw new Error(
      "No supported deterministic website structure was found, and the " +
        `adaptive AI extractor could not normalize the page. ${message}`
    );
  }
}

function createWorkbookResult({
  sheets,
  sourceUrl,
  pageTitle,
}: {
  sheets: ParsedWorksheet[];
  sourceUrl: string;
  pageTitle: string;
}): WorkbookConnectorResult {
  const workbook: ParsedWorkbook = {
    kind: "workbook",
    sheetCount: sheets.length,
    rowCount: sheets.reduce(
      (total, sheet) => total + sheet.rowCount,
      0
    ),
    sheetNames: sheets.map((sheet) => sheet.name),
    sheets,
  };

  return {
    kind: "workbook",
    sourceType: "website",
    fileName: pageTitle || getFileNameFromUrl(sourceUrl),
    workbook,
  };
}

function parseWebsiteTables(
  $: cheerio.CheerioAPI
): ParsedWorksheet[] {
  const sheets: ParsedWorksheet[] = [];

  $("table")
    .slice(0, MAX_TABLES)
    .each((tableIndex, tableElement) => {
      const parsed = parseTable(
        $,
        $(tableElement),
        tableIndex
      );

      if (parsed.rowCount > 0 && parsed.columnCount > 0) {
        sheets.push(parsed);
      }
    });

  return sheets;
}

function parseTable(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<Element>,
  tableIndex: number
): ParsedWorksheet {
  const matrix: SerializableCellValue[][] = [];
  const cells: WorkbookCell[] = [];
  const merges: WorkbookMerge[] = [];
  const occupied = new Map<string, SerializableCellValue>();

  table
    .find("tr")
    .slice(0, MAX_ROWS_PER_TABLE)
    .each((rowIndex, rowElement) => {
      const rowNumber = rowIndex + 1;
      matrix[rowIndex] ??= [];
      let columnIndex = 0;

      $(rowElement)
        .children("th, td")
        .each((_, cellElement) => {
          while (
            occupied.has(`${rowNumber}:${columnIndex + 1}`)
          ) {
            matrix[rowIndex][columnIndex] =
              occupied.get(`${rowNumber}:${columnIndex + 1}`) ?? null;
            columnIndex += 1;
          }

          if (columnIndex >= MAX_COLUMNS_PER_TABLE) {
            return false;
          }

          const cell = $(cellElement);
          const value = extractCellValue(cell);
          const rowSpan = normalizeSpan(cell.attr("rowspan"));
          const columnSpan = normalizeSpan(cell.attr("colspan"));
          const fill = extractHtmlFill(cell);
          const startAddress = encodeCellAddress(
            rowNumber,
            columnIndex + 1
          );

          matrix[rowIndex][columnIndex] = value;

          cells.push({
            address: startAddress,
            row: rowNumber,
            column: columnIndex + 1,
            value,
            formattedValue:
              typeof value === "string" ? value : undefined,
            type:
              typeof value === "number"
                ? "n"
                : typeof value === "boolean"
                  ? "b"
                  : "s",
            fill,
          });

          if (rowSpan > 1 || columnSpan > 1) {
            merges.push({
              start: startAddress,
              end: encodeCellAddress(
                rowNumber + rowSpan - 1,
                columnIndex + columnSpan
              ),
            });
          }

          for (let r = 0; r < rowSpan; r += 1) {
            for (let c = 0; c < columnSpan; c += 1) {
              if (r === 0 && c === 0) continue;

              occupied.set(
                `${rowNumber + r}:${columnIndex + c + 1}`,
                value
              );
            }
          }

          columnIndex += columnSpan;
        });
    });

  const rowCount = Math.max(
    matrix.length,
    ...Array.from(occupied.keys()).map((key) =>
      Number(key.split(":")[0])
    ),
    0
  );

  const columnCount = Math.min(
    Math.max(
      0,
      ...matrix.map((row) => row.length),
      ...Array.from(occupied.keys()).map((key) =>
        Number(key.split(":")[1])
      )
    ),
    MAX_COLUMNS_PER_TABLE
  );

  for (let r = 0; r < rowCount; r += 1) {
    matrix[r] ??= [];

    for (let c = 0; c < columnCount; c += 1) {
      if (matrix[r][c] !== undefined) continue;
      matrix[r][c] = occupied.get(`${r + 1}:${c + 1}`) ?? null;
    }
  }

  return {
    name: getTableName($, table, tableIndex),
    range:
      rowCount > 0 && columnCount > 0
        ? `A1:${encodeCellAddress(rowCount, columnCount)}`
        : null,
    rowCount,
    columnCount,
    matrix,
    cells,
    merges,
    records: matrixToRecords(matrix),
  };
}

function extractCellValue(
  cell: cheerio.Cheerio<Element>
): SerializableCellValue {
  const raw = cleanText(
    cell.attr("data-value") ??
      cell.attr("data-date") ??
      cell.text()
  );

  if (!raw) return null;
  if (/^(true|false)$/i.test(raw)) {
    return raw.toLowerCase() === "true";
  }

  const numberCandidate = raw
    .replace(/\s/g, "")
    .replace(/[€$£]/g, "")
    .replace(/,(?=\d{3}(?:\D|$))/g, "");

  if (/^-?\d+(?:\.\d+)?$/.test(numberCandidate)) {
    const parsed = Number(numberCandidate);
    if (Number.isFinite(parsed)) return parsed;
  }

  return raw;
}

function extractHtmlFill(
  cell: cheerio.Cheerio<Element>
): WorkbookCellFill | undefined {
  const className = cell.attr("class") ?? "";
  const style = cell.attr("style") ?? "";
  const dataStatus =
    cell.attr("data-status") ??
    cell.attr("data-state") ??
    "";

  const directColor = extractCssColor(style);

  if (directColor) {
    return {
      patternType: "solid",
      foregroundColor: directColor,
    };
  }

  const semanticColor = detectSemanticColor(
    `${className} ${style} ${dataStatus}`.toLowerCase()
  );

  return semanticColor
    ? {
        patternType: "solid",
        foregroundColor: semanticColor,
      }
    : undefined;
}

function detectSemanticColor(value: string): string | undefined {
  if (/\b(available|free|open)\b/.test(value)) return "FF10B981";
  if (/\b(booked|busy|occupied|sold)\b/.test(value)) return "FF8B5CF6";
  if (/\b(option|hold|reserved)\b/.test(value)) return "FFF59E0B";
  if (/\b(provisional|pending|tentative)\b/.test(value)) return "FF06B6D4";
  if (/\b(maintenance|service|dry-dock|dry_dock)\b/.test(value)) return "FFF97316";
  if (/\b(unavailable|blocked|closed)\b/.test(value)) return "FFEF4444";
  return undefined;
}

function extractCssColor(style: string): string | undefined {
  const hex = /background(?:-color)?\s*:\s*#([0-9a-f]{3,8})/i.exec(style);
  if (hex) return normalizeHexColor(hex[1]);

  const rgb = /background(?:-color)?\s*:\s*rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(style);
  if (!rgb) return undefined;

  return `FF${toHex(clampColor(Number(rgb[1])))}${toHex(
    clampColor(Number(rgb[2]))
  )}${toHex(clampColor(Number(rgb[3])))}`;
}

function normalizeHexColor(value: string): string {
  const normalized = value.toUpperCase();
  if (normalized.length === 3) {
    return `FF${normalized
      .split("")
      .map((character) => character.repeat(2))
      .join("")}`;
  }
  if (normalized.length === 6) return `FF${normalized}`;
  if (normalized.length === 8) return normalized;
  return `FF${normalized.slice(0, 6).padEnd(6, "0")}`;
}

function matrixToRecords(
  matrix: SerializableCellValue[][]
): Record<string, SerializableCellValue>[] {
  if (matrix.length < 2) return [];

  const headerIndex = matrix.findIndex((row) =>
    row.some((value) => value !== null && String(value).trim())
  );

  if (headerIndex < 0) return [];

  const headers = matrix[headerIndex].map((value, index) => {
    const text = cleanText(value === null ? "" : String(value));
    return text || `Column ${index + 1}`;
  });

  return matrix
    .slice(headerIndex + 1)
    .filter((row) =>
      row.some((value) => value !== null && String(value).trim())
    )
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header, row[index] ?? null])
      )
    );
}

function getTableName(
  $: cheerio.CheerioAPI,
  table: cheerio.Cheerio<Element>,
  tableIndex: number
): string {
  const explicit = cleanText(
    table.attr("data-yacht-name") ??
      table.attr("aria-label") ??
      table.attr("id") ??
      ""
  );
  if (explicit) return explicit.slice(0, 80);

  const caption = cleanText(table.find("caption").first().text());
  if (caption) return caption.slice(0, 80);

  const heading = cleanText(
    table.prevAll("h1, h2, h3, h4, h5, h6").first().text()
  );
  if (heading) return heading.slice(0, 80);

  return `Website Table ${tableIndex + 1}`;
}

function getPageTitle($: cheerio.CheerioAPI): string | null {
  return cleanText($("title").first().text()) || null;
}

function getFileNameFromUrl(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "") || "website";
  } catch {
    return "website";
  }
}

function normalizeSpan(value: string | undefined): number {
  const parsed = Number(value ?? 1);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_COLUMNS_PER_TABLE);
}

function encodeCellAddress(row: number, column: number): string {
  return `${columnToLetters(column)}${row}`;
}

function columnToLetters(column: number): string {
  let result = "";
  let current = column;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result || "A";
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
