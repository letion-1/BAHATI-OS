import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { parsePdfBuffer } from "@/lib/data-sources/connectors/pdf";
import { extractPdfText } from "@/lib/data-sources/pdf/extract-text";
import { reconstructGrid } from "@/lib/data-sources/pdf/reconstruct-grid";
import { detectReferenceDocument } from "@/lib/data-sources/pdf/reference-document";
import {
  detectYachtWorkbook,
  parseYachtWorkbook,
} from "@/lib/data-sources/parsers";

/**
 * These run against real PDF files rather than mocks, because everything that
 * makes PDF parsing hard lives in the actual byte format: coordinate systems,
 * text fragmentation, missing text layers. A mocked PDF would test nothing.
 *
 * Fixtures in tests/fixtures/pdf represent the three shapes operators send:
 * a clean table, a designed brochure, and a scan with no text layer.
 */

function fixture(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(path.join(__dirname, "../fixtures/pdf", name))
  );
}

describe("extractPdfText", () => {
  it("extracts text with coordinates from a table PDF", async () => {
    const result = await extractPdfText(fixture("availability-table.pdf"));

    expect(result.pageCount).toBe(1);
    expect(result.pages[0].items.length).toBeGreaterThan(20);
    expect(result.pages[0].isScanned).toBe(false);

    // Coordinates are what make grid reconstruction possible at all.
    const item = result.pages[0].items[0];
    expect(typeof item.x).toBe("number");
    expect(typeof item.y).toBe("number");
  });

  it("flags a page with no text layer as scanned", async () => {
    const result = await extractPdfText(fixture("scanned.pdf"));

    expect(result.isEntirelyScanned).toBe(true);
    expect(result.pages[0].isScanned).toBe(true);
  });

  it("rejects a file that is not a PDF", async () => {
    await expect(
      extractPdfText(new TextEncoder().encode("this is not a pdf"))
    ).rejects.toThrow();
  });
});

describe("reconstructGrid", () => {
  it("recovers the original table structure", async () => {
    const extraction = await extractPdfText(
      fixture("availability-table.pdf")
    );
    const grid = reconstructGrid(extraction.pages[0]);

    expect(grid.columnPositions.length).toBe(6);
    expect(grid.confidence).toBeGreaterThan(0.5);

    const flat = grid.matrix.map((row) => row.join("|")).join("\n");

    expect(flat).toContain("M/Y Alisa");
    expect(flat).toContain("2026-07-11");
    expect(flat).toContain("Available");

    // Row integrity is the point: a yacht must stay on the same row as its
    // dates and status, or the parsed availability is worse than useless.
    const alisaRow = grid.matrix.find(
      (row) => row[0] === "M/Y Alisa" && row[3] === "Available"
    );
    expect(alisaRow).toBeDefined();
    expect(alisaRow?.[1]).toBe("2026-07-11");
    expect(alisaRow?.[2]).toBe("2026-07-18");
  });

  it("scores prose lower than a table", async () => {
    const table = await extractPdfText(fixture("availability-table.pdf"));
    const brochure = await extractPdfText(fixture("brochure.pdf"));

    const tableScore = reconstructGrid(table.pages[0]).confidence;
    const brochureScore = reconstructGrid(brochure.pages[0]).confidence;

    expect(tableScore).toBeGreaterThan(brochureScore);
  });

  it("returns an empty grid for a page with no text", async () => {
    const scanned = await extractPdfText(fixture("scanned.pdf"));
    const grid = reconstructGrid(scanned.pages[0]);

    expect(grid.matrix).toEqual([]);
    expect(grid.confidence).toBe(0);
  });
});

