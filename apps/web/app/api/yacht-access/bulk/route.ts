import { NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAccessProfile } from "@/lib/data-sources/importer/access-profiles";

/**
 * Set the access classification on many yachts at once.
 *
 * The single-yacht endpoint at /api/yacht-access exists and works. This is for
 * the case that actually happens: a hundred hulls arrive in one spreadsheet,
 * eight of them are managed by this brokerage and the rest are not, and the
 * broker needs to tick eight and set them. Doing that one request at a time
 * would be a hundred round trips to correct eight rows.
 *
 * Everything written here is flagged is_overridden, because it is a decision a
 * person made about a specific yacht. The importer skips those, so the choice
 * survives every future sync of the source it came from.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Enough for a large fleet in one request, small enough that a malformed or
 * hostile payload cannot ask the database to rewrite an unbounded number of
 * rows in a single statement.
 */
const MAX_YACHTS = 250;

const ACCESS_TYPES = [
  "controlled",
  "managed",
  "broker_access",
  "reference",
];

export async function PATCH(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();

    const body = (await request.json().catch(() => ({}))) as {
      yachtIds?: unknown;
      accessType?: unknown;
      clearOverride?: unknown;
    };

    const yachtIds = Array.isArray(body.yachtIds)
      ? body.yachtIds.filter(
          (value): value is string => typeof value === "string"
        )
      : [];

    if (yachtIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Select at least one yacht." },
        { status: 400 }
      );
    }

    if (yachtIds.length > MAX_YACHTS) {
      return NextResponse.json(
        {
          success: false,
          error: `Up to ${MAX_YACHTS} yachts can be updated at once.`,
        },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    /*
     * Confirm every yacht belongs to this workspace before writing anything.
     *
     * The update is scoped by company_id and would silently skip foreign rows,
     * but silently is the problem: a broker who selected a yacht they cannot
     * see should get an error rather than a success reporting fewer rows than
     * they chose.
     */
    const owned = await admin
      .from("fleet")
      .select("id")
      .eq("company_id", workspace.companyId)
      .in("id", yachtIds);

    if (owned.error) {
      throw new Error(owned.error.message);
    }

    if ((owned.data?.length ?? 0) !== yachtIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: "One or more of those yachts is not in this workspace.",
        },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    /*
     * Clearing an override returns the yacht to its source's default rather
     * than deleting the profile. A yacht with no profile at all is treated as
     * reference by the proposal route, which would look like the clear had
     * silently restricted it instead of releasing it.
     */
    if (body.clearOverride === true) {
      const cleared = await admin
        .from("yacht_access_profiles")
        .update({
          is_overridden: false,
          overridden_by: null,
          overridden_at: null,
          updated_at: now,
        })
        .eq("company_id", workspace.companyId)
        .in("fleet_id", yachtIds)
        .select("fleet_id");

      if (cleared.error) {
        throw new Error(cleared.error.message);
      }

      return NextResponse.json({
        success: true,
        cleared: cleared.data?.length ?? 0,
        message:
          "These yachts will follow their source's classification again from the next sync.",
      });
    }

    const accessType =
      typeof body.accessType === "string" &&
      ACCESS_TYPES.includes(body.accessType)
        ? body.accessType
        : null;

    if (!accessType) {
      return NextResponse.json(
        {
          success: false,
          error: `Access type must be one of: ${ACCESS_TYPES.join(", ")}.`,
        },
        { status: 400 }
      );
    }

    /*
     * Derived through the same function the importer uses, so a yacht set to
     * 'managed' by hand gets exactly the permissions a managed source would
     * have given it. Two code paths deciding what 'managed' means is how they
     * drift apart.
     */
    const resolved = resolveAccessProfile({
      access_type: accessType,
      calendar_authority: null,
      booking_model: null,
    });

    const rows = yachtIds.map((fleetId) => ({
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
      is_overridden: true,
      overridden_by: workspace.userId,
      overridden_at: now,
    }));

    const { data, error } = await admin
      .from("yacht_access_profiles")
      .upsert(rows, { onConflict: "company_id,fleet_id" })
      .select("fleet_id");

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      updated: data?.length ?? rows.length,
      accessType: resolved.accessType,
      clientProposalPermission: resolved.clientProposalPermission,
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

    console.error("Bulk access update failed:", error);

    return NextResponse.json(
      { success: false, error: "Could not update those yachts." },
      { status: 500 }
    );
  }
}