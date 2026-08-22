import "server-only";

/**
 * Text extraction from PDF, with per-page coordinates.
 *
 * `unpdf` is a serverless-oriented build of Mozilla's pdf.js. It is used here
 * rather than pdf-parse because pdf-parse discards position information, and
 * position is the only thing that makes table reconstruction possible: a PDF
 * has no concept of a row or a cell, only glyphs at coordinates.
 */

export type PdfTextItem = {
  text: string;
  /** Distance from the left edge, in PDF points. */
  x: number;
  /** Distance from the bottom edge, in PDF points. Higher is further up. */
  y: number;
  width: number;
  height: number;
  fontSize: number;
};

export type PdfPage = {
  /** 1-indexed, matching what a person sees in a viewer. */
  pageNumber: number;
  items: PdfTextItem[];
  /**
   * True when the page has no meaningful text layer. Almost always a scan or
   * an exported image, which needs vision extraction rather than parsing.
   */
  isScanned: boolean;
};

export type PdfExtraction = {
  pageCount: number;
  pages: PdfPage[];
  /** True when every page lacks a text layer. */
  isEntirelyScanned: boolean;
  /** True when some pages have text and others do not. */
  isMixed: boolean;
};

/**
 * Below this many text items, a page is treated as scanned. A genuine scan
 * usually yields zero items; a handful can appear from a header stamp or an
 * OCR layer fragment, which is not enough to parse a fleet calendar from.
 */
const SCANNED_ITEM_THRESHOLD = 8;

/** Guard against a malicious or accidental 2,000-page upload. */
const MAX_PAGES = 60;

export async function extractPdfText(
  data: Uint8Array
): Promise<PdfExtraction> {
  // Imported lazily so the pdf.js bundle is only loaded when a PDF source is
  // actually processed, rather than on every cold start.
  const { extractTextItems, getDocumentProxy } = await import("unpdf");

  let document;

  try {
    document = await getDocumentProxy(data);
  } catch (error) {
    throw new Error(
      `Could not read the PDF. It may be corrupt or password protected. ${
        error instanceof Error ? error.message : ""
      }`.trim()
    );
  }

  const pageCount = document.numPages;

  if (pageCount > MAX_PAGES) {
    throw new Error(
      `This PDF has ${pageCount} pages. Bahari OS reads up to ${MAX_PAGES}. Please split it or link the availability section directly.`
    );
  }

  const { items } = await extractTextItems(document);

  const pages: PdfPage[] = items.map((pageItems, index) => {
    const cleaned: PdfTextItem[] = (pageItems ?? [])
      .filter(
        (item): item is typeof item & { str: string } =>
          typeof item?.str === "string" && item.str.trim().length > 0
      )
      .map((item) => ({
        text: item.str.trim(),
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        width: Number(item.width) || 0,
        height: Number(item.height) || 0,
        fontSize: Number(item.fontSize) || 0,
      }));

    return {
      pageNumber: index + 1,
      items: cleaned,
      isScanned: cleaned.length < SCANNED_ITEM_THRESHOLD,
    };
  });

  const scannedCount = pages.filter((page) => page.isScanned).length;

  return {
    pageCount,
    pages,
    isEntirelyScanned: pages.length > 0 && scannedCount === pages.length,
    isMixed: scannedCount > 0 && scannedCount < pages.length,
  };
}