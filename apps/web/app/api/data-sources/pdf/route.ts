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
import { parsePdfBuffer } from "@/lib/data-sources/connectors/pdf";
import {
  detectYachtWorkbook,
  parseYachtWorkbook,
} from "@/lib/data-sources/parsers";

/**
 * Direct PDF upload.
 *
 * The URL connector and this route share `parsePdfBuffer`, so a linked PDF
 * and an uploaded one go through an identical pipeline and cannot drift
 * apart in behaviour.
 *
 * This returns a preview rather than writing to the database. A broker should
 * see what was extracted and confirm it before it touches their fleet, since
 * a misread supplier PDF is worse than no data at all.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PDF parsing is CPU-bound, so cap it per company. */
const RATE_LIMIT = { limit: 20, windowSeconds: 60 } as const;

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();

    const limit = checkRateLimit(
      `pdf:upload:${workspace.companyId}`,
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

    const result = await parsePdfBuffer(data, file.name);

    // A PDF with no parseable table is not an error. It is a real and common
    // case (scans, brochures) that the caller needs to know about so it can
    // offer AI extraction instead.
    if (result.pdf.requiresAiExtraction) {
      return NextResponse.json(
        {
          success: true,
          data: {
            parsed: false,
            reason:
              result.pdf.scannedPages.length > 0
                ? "scanned"
                : "unstructured",
            pdf: result.pdf,
            message:
              result.pdf.scannedPages.length > 0
                ? "This PDF has no readable text layer, so it looks like a scan. AI extraction can read it visually."
                : "This PDF has text but no table Bahari OS could read. AI extraction can interpret it instead.",
          },
        },
        { status: 200, headers: rateLimitHeaders(limit) }
      );
    }

    /*
     * A grid was reconstructed, but that does not mean any parser understands
     * its shape. Management companies use per-yacht blocks, partner networks
     * use week-column grids, and neither matches a flat booking table.
     *
     * When no parser can read it, that is the same outcome as a scan or a
     * brochure: it needs AI extraction. Treating it as an error instead put a
     * raw internal message in front of the broker.
     */
    let detection;
    let parsed;

    try {
      detection = detectYachtWorkbook(result.workbook);
      parsed = parseYachtWorkbook(result.workbook);
    } catch {
      return NextResponse.json(
        {
          success: true,
          data: {
            parsed: false,
            reason: "unstructured",
            pdf: result.pdf,
            message:
              "This PDF has a table, but not in a layout Bahari OS recognises yet. AI extraction can interpret it instead.",
          },
        },
        { status: 200, headers: rateLimitHeaders(limit) }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          parsed: true,
          fileName: result.fileName,
          pdf: result.pdf,
          layout: detection.layout,
          detectionConfidence: detection.confidence,
          yachtCount: parsed.yachts.length,
          availabilityCount: parsed.availability.length,
          // Enough for the broker to sanity-check before committing, without
          // shipping the entire extraction over the wire.
          yachts: parsed.yachts.slice(0, 25),
          availability: parsed.availability.slice(0, 100),
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

    // Messages from parsePdfBuffer are written for brokers (size limits,
    // wrong file type, page count) so they are safe and useful to surface.
    const message =
      error instanceof Error
        ? error.message
        : "Could not read that PDF.";

    console.error("PDF upload failed:", error);

    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}