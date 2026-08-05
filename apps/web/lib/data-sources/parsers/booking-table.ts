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

const PARSER_ID = "booking-table-v1";

const HEADER_ALIASES = {
  yacht: ["yacht", "boat", "vessel", "name", "yacht name", "boat name"],
  start: ["start", "from", "arrival", "check in", "check-in", "embarkation"],
  end: ["end", "to", "departure", "check out", "check-out", "disembarkation"],
  status: ["status", "availability", "booking status"],
  price: ["price", "rate", "weekly rate", "charter rate"],
  currency: ["currency"],
  notes: ["notes", "comment", "comments", "remarks", "booking", "client", "guest"],
  location: ["location", "area", "destination", "cruising area"],
  region: ["region", "country", "cruising region"],
  embarkationPort: ["embarkation port", "embarkation", "start port", "from port"],
  disembarkationPort: ["disembarkation port", "disembarkation", "end port", "to port"],
  evidence: ["evidence", "source evidence"],
  confidence: ["confidence", "ai confidence"],
} as const;

type HeaderMap = {
  row: number;
  yacht: number;
  start: number;
  end: number;
  status: number | null;
  price: number | null;
  currency: number | null;
  notes: number | null;
  location: number | null;
  region: number | null;
  embarkationPort: number | null;
  disembarkationPort: number | null;
  evidence: number | null;
  confidence: number | null;
};

function normalizeText(value: SerializableCellValue): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: SerializableCellValue): string {
  return normalizeText(value).toLowerCase();
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function findAliasIndex(row: SerializableCellValue[], aliases: readonly string[]): number | null {
  const normalized = row.map(normalizeHeader);
  for (let index = 0; index < normalized.length; index += 1) {
    if (aliases.includes(normalized[index])) return index + 1;
  }
  return null;
}

function findHeaderMap(worksheet: ParsedWorksheet): HeaderMap | null {
  const maxRows = Math.min(worksheet.matrix.length, 25);
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const row = worksheet.matrix[rowIndex] ?? [];
    const yacht = findAliasIndex(row, HEADER_ALIASES.yacht);
    const start = findAliasIndex(row, HEADER_ALIASES.start);
    const end = findAliasIndex(row, HEADER_ALIASES.end);

    if (!yacht || !start || !end) continue;

    return {
      row: rowIndex + 1,
      yacht,
      start,
      end,
      status: findAliasIndex(row, HEADER_ALIASES.status),
      price: findAliasIndex(row, HEADER_ALIASES.price),
      currency: findAliasIndex(row, HEADER_ALIASES.currency),
      notes: findAliasIndex(row, HEADER_ALIASES.notes),
      location: findAliasIndex(row, HEADER_ALIASES.location),
      region: findAliasIndex(row, HEADER_ALIASES.region),
      embarkationPort: findAliasIndex(row, HEADER_ALIASES.embarkationPort),
      disembarkationPort: findAliasIndex(row, HEADER_ALIASES.disembarkationPort),
      evidence: findAliasIndex(row, HEADER_ALIASES.evidence),
      confidence: findAliasIndex(row, HEADER_ALIASES.confidence),
    };
  }
  return null;
}

