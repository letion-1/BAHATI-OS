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
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePdfBuffer } from "@/lib/data-sources/connectors/pdf";
import { parseYachtWorkbook } from "@/lib/data-sources/parsers";
import { importParsedWorkbook } from "@/lib/data-sources/importer";

/**
 * Commit an uploaded PDF to the fleet.
 *
 * The preview endpoint at /api/data-sources/pdf reads a file and returns what
 * it found without writing anything. This one does the write, and it re-parses
 * the file rather than trusting a payload from the browser: a client that can
 * post arbitrary yacht and availability rows straight into the database is a
 * data integrity problem regardless of who is signed in.
 *
 * A one-off upload becomes a data source with no URL. It cannot re-sync on a
 * schedule, so `is_active` is false and `next_sync_at` is null.
 *
 * Values are chosen to satisfy the table's own check constraints, read from
 * the database rather than assumed:
 *
 *   status       pending | syncing | healthy | error | paused | disabled
 *   source_type  google_sheets | dropbox_excel | website | pdf
 *
 * The import is already complete by the time this row is written, so
 * "healthy" is the accurate state. "pending" would imply a sync yet to run.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = { limit: 10, windowSeconds: 60 } as const;

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();

    const limit = checkRateLimit(
      `pdf:commit:${workspace.companyId}`,
      RATE_LIMIT
    );

    if (!limit.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many imports. Please wait a moment and try again.",
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

    if (read.pdf.requiresAiExtraction) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Nothing could be read from this PDF, so there is nothing to import.",
        },
        { status: 409 }
      );
    }

    let parsed;

    try {
      parsed = parseYachtWorkbook(read.workbook);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "This PDF has a table, but not in a layout Bahari OS recognises yet. Nothing was imported.",
        },
        { status: 409 }
      );
    }

    if (parsed.yachts.length === 0) {
      return NextResponse.json(
        { success: false, error: "No yachts were found in this PDF." },
        { status: 409 }
      );
    }

    const admin = createAdminClient();
    const syncedAt = new Date().toISOString();

    // The source row first, so imported fleet and availability have something
    // to belong to and the broker can trace any row back to its file.
    const sourceResult = await admin
      .from("data_sources")
      .insert({
        company_id: workspace.companyId,
        name: file.name.replace(/\.pdf$/i, ""),
        source_type: "pdf",
        source_url: null,
        file_name: file.name,
        /*
         * data_sources_status_check allows only:
         *   pending, syncing, healthy, error, paused, disabled
         *
         * "connected" is not among them, and that single wrong value is what
         * failed every import. It was diagnosed twice by inference and twice
         * wrongly before the constraint was read directly.
         */
        status: "healthy",
        // The column is constrained to 5..1440. An upload has no URL to
        // poll, so the value is inert; `is_active: false` is what actually
        // stops it being scheduled.
        sync_frequency_minutes: 1440,
        is_active: false,
        last_synced_at: syncedAt,
        last_sync_status: "success",
        // No URL to poll, so nothing to schedule.
        next_sync_at: null,
        last_sync_message: `Imported from ${file.name}`,
        yacht_count: 0,
        availability_count: 0,
        error_count: 0,
        configuration: {
          origin: "upload",
          pageCount: read.pdf.pageCount,
          layout: parsed.layout,
          detectionConfidence: parsed.confidence,
        },
      })
      .select("id")
      .single();

    if (sourceResult.error || !sourceResult.data) {
      console.error("Could not create data source:", sourceResult.error);

      /*
       * Report what the database actually said.
       *
       * An earlier version guessed: any check-constraint violation was
       * reported as "the database does not accept pdf". The real failure was
       * a different constraint entirely, and the guess sent the reader off to
       * apply a migration that was already applied. A wrong diagnosis is
       * worse than no diagnosis.
       */
      const detail =
        sourceResult.error?.message ??
        sourceResult.error?.details ??
        "no detail returned";

      return NextResponse.json(
        {
          success: false,
          error: `Could not create the data source: ${detail}`,
        },
        { status: 500 }
      );
    }

    const sourceId = sourceResult.data.id as string;

    let imported;

    try {
      imported = await importParsedWorkbook({
        supabase: admin,
        companyId: workspace.companyId,
        sourceId,
        syncedAt,
        parsed,
      });
    } catch (error) {
      // Remove the orphan source rather than leave a row claiming an import
      // that never happened.
      // company_id as well as id: the admin client bypasses RLS, so scoping
      // by primary key alone would let a wrong sourceId reach another
      // company's row.
      await admin
        .from("data_sources")
        .delete()
        .eq("id", sourceId)
        .eq("company_id", workspace.companyId);

      throw error;
    }

    await admin
      .from("data_sources")
      .update({
        yacht_count: imported.fleet.total,
        availability_count: imported.availability.total,
        updated_at: syncedAt,
      })
      .eq("id", sourceId)
      .eq("company_id", workspace.companyId);

    return NextResponse.json(
      {
        success: true,
        data: {
          sourceId,
          fileName: file.name,
          yachts: imported.fleet,
          availability: imported.availability,
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

    console.error("PDF import failed:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not import that PDF.",
      },
      { status: 400 }
    );
  }
}