import { NextResponse } from "next/server";

import {
  isAuthenticationRequiredError,
} from "@/lib/auth/require-user";
import { fetchDataSource } from "@/lib/data-sources/connectors";
import { fetchAdaptiveWebsiteSource } from "@/lib/data-sources/connectors/website";
import { importParsedWorkbook } from "@/lib/data-sources/importer";
import { parseYachtWorkbook } from "@/lib/data-sources/parsers";
import type {
  ConnectorResult,
  SourceRecord,
} from "@/lib/data-sources/source-types";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type DataSourceRow =
  SourceRecord & {
    status:
      | string
      | null;

    sync_frequency_minutes:
      | number
      | null;

    configuration:
      | Record<string, unknown>
      | null;
  };

type WorkbookResult =
  Extract<
    ConnectorResult,
    {
      kind: "workbook";
    }
  >;

type WebsiteResult =
  Extract<
    ConnectorResult,
    {
      kind: "website";
    }
  >;

type WorkbookSummary =
  ReturnType<
    typeof buildWorkbookSummary
  >;

type WebsiteSummary =
  ReturnType<
    typeof buildWebsiteSummary
  >;

export async function POST(
  _request: Request,
  context: RouteContext
) {
  const startedAt =
    new Date();

  let failureContext:
    | {
        admin: ReturnType<typeof createAdminClient>;
        companyId: string;
        userId: string;
        source: DataSourceRow;
      }
    | null = null;

  try {
    const { id } =
      await context.params;

    if (
      !id ||
      !id.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A data source ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const workspace =
      await getCurrentWorkspace();

    // The source lookup uses the admin client after the active workspace has
    // already been resolved. Constraining by source ID and company ID keeps
    // the lookup tenant-safe while avoiding an RLS-generated false 404.
    const admin =
      createAdminClient();

    const {
      data: sourceData,
      error: sourceError,
    } = await admin
      .from("data_sources")
      .select(
        "id, company_id, name, source_type, source_url, configuration, status, sync_frequency_minutes"
      )
      .eq("id", id)
      .eq(
        "company_id",
        workspace.companyId
      )
      .maybeSingle();

    if (sourceError) {
      console.error(
        "Failed to load data source:",
        sourceError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            sourceError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!sourceData) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Data source was not found in the active workspace.",
          sourceId: id,
          companyId: workspace.companyId,
        },
        {
          status: 404,
        }
      );
    }

    const source =
      sourceData as unknown as DataSourceRow;

    failureContext = {
      admin,
      companyId: workspace.companyId,
      userId: workspace.userId,
      source,
    };

    const {
      error:
        syncingStatusError,
    } = await admin
      .from("data_sources")
      .update({
        status: "syncing",
      })
      .eq(
        "id",
        source.id
      )
      .eq(
        "company_id",
        workspace.companyId
      );

    if (
      syncingStatusError
    ) {
      throw new Error(
        `Could not mark the source as syncing: ${syncingStatusError.message}`
      );
    }

    let connectorResult:
      ConnectorResult;

    try {
      // Websites must enter the same normalized workbook pipeline as Sheets
      // and Dropbox. A plain website result only contains page text/links and
      // never reaches the yacht importer.
      connectorResult =
        source.source_type === "website" && source.source_url
          ? await fetchAdaptiveWebsiteSource(source.source_url)
          : await fetchDataSource(source);
    } catch (
      connectorError
    ) {
      const connectorMessage =
        connectorError instanceof Error
          ? connectorError.message
          : "The connector could not read this source.";

      console.error(
        `Connector failed for source ${source.id}:`,
        connectorError
      );

      await markSyncFailed({
        admin,
        companyId:
          workspace.companyId,
        userId:
          workspace.userId,
        source,
        message:
          connectorMessage,
        startedAt,
      });

      return NextResponse.json(
        {
          success: false,

          sourceId:
            source.id,

          sourceName:
            source.name,

          sourceType:
            source.source_type,

          error:
            connectorMessage,
        },
        {
          status: 422,
        }
      );
    }

    let summary:
      Record<string, unknown>;

    let preview:
      Record<
        string,
        unknown
      >;

    let activityDescription:
      string;

    let importSummary:
      | Awaited<
          ReturnType<
            typeof importParsedWorkbook
          >
        >
      | null = null;

    if (
      connectorResult.kind ===
      "workbook"
    ) {
      let workbookResult = connectorResult;

      let parsed: ReturnType<
        typeof parseYachtWorkbook
      >;

      try {
        parsed = applySourceNameFallbacks(
          parseYachtWorkbook(
            workbookResult.workbook
          ),
          source.name
        );
      } catch (parserError) {
        if (
          source.source_type === "website" &&
          source.source_url
        ) {
          try {
            workbookResult =
              await fetchAdaptiveWebsiteSource(
                source.source_url
              );

            connectorResult = workbookResult;

            parsed = applySourceNameFallbacks(
              parseYachtWorkbook(
                workbookResult.workbook
              ),
              source.name
            );
          } catch (adaptiveError) {
            const parserMessage =
              parserError instanceof Error
                ? parserError.message
                : "The deterministic workbook parser failed.";

            const adaptiveMessage =
              adaptiveError instanceof Error
                ? adaptiveError.message
                : "The adaptive website extractor failed.";

            throw new Error(
              `Website normalization failed. Deterministic parser: ${parserMessage} ` +
                `Adaptive extractor: ${adaptiveMessage}`
            );
          }
        } else {
          const parserMessage =
            parserError instanceof Error
              ? parserError.message
              : "The workbook parser failed.";

          throw new Error(
            `Workbook normalization failed: ${parserMessage}`
          );
        }
      }

      const syncedAt =
        new Date().toISOString();

      try {
        importSummary =
          await importParsedWorkbook({
            supabase: admin,
            companyId:
              workspace.companyId,
            sourceId:
              source.id,
            syncedAt,
            parsed,
          });
      } catch (importError) {
        const importMessage =
          importError instanceof Error
            ? importError.message
            : "The database import failed.";

        throw new Error(
          `Workbook import failed: ${importMessage}`
        );
      }

      const workbookSummary =
        buildWorkbookSummary(
          workbookResult
        );

      summary = {
        ...workbookSummary,

        parserId:
          importSummary.parser.parserId,

        parserLayout:
          importSummary.parser.layout,

        parserConfidence:
          importSummary.parser.confidence,

        parserWarningCount:
          importSummary.parser.warnings.length,

        yachtCount:
          importSummary.fleet.total,

        availabilityCount:
          importSummary.availability.inserted,

        fleetInserted:
          importSummary.fleet.inserted,

        fleetUpdated:
          importSummary.fleet.updated,

        availabilityInserted:
          importSummary.availability.inserted,

        availabilitySkipped:
          importSummary.availability.skipped,

        availabilityDeleted:
          importSummary.availability.deleted,
      };

      preview = {
        ...buildWorkbookPreview(
          workbookResult
        ),

        parser:
          importSummary.parser,

        import: {
          fleet:
            importSummary.fleet,

          availability:
            importSummary.availability,
        },

        normalizedPreview: {
          yachts:
            parsed.yachts.slice(
              0,
              20
            ),

          availability:
            parsed.availability.slice(
              0,
              40
            ),
        },
      };

      activityDescription =
        `Imported ${importSummary.fleet.total} yachts and ` +
        `${importSummary.availability.inserted} availability records ` +
        `using ${importSummary.parser.parserId}.`;
    } else {
      const websiteSummary =
        buildWebsiteSummary(
          connectorResult
        );

      summary =
        websiteSummary;

      preview =
        buildWebsitePreview(
          connectorResult
        );

      activityDescription =
        `Scanned website content and found ` +
        `${websiteSummary.linkCount} links.`;
    }

    const finishedAt =
      new Date();

    const durationMs =
      finishedAt.getTime() -
      startedAt.getTime();

    const nextSyncAt =
      calculateNextSyncAt(
        finishedAt,
        source.sync_frequency_minutes
      );

    const existingConfiguration =
      isRecord(
        source.configuration
      )
        ? source.configuration
        : {};

    const updatedConfiguration =
      {
        ...existingConfiguration,

        last_sync: {
          success: true,

          started_at:
            startedAt.toISOString(),

          finished_at:
            finishedAt.toISOString(),

          duration_ms:
            durationMs,

          connector_kind:
            connectorResult.kind,

          summary,

          import:
            importSummary
              ? {
                  parser:
                    importSummary.parser,

                  fleet:
                    importSummary.fleet,

                  availability:
                    importSummary.availability,
                }
              : null,
        },
      };

    const {
      error: updateError,
    } = await admin
      .from("data_sources")
      .update({
        status:
          "healthy",

        next_sync_at:
          nextSyncAt,

        configuration:
          updatedConfiguration,
      })
      .eq(
        "id",
        source.id
      )
      .eq(
        "company_id",
        workspace.companyId
      );

    if (updateError) {
      throw new Error(
        `Source data imported, but the final source state could not be saved: ${updateError.message}`
      );
    }

    const {
      error: activityError,
    } = await admin
      .from("activities")
      .insert({
        company_id:
          workspace.companyId,

        actor_user_id:
          workspace.userId,

        source_id:
          source.id,

        activity_type:
          "data_source_synced",

        title:
          `${source.name} synchronized`,

        description:
          activityDescription,

        metadata: {
          source_type:
            source.source_type,

          connector_kind:
            connectorResult.kind,

          duration_ms:
            durationMs,

          summary,

          import:
            importSummary
              ? {
                  parser:
                    importSummary.parser,

                  fleet:
                    importSummary.fleet,

                  availability:
                    importSummary.availability,
                }
              : null,
        },
      });

    if (activityError) {
      console.error(
        "Failed to save sync activity:",
        activityError
      );
    }

    return NextResponse.json({
      success: true,

      source: {
        id:
          source.id,

        name:
          source.name,

        type:
          source.source_type,

        url:
          source.source_url,
      },

      sync: {
        startedAt:
          startedAt.toISOString(),

        finishedAt:
          finishedAt.toISOString(),

        durationMs,

        nextSyncAt,
      },

      result: {
        kind:
          connectorResult.kind,

        summary,

        preview,

        import:
          importSummary
            ? {
                parser:
                  importSummary.parser,

                fleet:
                  importSummary.fleet,

                availability:
                  importSummary.availability,
              }
            : null,
      },
    });
  } catch (error) {
    const accessResponse =
      createAccessErrorResponse(error);

    if (accessResponse) {
      return accessResponse;
    }

    const message =
      error instanceof Error
        ? error.message
        : "An unexpected synchronization error occurred.";

    if (failureContext) {
      try {
        await markSyncFailed({
          admin: failureContext.admin,
          companyId: failureContext.companyId,
          userId: failureContext.userId,
          source: failureContext.source,
          message,
          startedAt,
        });
      } catch (statusError) {
        console.error(
          "Could not persist the failed synchronization state:",
          statusError
        );
      }
    }

    console.error(
      "Unexpected data source sync error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}

function createAccessErrorResponse(
  error: unknown
): NextResponse | null {
  if (isAuthenticationRequiredError(error)) {
    return NextResponse.json(
      {
        success: false,
        code: error.code,
        error: error.message,
      },
      {
        status: error.status,
      }
    );
  }

  if (isWorkspaceAccessError(error)) {
    return NextResponse.json(
      {
        success: false,
        code: error.code,
        error: error.message,
      },
      {
        status: error.status,
      }
    );
  }

  return null;
}

function buildWorkbookSummary(
  result: WorkbookResult
) {
  const sheets =
    result.workbook.sheets;

  const populatedCellCount =
    sheets.reduce(
      (
        total,
        sheet
      ) =>
        total +
        sheet.cells.length,
      0
    );

  const styledCellCount =
    sheets.reduce(
      (
        total,
        sheet
      ) => {
        const styledCells =
          sheet.cells.filter(
            (cell) =>
              Boolean(
                cell.fill
              ) ||
              cell.styleId !==
                undefined ||
              Boolean(
                cell.numberFormat
              )
          );

        return (
          total +
          styledCells.length
        );
      },
      0
    );

  const formulaCellCount =
    sheets.reduce(
      (
        total,
        sheet
      ) => {
        const formulaCells =
          sheet.cells.filter(
            (cell) =>
              Boolean(
                cell.formula
              )
          );

        return (
          total +
          formulaCells.length
        );
      },
      0
    );

  const mergeCount =
    sheets.reduce(
      (
        total,
        sheet
      ) =>
        total +
        sheet.merges.length,
      0
    );

  const recordCount =
    sheets.reduce(
      (
        total,
        sheet
      ) =>
        total +
        sheet.records.length,
      0
    );

  return {
    sourceType:
      result.sourceType,

    fileName:
      result.fileName,

    sheetCount:
      result.workbook.sheetCount,

    sheetNames:
      result.workbook.sheetNames,

    rowCount:
      result.workbook.rowCount,

    populatedCellCount,

    styledCellCount,

    formulaCellCount,

    mergeCount,

    recordCount,
  };
}

function buildWorkbookPreview(
  result: WorkbookResult
): Record<
  string,
  unknown
> {
  return {
    fileName:
      result.fileName,

    sheets:
      result.workbook.sheets.map(
        (sheet) => {
          const styledCells =
            sheet.cells.filter(
              (cell) =>
                Boolean(
                  cell.fill
                ) ||
                cell.styleId !==
                  undefined ||
                Boolean(
                  cell.numberFormat
                )
            );

          return {
            name:
              sheet.name,

            range:
              sheet.range,

            rowCount:
              sheet.rowCount,

            columnCount:
              sheet.columnCount,

            sampleRows:
              sheet.matrix
                .slice(0, 12)
                .map(
                  (row) =>
                    row.slice(
                      0,
                      14
                    )
                ),

            sampleRecords:
              sheet.records.slice(
                0,
                10
              ),

            sampleCells:
              sheet.cells.slice(
                0,
                40
              ),

            styledCells:
              styledCells.slice(
                0,
                40
              ),

            merges:
              sheet.merges.slice(
                0,
                30
              ),
          };
        }
      ),
  };
}

function buildWebsiteSummary(
  result: WebsiteResult
) {
  return {
    sourceType:
      result.sourceType,

    url:
      result.url,

    title:
      result.title,

    characterCount:
      result.text.length,

    linkCount:
      result.links.length,

    jsonLdCount:
      result.jsonLd.length,
  };
}

function buildWebsitePreview(
  result: WebsiteResult
): Record<
  string,
  unknown
> {
  return {
    url:
      result.url,

    title:
      result.title,

    description:
      result.description,

    textPreview:
      result.text.slice(
        0,
        5000
      ),

    links:
      result.links.slice(
        0,
        50
      ),

    jsonLd:
      result.jsonLd.slice(
        0,
        10
      ),
  };
}

function applySourceNameFallbacks(
  parsed: ReturnType<
    typeof parseYachtWorkbook
  >,
  sourceName: string
): ReturnType<
  typeof parseYachtWorkbook
> {
  const replacementName =
    sourceName.trim();

  if (!replacementName) {
    return parsed;
  }

  const renamedSourceKeys =
    new Set<string>();

  const yachts = parsed.yachts.map(
    (yacht) => {
      if (
        !isFallbackYachtName(
          yacht.name
        )
      ) {
        return yacht;
      }

      renamedSourceKeys.add(
        yacht.sourceKey
      );

      return {
        ...yacht,
        name: replacementName,
      };
    }
  );

  const availability =
    parsed.availability.map(
      (window) => {
        const shouldRename =
          renamedSourceKeys.has(
            window.yachtSourceKey
          ) ||
          isFallbackYachtName(
            window.yachtName
          );

        if (!shouldRename) {
          return window;
        }

        return {
          ...window,
          yachtName:
            replacementName,
        };
      }
    );

  return {
    ...parsed,
    yachts,
    availability,
  };
}

function isFallbackYachtName(
  value: unknown
): boolean {
  if (typeof value !== "string") {
    return true;
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  if (!normalized) {
    return true;
  }

  if (
    normalized ===
      "imported yacht" ||
    normalized ===
      "unknown yacht" ||
    normalized ===
      "unnamed yacht" ||
    normalized ===
      "yacht"
  ) {
    return true;
  }

  return /^website table\s+\d+$/i.test(
    normalized
  );
}

function calculateNextSyncAt(
  currentDate: Date,
  syncFrequencyMinutes:
    | number
    | null
    | undefined
) {
  const frequency =
    typeof syncFrequencyMinutes ===
      "number" &&
    Number.isFinite(
      syncFrequencyMinutes
    ) &&
    syncFrequencyMinutes >=
      5
      ? syncFrequencyMinutes
      : 15;

  return new Date(
    currentDate.getTime() +
      frequency *
        60 *
        1000
  ).toISOString();
}

function isRecord(
  value: unknown
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

async function markSyncFailed({
  admin,
  companyId,
  userId,
  source,
  message,
  startedAt,
}: {
  admin: ReturnType<typeof createAdminClient>;

  companyId: string;

  userId: string;

  source: DataSourceRow;

  message: string;

  startedAt: Date;
}) {
  const finishedAt =
    new Date();

  const existingConfiguration =
    isRecord(
      source.configuration
    )
      ? source.configuration
      : {};

  const nextSyncAt =
    calculateNextSyncAt(
      finishedAt,
      source.sync_frequency_minutes
    );

  const failedConfiguration =
    {
      ...existingConfiguration,

      last_sync: {
        success: false,

        started_at:
          startedAt.toISOString(),

        finished_at:
          finishedAt.toISOString(),

        duration_ms:
          finishedAt.getTime() -
          startedAt.getTime(),

        error:
          message,
      },
    };

  const {
    error: updateError,
  } = await admin
    .from("data_sources")
    .update({
      status:
        "error",

      next_sync_at:
        nextSyncAt,

      configuration:
        failedConfiguration,
    })
    .eq(
      "id",
      source.id
    )
    .eq(
      "company_id",
      companyId
    );

  if (updateError) {
    throw new Error(
      `Failed to save the source failure state: ${updateError.message}`
    );
  }

  const {
    error: activityError,
  } = await admin
    .from("activities")
    .insert({
      company_id:
        companyId,

      actor_user_id:
        userId,

      source_id:
        source.id,

      activity_type:
        "data_source_sync_failed",

      title:
        `${source.name} synchronization failed`,

      description:
        message,

      metadata: {
        source_type:
          source.source_type,

        error:
          message,
      },
    });

  if (activityError) {
    console.error(
      "Failed to save sync failure activity:",
      activityError
    );
  }
}