function parseDate(value: SerializableCellValue): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + value);
    return epoch.toISOString().slice(0, 10);
  }

  const text = normalizeText(value);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const european = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (european) {
    let year = european[3];
    if (year.length === 2) year = `20${year}`;
    const date = new Date(Date.UTC(Number(year), Number(european[2]) - 1, Number(european[1])));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseStatus(value: SerializableCellValue): AvailabilityStatus {
  const text = normalizeText(value).toLowerCase();
  if (!text) return "unknown";
  if (text.includes("available") && !text.includes("unavailable")) return "available";
  if (text.includes("booked") || text.includes("booking")) return "booked";
  if (text.includes("reserved") || text.includes("hold")) return "reserved";
  if (text.includes("option")) return "option";
  if (text.includes("maintenance") || text.includes("out of service")) return "out_of_service";
  if (text.includes("unavailable") || text.includes("not available") || text === "n/a") return "unavailable";
  return "unknown";
}

function parsePrice(value: SerializableCellValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = normalizeText(value)
    .replace(/[€$£]/g, "")
    .replace(/\b(EUR|USD|GBP)\b/gi, "")
    .replace(/\s/g, "")
    .replace(/,(?=\d{3}\b)/g, "")
    .replace(/,(?=\d{1,2}\b)/, ".");
  const amount = Number(text);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseCurrency(explicitValue: SerializableCellValue, priceValue: SerializableCellValue): string | null {
  const explicit = normalizeText(explicitValue).toUpperCase();
  if (["EUR", "USD", "GBP"].includes(explicit)) return explicit;
  const combined = `${normalizeText(explicitValue)} ${normalizeText(priceValue)}`;
  if (/€|\bEUR\b/i.test(combined)) return "EUR";
  if (/\$|\bUSD\b/i.test(combined)) return "USD";
  if (/£|\bGBP\b/i.test(combined)) return "GBP";
  return null;
}

function parseConfidence(value: SerializableCellValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }

  const text = normalizeText(value).replace(/%$/, "");
  if (!text) return null;

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
}

function readValue(worksheet: ParsedWorksheet, row: number, column: number | null): SerializableCellValue {
  if (!column) return null;
  return worksheet.matrix[row - 1]?.[column - 1] ?? null;
}

function parseBookingTable(workbook: ParsedWorkbook, detection: ParserDetection): ParserResult {
  const worksheet = workbook.sheets.find((sheet) => sheet.name === detection.sheetName) ?? workbook.sheets[0];
  if (!worksheet) throw new Error("The detected booking-table worksheet was not found.");

  const headers = findHeaderMap(worksheet);
  if (!headers) {
    throw new Error("The booking table requires yacht, start-date and end-date columns.");
  }

  const yachtsByKey = new Map<string, NormalizedYacht>();
  const availability: NormalizedAvailability[] = [];
  const warnings: string[] = [];

  for (let row = headers.row + 1; row <= worksheet.rowCount; row += 1) {
    const yachtName = normalizeText(readValue(worksheet, row, headers.yacht));
    if (!yachtName) continue;

    const startDate = parseDate(readValue(worksheet, row, headers.start));
    const endDate = parseDate(readValue(worksheet, row, headers.end));
    if (!startDate || !endDate) {
      warnings.push(`Skipped row ${row} because its start or end date could not be parsed.`);
      continue;
    }

    const yachtSourceKey = `${slugify(worksheet.name)}:${slugify(yachtName)}`;
    if (!yachtsByKey.has(yachtSourceKey)) {
      yachtsByKey.set(yachtSourceKey, {
        sourceKey: yachtSourceKey,
        name: yachtName,
        sourceSheet: worksheet.name,
        sourceRow: row,
        sourceColumn: headers.yacht,
        brochureUrl: null,
        metadata: { parserId: PARSER_ID, headerRow: headers.row },
      });
    }

    const statusValue = readValue(worksheet, row, headers.status);
    const priceValue = readValue(worksheet, row, headers.price);
    const currencyValue = readValue(worksheet, row, headers.currency);
    const notesValue = readValue(worksheet, row, headers.notes);
    const locationValue = readValue(worksheet, row, headers.location);
    const regionValue = readValue(worksheet, row, headers.region);
    const embarkationPortValue = readValue(worksheet, row, headers.embarkationPort);
    const disembarkationPortValue = readValue(worksheet, row, headers.disembarkationPort);
    const evidenceValue = readValue(worksheet, row, headers.evidence);
    const confidenceValue = readValue(worksheet, row, headers.confidence);

    const location = normalizeText(locationValue) || null;
    const region = normalizeText(regionValue) || null;
    const embarkationPort = normalizeText(embarkationPortValue) || null;
    const disembarkationPort = normalizeText(disembarkationPortValue) || null;
    const evidence = normalizeText(evidenceValue) || null;
    const confidence = parseConfidence(confidenceValue);

    availability.push({
      sourceKey: [yachtSourceKey, startDate, endDate, row].join(":"),
      yachtSourceKey,
      yachtName,
      startDate,
      endDate,
      status: parseStatus(statusValue),
      price: parsePrice(priceValue),
      currency: parseCurrency(currencyValue, priceValue),
      rawValue: statusValue,
      sourceSheet: worksheet.name,
      sourceCell: null,
      sourceRow: row,
      sourceColumn: headers.status,
      notes: normalizeText(notesValue) || null,
      metadata: {
        parserId: PARSER_ID,
        headerRow: headers.row,
        location,
        region,
        embarkationPort,
        disembarkationPort,
        evidence,
        confidence,
        rawText: evidence ?? (normalizeText(notesValue) || null),
      },
    });
  }

  const yachts = Array.from(yachtsByKey.values());
  if (yachts.length === 0) throw new Error("The booking table did not contain any yacht rows.");

  return {
    parserId: PARSER_ID,
    layout: "booking_table",
    confidence: detection.confidence,
    yachts,
    availability,
    warnings,
    metadata: {
      sheetName: worksheet.name,
      detectedYear: null,
      yachtCount: yachts.length,
      availabilityCount: availability.length,
      headerRow: headers.row,
    },
  };
}

export const bookingTableParser: WorkbookParser = {
  id: PARSER_ID,
  layout: "booking_table",
  detect(workbook: ParsedWorkbook): ParserDetection {
    return {
      layout: "booking_table",
      confidence: 0,
      parserId: PARSER_ID,
      reasons: [],
      sheetName: workbook.sheets[0]?.name ?? null,
    };
  },
  parse(workbook: ParsedWorkbook, detection: ParserDetection): ParserResult {
    return parseBookingTable(workbook, detection);
  },
};