describe("parsePdfBuffer", () => {
  it("produces a workbook the existing yacht parsers can read", async () => {
    const result = await parsePdfBuffer(
      fixture("availability-table.pdf"),
      "availability-table.pdf"
    );

    expect(result.kind).toBe("workbook");
    expect(result.sourceType).toBe("pdf");
    expect(result.pdf.requiresAiExtraction).toBe(false);

    // The whole design rests on this: a PDF becomes a workbook, so every
    // parser written for spreadsheets works on it unchanged.
    const detection = detectYachtWorkbook(result.workbook);
    expect(detection.layout).not.toBe("unknown");

    const parsed = parseYachtWorkbook(result.workbook);
    expect(parsed.yachts.length).toBeGreaterThan(0);
    expect(parsed.availability.length).toBeGreaterThan(0);

    const names = parsed.yachts.map((yacht) => yacht.name);
    expect(names.join(" ")).toContain("Alisa");
  });

  it("never reports a booked week as available", async () => {
    const result = await parsePdfBuffer(
      fixture("availability-table.pdf"),
      "availability-table.pdf"
    );

    const parsed = parseYachtWorkbook(result.workbook);

    // Quoting a chartered yacht is the failure that loses a client, and a PDF
    // source must not be a back door to it.
    const serene = parsed.availability.filter((row) =>
      row.yachtName?.includes("Serene")
    );

    for (const row of serene) {
      expect(row.status).not.toBe("available");
    }
  });

  it("routes a scanned PDF to AI extraction rather than failing", async () => {
    const result = await parsePdfBuffer(fixture("scanned.pdf"), "scanned.pdf");

    expect(result.pdf.requiresAiExtraction).toBe(true);
    expect(result.pdf.scannedPages).toContain(1);
    expect(result.workbook.sheets).toHaveLength(0);
  });

  it("routes a prose brochure to AI extraction", async () => {
    const result = await parsePdfBuffer(
      fixture("brochure.pdf"),
      "brochure.pdf"
    );

    expect(result.pdf.requiresAiExtraction).toBe(true);
    expect(result.pdf.scannedPages).toHaveLength(0);
    expect(result.pdf.lowConfidencePages).toContain(1);
  });

  it("keeps the usable page from a mixed multi-page PDF", async () => {
    const result = await parsePdfBuffer(
      fixture("multipage.pdf"),
      "multipage.pdf"
    );

    expect(result.pdf.pageCount).toBe(2);
    expect(result.pdf.requiresAiExtraction).toBe(false);

    // Page 1 is a note, page 2 is the table. Only the table should survive.
    expect(result.workbook.sheets.length).toBe(1);
    expect(result.workbook.sheetNames[0]).toContain("page 2");

    const parsed = parseYachtWorkbook(result.workbook);
    expect(parsed.yachts.length).toBeGreaterThan(0);
  });

  it("names sheets after the file and page", async () => {
    const result = await parsePdfBuffer(
      fixture("availability-table.pdf"),
      "Adriatic-Fleet-2026.pdf"
    );

    expect(result.workbook.sheetNames[0]).toBe(
      "Adriatic-Fleet-2026 (page 1)"
    );
  });

  it("rejects an empty buffer", async () => {
    await expect(parsePdfBuffer(new Uint8Array(), null)).rejects.toThrow(
      /empty/i
    );
  });

  it("rejects a file whose bytes are not a PDF", async () => {
    await expect(
      parsePdfBuffer(new TextEncoder().encode("<html>preview page</html>"), null)
    ).rejects.toThrow(/not a PDF/i);
  });
});
describe("detectReferenceDocument", () => {
  it("declines SOURCE-D, which disclaims itself repeatedly", () => {
    const result = detectReferenceDocument(
      "MEDITERRANEAN MARKET REFERENCE Reference listing - not a booking source. " +
        "This document does not constitute an offer or a bookable calendar. " +
        "Enquiries should be directed to the appointed central agent."
    );

    expect(result.isReferenceDocument).toBe(true);
    expect(result.matchedPhrases.length).toBeGreaterThanOrEqual(2);
  });

  it("allows an availability sheet that names a central agent once", () => {
    const result = detectReferenceDocument(
      "M/Y Aurora available 06 June to 13 June. Booked 20 June. " +
        "Contact the central agent to hold a week."
    );

    expect(result.isReferenceDocument).toBe(false);
  });

  it("normalises smart quotes and dashes before matching", () => {
    const result = detectReferenceDocument(
      "Reference listing \u2014 not a booking source, and it isn\u2019t an offer."
    );

    expect(result.isReferenceDocument).toBe(true);
  });

  it("allows empty text rather than guessing", () => {
    expect(detectReferenceDocument("").isReferenceDocument).toBe(false);
  });
});