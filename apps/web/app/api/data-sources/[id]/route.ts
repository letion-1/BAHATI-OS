import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  isAuthenticationRequiredError,
} from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
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