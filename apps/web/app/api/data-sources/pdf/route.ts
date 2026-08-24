import { NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";
import {
  checkRateLimit,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { parsePdfBuffer } from "@/lib/data-sources/connectors/pdf";
import { parseYachtWorkbook } from "@/lib/data-sources/parsers";
import {
  findDuplicateUpload,
  hashPdfContent,
} from "@/lib/data-sources/pdf/content-hash";
import {
  detectReferenceDocument,
  referenceDocumentMessage,
} from "@/lib/data-sources/pdf/reference-document";

/**
 * Preview an uploaded PDF. Reads only, writes nothing.
 *
 * This endpoint previously contained a verbatim copy of the commit handler at
 * /api/data-sources/pdf/commit. Selecting a file therefore created a data
 * source and imported the fleet before the broker had seen a single row, and
 * confirming imported it a second time. Two rows for one file, and the preview
 * step existed in name only.
 *
 * It also returned the commit response shape ({ sourceId, yachts, availability
 * }), which the upload component reads as a preview result. `parsed` was
 * undefined, the component took its "could not parse" branch, and that branch
 * reads result.pdf.pageCount on an object with no `pdf` key. That threw during
 * render and took the whole /data-sources page down.
 *
 * So the contract here is narrow and worth stating: this handler touches no
 * table, and its response is exactly the UploadResult union the component
 * declares. Nothing reaches the database until the broker confirms.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = { limit: 20, windowSeconds: 60 } as const;

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Preview rows are for eyeballing, not for storage. Sending an entire season
 * of a large fleet back to the browser to render a sample table wastes a
 * payload the broker will never scroll through.
 */
const PREVIEW_ROW_LIMIT = 50;

/**
 * The client renders three numbers from `pdf`: the page count, how many pages
 * were scans, and how many had no readable table. It never touches the rest.
 *
 * `read.pdf` also carries `plainText`, which is every text item on every page.
 * On a 54-page season calendar that is 198KB of prose shipped to the browser
 * so it can draw "54". It exists for the reference-document check, which runs
 * on the server, and has no business crossing the wire.
 */
function toPreviewPdf(pdf: {
  pageCount: number;
  scannedPages: number[];
  lowConfidencePages: number[];
  requiresAiExtraction: boolean;
  bestConfidence: number;
}) {
  return {
    pageCount: pdf.pageCount,
    scannedPages: pdf.scannedPages,
    lowConfidencePages: pdf.lowConfidencePages,
    requiresAiExtraction: pdf.requiresAiExtraction,
    bestConfidence: pdf.bestConfidence,
  };
}

export async function POST(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();

    const limit = checkRateLimit(
      `pdf:preview:${workspace.companyId}`,
      RATE_LIMIT
    );

    if (!limit.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many uploads. Please wait a moment and try again.",
        },
        { status: 429, headers: rateLimitHeaders(limit) }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file was uploaded." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_BYTES / 1024 / 1024}MB.`,
        },
        { status: 413 }
      );
    }

    const data = new Uint8Array(await file.arrayBuffer());

    const read = await parsePdfBuffer(data, file.name);

    /*
     * Checked before the AI-extraction branch below, deliberately.
     *
     * A reference sheet is prose, so it reconstructs badly and would
     * otherwise be offered to AI extraction, which is the one path capable of
     * reading it. That is the wrong outcome: the document asks not to be
     * treated as a live source, and honouring that is worth more than the
     * rows it would yield.
     */
    const reference = detectReferenceDocument(read.pdf.plainText);

    if (reference.isReferenceDocument) {
      return NextResponse.json(
        {
          success: true,
          data: {
            parsed: false,
            reason: "reference",
            pdf: toPreviewPdf(read.pdf),
            message: referenceDocumentMessage(reference),
          },
        },
        { status: 200, headers: rateLimitHeaders(limit) }
      );
    }

    /*
     * A PDF that cannot be read is not an error. It is a result, and the
     * component has a branch for it. Returning 4xx here would put the file in
     * the red error box instead of the amber panel, which is the difference
     * between a dead end and a next step.
     */
    if (read.pdf.requiresAiExtraction) {
      const everyPageScanned =
        read.pdf.scannedPages.length === read.pdf.pageCount &&
        read.pdf.pageCount > 0;

      return NextResponse.json(
        {
          success: true,
          data: {
            parsed: false,
            reason: everyPageScanned ? "scanned" : "unstructured",
            pdf: toPreviewPdf(read.pdf),
            message: everyPageScanned
              ? "There is no text layer in this file, so it is an image of a calendar rather than a calendar. AI extraction can read it."
              : "The text in this file is laid out as prose or a designed brochure rather than a table. AI extraction can read it.",
          },
        },
        { status: 200, headers: rateLimitHeaders(limit) }
      );
    }

    /*
     * parseYachtWorkbook walks every parser and only throws once all of them
     * have declined, so reaching this catch means no layout matched. Same
     * reasoning as above: a result, not an error.
     */
    let parsed;

    try {
      parsed = parseYachtWorkbook(read.workbook);
    } catch {
      return NextResponse.json(
        {
          success: true,
          data: {
            parsed: false,
            reason: "unstructured",
            pdf: toPreviewPdf(read.pdf),
            message:
              "This PDF has a table, but not in a layout Bahari OS recognises yet. AI extraction can read it.",
          },
        },
        { status: 200, headers: rateLimitHeaders(limit) }
      );
    }

    if (parsed.yachts.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: {
            parsed: false,
            reason: "unstructured",
            pdf: toPreviewPdf(read.pdf),
            message:
              "A table was read, but no yacht names were found in it. Check the file has a yacht column, or use AI extraction.",
          },
        },
        { status: 200, headers: rateLimitHeaders(limit) }
      );
    }

    /*
     * A read, not a write. The preview stays free of side effects; this only
     * tells the broker what confirming would do, which is the difference
     * between a warning and a surprise.
     */
    const duplicateOf = await findDuplicateUpload({
      supabase: await createClient(),
      companyId: workspace.companyId,
      contentHash: hashPdfContent(data),
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          parsed: true,
          fileName: file.name,
          duplicateOf,
          pdf: toPreviewPdf(read.pdf),
          layout: parsed.layout,
          detectionConfidence: parsed.confidence,
          // Full totals, so the broker sees what the import will actually do
          // rather than the size of the sample below it.
          yachtCount: parsed.yachts.length,
          availabilityCount: parsed.availability.length,
          yachts: parsed.yachts
            .slice(0, PREVIEW_ROW_LIMIT)
            .map((yacht) => ({
              name: yacht.name,
              sourceKey: yacht.sourceKey,
            })),
          availability: parsed.availability
            .slice(0, PREVIEW_ROW_LIMIT)
            .map((window) => ({
              yachtName: window.yachtName,
              startDate: window.startDate,
              endDate: window.endDate,
              status: window.status,
            })),
        },
      },
      { status: 200, headers: rateLimitHeaders(limit) }
    );
  } catch (error) {
    if (isAuthenticationRequiredError(error)) {
      return NextResponse.json(
        { success: false, error: "You must sign in to continue." },
        { status: error.status }
      );
    }

    if (isWorkspaceAccessError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    console.error("PDF preview failed:", error);

    /*
     * Everything above this line is a handled outcome, so anything arriving
     * here is a genuine fault: a corrupt file, an oversized one, a broken
     * extraction. parsePdfBuffer's messages are written for brokers, so pass
     * them through rather than replacing them with something generic.
     */
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not read that PDF.",
      },
      { status: 400 }
    );
  }
}