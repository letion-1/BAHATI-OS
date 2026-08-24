import "server-only";

import type { WorkbookConnectorResult } from "../source-types";

import { extractPdfText } from "../pdf/extract-text";
import { reconstructGrid } from "../pdf/reconstruct-grid";
import { pdfGridsToWorkbook } from "../pdf/grid-to-workbook";

/**
 * PDF availability source.
 *
 * Three kinds of PDF arrive from operators, and they need different handling:
 *
 *   1. Text-based tables  - the common case. Text is extracted with
 *                           coordinates, the grid is reconstructed, and the
 *                           existing yacht parsers handle it as a workbook.
 *   2. Designed brochures - text exists but is laid out as prose. Grid
 *                           reconstruction scores low, and the page is
 *                           flagged for AI extraction instead.
 *   3. Scans              - no text layer at all. Flagged for vision
 *                           extraction; parsing cannot help here.
 *
 * This connector decides which of the three it is holding and says so
 * explicitly, rather than returning an empty workbook and letting the broker
 * conclude the feature is broken.
 */

/** Refuse anything larger than this. A fleet calendar is never this big. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Below this table-likeness score, no grid is built and the page is sent to
 * AI extraction.
 *
 * Lowered from 0.45 after a partner-network weekly grid scored 0.40 and was
 * rejected before any parser saw it. That layout is sparse by nature: a wide
 * page of single-letter status codes fills few of its grid positions, which
 * is exactly what the fill component of the score measures.
 *
 * The cost of being too permissive is small, because a page that reconstructs
 * badly still produces no yachts and falls through to AI extraction anyway.
 * The cost of being too strict is a whole layout class never reaching the
 * parsers.
 */
export const AI_FALLBACK_THRESHOLD = 0.3;

export type PdfConnectorResult = WorkbookConnectorResult & {
  pdf: {
    pageCount: number;
    /** Pages with no text layer, needing vision extraction. */
    scannedPages: number[];
    /** Pages with text that did not reconstruct into a usable table. */
    lowConfidencePages: number[];
    /** True when nothing in this PDF can be parsed without AI. */
    requiresAiExtraction: boolean;
    /** Best table-likeness score across all pages, 0 to 1. */
    bestConfidence: number;
    /**
     * Every text item on every page, joined in reading order.
     *
     * Exposed so callers can inspect what the document says about itself
     * before deciding what to do with it. The reference-document check needs
     * the prose, and the prose is discarded by grid reconstruction.
     */
    plainText: string;
  };
};

export async function fetchPdfSource(
  sourceUrl: string
): Promise<PdfConnectorResult> {
  const data = await downloadPdf(sourceUrl);

  return parsePdfBuffer(data, fileNameFromUrl(sourceUrl));
}

/**
 * Shared by the URL connector and the upload route, so a linked PDF and an
 * uploaded one go through exactly the same pipeline.
 */
export async function parsePdfBuffer(
  data: Uint8Array,
  fileName: string | null
): Promise<PdfConnectorResult> {
  if (data.byteLength === 0) {
    throw new Error("The PDF is empty.");
  }

  if (data.byteLength > MAX_BYTES) {
    throw new Error(
      `The PDF is ${(data.byteLength / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_BYTES / 1024 / 1024}MB.`
    );
  }

  if (!looksLikePdf(data)) {
    throw new Error(
      "That file is not a PDF. Check the link points at the file itself rather than a preview page."
    );
  }

  const extraction = await extractPdfText(data);

  const grids = extraction.pages.map((page) => reconstructGrid(page));

  const scannedPages = extraction.pages
    .filter((page) => page.isScanned)
    .map((page) => page.pageNumber);

  const lowConfidencePages = grids
    .filter(
      (grid) =>
        !scannedPages.includes(grid.pageNumber) &&
        grid.confidence < AI_FALLBACK_THRESHOLD
    )
    .map((grid) => grid.pageNumber);

  const usableGrids = grids.filter(
    (grid) =>
      grid.confidence >= AI_FALLBACK_THRESHOLD && grid.matrix.length > 0
  );

  const bestConfidence = grids.reduce(
    (best, grid) => Math.max(best, grid.confidence),
    0
  );

  const workbook = pdfGridsToWorkbook({
    grids: usableGrids,
    fileName,
  });

  const plainText = extraction.pages
    .map((page) => page.items.map((item) => item.text).join(" "))
    .join("\n");

  return {
    kind: "workbook",
    sourceType: "pdf",
    fileName,
    workbook,
    pdf: {
      pageCount: extraction.pageCount,
      scannedPages,
      lowConfidencePages,
      requiresAiExtraction: usableGrids.length === 0,
      bestConfidence,
      plainText,
    },
  };
}

/**
 * A PDF always begins with %PDF-. Checking the bytes rather than trusting the
 * Content-Type header catches the common case of a link resolving to an HTML
 * preview page instead of the file.
 */
function looksLikePdf(data: Uint8Array): boolean {
  return (
    data[0] === 0x25 &&
    data[1] === 0x50 &&
    data[2] === 0x44 &&
    data[3] === 0x46 &&
    data[4] === 0x2d
  );
}

async function downloadPdf(sourceUrl: string): Promise<Uint8Array> {
  const url = assertSafeUrl(sourceUrl);

  const response = await fetch(url, {
    redirect: "follow",
    headers: { Accept: "application/pdf,*/*" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `Could not download the PDF (HTTP ${response.status}). Check the link is publicly reachable.`
    );
  }

  const length = Number(response.headers.get("content-length") ?? 0);

  if (length > MAX_BYTES) {
    throw new Error(
      `The PDF is ${(length / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_BYTES / 1024 / 1024}MB.`
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Server-side fetch of a user-supplied URL is a server-side request forgery
 * risk: without this check, a broker could point a data source at an internal
 * address and have the server fetch it on their behalf. Cloud metadata
 * endpoints are the usual target.
 */
function assertSafeUrl(sourceUrl: string): URL {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    throw new Error("That is not a valid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http and https links are supported.");
  }

  const host = url.hostname.toLowerCase();

  const blocked =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "metadata.google.internal" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);

  if (blocked) {
    throw new Error("That address cannot be used as a data source.");
  }

  return url;
}

function fileNameFromUrl(sourceUrl: string): string | null {
  try {
    const parts = new URL(sourceUrl).pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];

    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}