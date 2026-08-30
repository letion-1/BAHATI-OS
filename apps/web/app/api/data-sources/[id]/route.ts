import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  isAuthenticationRequiredError,
} from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAccessProfile } from "@/lib/data-sources/importer/access-profiles";
import { createClient } from "@/lib/supabase/server";
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

type IdRow = {
  id: string;
};

/** Matches migration 0016's constraint and the enums in /api/yacht-access. */
const SOURCE_ACCESS_TYPES = [
  "controlled",
  "managed",
  "broker_access",
  "reference",
];

/**
 * Set or change a source's access classification.
 *
 * Every yacht imported from the source inherits this, so changing it is a
 * change to what the brokerage may do with forty hulls at once. The existing
 * profiles are not rewritten here: they are refreshed on the next sync, which
 * keeps one code path responsible for writing profiles instead of two that
 * can drift.
 *
 * The response says so, because a broker who changes this expects it to take
 * effect and would otherwise find the old classification still applying.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const workspace = await getCurrentWorkspace();
    const { id } = await context.params;

    const body = (await request.json().catch(() => ({}))) as {
      accessType?: unknown;
    };

    const accessType =
      typeof body.accessType === "string" &&
      SOURCE_ACCESS_TYPES.includes(body.accessType)
        ? body.accessType
        : null;

    /*
     * Null is a valid value: a broker can un-classify a source they set by
     * mistake, and the yachts fall back to reference-only on the next sync.
     * So the check is for a value that was supplied and unrecognised, not for
     * absence.
     */
    if (body.accessType !== undefined && accessType === null) {
      return NextResponse.json(
        {
          success: false,
          error: `Access type must be one of: ${SOURCE_ACCESS_TYPES.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("data_sources")
      .update({
        access_type: accessType,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", workspace.companyId)
      .select("id, name, access_type")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: "Data source not found." },
        { status: 404 }
      );
    }

    /*
     * Applied to existing yachts immediately rather than waiting for a sync.
     *
     * An uploaded PDF has nothing to re-sync against, so "it will apply next
     * sync" would mean never for exactly the sources a broker is most likely
     * to be classifying. Waiting would make the setting a promise rather than
     * an action.
     *
     * Yachts a person classified by hand are excluded: that is the whole
     * point of the override flag, and a source-level change must not quietly
     * undo a per-yacht decision.
     */
    const resolved = resolveAccessProfile({
      access_type: accessType,
      calendar_authority: null,
      booking_model: null,
    });

    const fleetRows = await admin
      .from("fleet")
      .select("id")
      .eq("company_id", workspace.companyId)
      .eq("source_id", id);

    if (fleetRows.error) {
      throw new Error(fleetRows.error.message);
    }

    const fleetIds = (fleetRows.data ?? []).map(
      (row) => row.id as string
    );

    let applied = 0;

    if (fleetIds.length > 0) {
      const overridden = await admin
        .from("yacht_access_profiles")
        .select("fleet_id")
        .eq("company_id", workspace.companyId)
        .eq("is_overridden", true)
        .in("fleet_id", fleetIds);

      if (overridden.error) {
        throw new Error(overridden.error.message);
      }

      const skip = new Set(
        (overridden.data ?? []).map((row) => row.fleet_id as string)
      );

      const now = new Date().toISOString();

      const rows = fleetIds
        .filter((fleetId) => !skip.has(fleetId))
        .map((fleetId) => ({
          company_id: workspace.companyId,
          fleet_id: fleetId,
          access_type: resolved.accessType,
          calendar_authority: resolved.calendarAuthority,
          booking_model: resolved.bookingModel,
          client_proposal_permission: resolved.clientProposalPermission,
          public_listing_permission: resolved.publicListingPermission,
          notes: null,
          created_by: workspace.userId,
          created_at: now,
          updated_at: now,
          is_overridden: false,
        }));

      if (rows.length > 0) {
        const applyResult = await admin
          .from("yacht_access_profiles")
          .upsert(rows, { onConflict: "company_id,fleet_id" })
          .select("fleet_id");

        if (applyResult.error) {
          throw new Error(applyResult.error.message);
        }

        applied = applyResult.data?.length ?? rows.length;
      }
    }

    return NextResponse.json({
      success: true,
      source: data,
      appliedToYachts: applied,
      message:
        applied > 0
          ? `Applied to ${applied} ${applied === 1 ? "yacht" : "yachts"}. Yachts you set individually keep their own classification.`
          : "Saved. It will apply to yachts as they are imported.",
    });
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

    console.error("Could not update the data source:", error);

    return NextResponse.json(
      { success: false, error: "Could not update the data source." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id: sourceId } =
      await context.params;

    if (!sourceId?.trim()) {
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

    /*
     * Authorize with the signed-in user's RLS-aware client first.
     * The admin client is used only after ownership has been proven.
     */
    const userClient =
      await createClient();

    const {
      data: source,
      error: sourceError,
    } = await userClient
      .from("data_sources")
      .select("id, name")
      .eq("id", sourceId)
      .eq(
        "company_id",
        workspace.companyId
      )
      .maybeSingle();

    if (sourceError) {
      throw new Error(
        `Could not verify the data source: ${sourceError.message}`
      );
    }

    if (!source) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Data source was not found.",
        },
        {
          status: 404,
        }
      );
    }

    const admin =
      createAdminClient();

    const [
      fleetResult,
      documentResult,
    ] = await Promise.all([
      admin
        .from("fleet")
        .select("id")
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq("source_id", sourceId),

      admin
        .from("documents")
        .select("id")
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq("source_id", sourceId),
    ]);

    if (fleetResult.error) {
      throw new Error(
        `Could not identify imported yachts: ${fleetResult.error.message}`
      );
    }

    if (documentResult.error) {
      throw new Error(
        `Could not identify imported documents: ${documentResult.error.message}`
      );
    }

    const fleetIds = (
      (fleetResult.data ?? []) as IdRow[]
    ).map((row) => row.id);

    const documentIds = (
      (documentResult.data ?? []) as IdRow[]
    ).map((row) => row.id);

    /*
     * Delete children before parents.
     * This permanently removes records imported from the selected source.
     */
    if (
      fleetIds.length > 0 ||
      documentIds.length > 0
    ) {
      const assetFilters: string[] = [];

      if (fleetIds.length > 0) {
        assetFilters.push(
          `fleet_id.in.(${fleetIds.join(",")})`
        );
      }

      if (documentIds.length > 0) {
        assetFilters.push(
          `document_id.in.(${documentIds.join(",")})`
        );
      }

      const {
        error: assetDeleteError,
      } = await admin
        .from("proposal_assets")
        .delete()
        .eq(
          "company_id",
          workspace.companyId
        )
        .or(assetFilters.join(","));

      if (assetDeleteError) {
        throw new Error(
          `Could not delete source proposal assets: ${assetDeleteError.message}`
        );
      }
    }

    const availabilityQuery = admin
      .from("availability")
      .delete()
      .eq(
        "company_id",
        workspace.companyId
      );

    const {
      error: availabilityDeleteError,
    } =
      fleetIds.length > 0
        ? await availabilityQuery.or(
            [
              `source_id.eq.${sourceId}`,
              `fleet_id.in.(${fleetIds.join(",")})`,
            ].join(",")
          )
        : await availabilityQuery.eq(
            "source_id",
            sourceId
          );

    if (availabilityDeleteError) {
      throw new Error(
        `Could not delete source availability: ${availabilityDeleteError.message}`
      );
    }

    const documentsQuery = admin
      .from("documents")
      .delete()
      .eq(
        "company_id",
        workspace.companyId
      );

    const {
      error: documentDeleteError,
    } =
      fleetIds.length > 0
        ? await documentsQuery.or(
            [
              `source_id.eq.${sourceId}`,
              `fleet_id.in.(${fleetIds.join(",")})`,
            ].join(",")
          )
        : await documentsQuery.eq(
            "source_id",
            sourceId
          );

    if (documentDeleteError) {
      throw new Error(
        `Could not delete source documents: ${documentDeleteError.message}`
      );
    }

    const activitiesQuery = admin
      .from("activities")
      .delete()
      .eq(
        "company_id",
        workspace.companyId
      );

    const {
      error: activityDeleteError,
    } =
      fleetIds.length > 0
        ? await activitiesQuery.or(
            [
              `source_id.eq.${sourceId}`,
              `fleet_id.in.(${fleetIds.join(",")})`,
            ].join(",")
          )
        : await activitiesQuery.eq(
            "source_id",
            sourceId
          );

    if (activityDeleteError) {
      throw new Error(
        `Could not delete source activities: ${activityDeleteError.message}`
      );
    }

    if (fleetIds.length > 0) {
      const {
        error: fleetDeleteError,
      } = await admin
        .from("fleet")
        .delete()
        .eq(
          "company_id",
          workspace.companyId
        )
        .in("id", fleetIds);

      if (fleetDeleteError) {
        throw new Error(
          `Could not delete imported yachts: ${fleetDeleteError.message}`
        );
      }
    }

    const {
      error: sourceDeleteError,
    } = await admin
      .from("data_sources")
      .delete()
      .eq("id", sourceId)
      .eq(
        "company_id",
        workspace.companyId
      );

    if (sourceDeleteError) {
      throw new Error(
        `Could not delete the data source: ${sourceDeleteError.message}`
      );
    }

    return NextResponse.json({
      success: true,
      removedSourceId: sourceId,
      removedSourceName: source.name,
      deleted: {
        yachts: fleetIds.length,
        documents: documentIds.length,
      },
    });
  } catch (error) {
    const accessResponse =
      createAccessErrorResponse(error);

    if (accessResponse) {
      return accessResponse;
    }

    console.error(
      "Unexpected hard-delete data source error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "The data source could not be removed.",
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
  if (
    isAuthenticationRequiredError(
      error
    )
  ) {
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

  if (
    isWorkspaceAccessError(
      error
    )
  ) {
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