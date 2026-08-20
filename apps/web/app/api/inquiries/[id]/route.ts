import { NextRequest, NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
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

const ALLOWED_STATUSES = new Set([
  "new",
  "qualified",
  "proposal_sent",
  "negotiating",
  "won",
  "lost",
]);

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Inquiry ID is required.",
        },
        { status: 400 }
      );
    }

    const body = (await request.json()) as {
      status?: unknown;
    };

    const status =
      typeof body.status === "string"
        ? body.status.trim().toLowerCase()
        : "";

    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid inquiry status.",
        },
        { status: 400 }
      );
    }

    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("inquiries")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", workspace.companyId)
      .select("id, status, client_id, updated_at")
      .single();

    if (error || !data) {
      throw new Error(
        `Could not update inquiry: ${
          error?.message ?? "Inquiry not found."
        }`
      );
    }

    return NextResponse.json(
      {
        success: true,
        inquiry: data,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not update inquiry."
    );
  }
}

function handleRouteError(
  error: unknown,
  fallbackMessage: string
) {
  if (isAuthenticationRequiredError(error)) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: error.status }
    );
  }

  if (isWorkspaceAccessError(error)) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: error.status }
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : fallbackMessage;

  console.error("Inquiry update failed:", error);

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 500 }
  );
}
/**
 * Delete an inquiry.
 *
 * Guarded rather than unconditional. An inquiry is the root of a chain:
 * proposals, documents, email drafts, availability checks and charters can
 * all reference it. Deleting one with a proposal attached would either
 * cascade the proposal away or fail on a foreign key with an opaque database
 * error, and neither is something a broker should discover by accident.
 *
 * So dependents are checked first, and the caller is told exactly what is in
 * the way. Losing a sent proposal because someone tidied up their pipeline is
 * the kind of mistake that costs a booking.
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Inquiry ID is required." },
        { status: 400 }
      );
    }

    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    // Confirm it exists and belongs to this company before anything else, so
    // a wrong ID cannot reveal whether it exists in another workspace.
    const existing = await supabase
      .from("inquiries")
      .select("id, client_name")
      .eq("id", id)
      .eq("company_id", workspace.companyId)
      .maybeSingle();

    if (existing.error) {
      throw new Error(existing.error.message);
    }

    if (!existing.data) {
      return NextResponse.json(
        { success: false, error: "That inquiry could not be found." },
        { status: 404 }
      );
    }

    // Authorisation already happened above. The blocker check runs as admin
    // because the RLS-bound client cannot see `charters` (RLS is enabled on
    // it with no policy), so it returned zero rows and reported no blockers
    // while Postgres went on to reject the delete on a foreign key.
    const blockers = await findBlockingRecords(
      createAdminClient(),
      id,
      workspace.companyId
    );

    if (blockers.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `This inquiry has ${blockers.join(" and ")} attached. Remove those first, or mark the inquiry as lost instead of deleting it.`,
          blockers,
        },
        { status: 409 }
      );
    }

    // `.select()` so the deleted rows come back and a silent no-op cannot be
    // reported as success.
    const deleted = await supabase
      .from("inquiries")
      .delete()
      .eq("id", id)
      .eq("company_id", workspace.companyId)
      .select("id");

    if (deleted.error) {
      // Last line of defence. If a reference exists that the check above does
      // not know about, Postgres raises a foreign key violation whose message
      // is meaningless to a broker.
      if (deleted.error.code === "23503") {
        return NextResponse.json(
          {
            success: false,
            error:
              "This inquiry is still linked to a charter or proposal, so it cannot be deleted. Mark it as lost instead.",
          },
          { status: 409 }
        );
      }

      throw new Error(deleted.error.message);
    }

    if (!deleted.data || deleted.data.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The inquiry could not be deleted. Please refresh and try again.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return handleRouteError(error, "Failed to delete inquiry.");
  }
}

/**
 * Returns human-readable descriptions of anything referencing this inquiry.
 *
 * Each table is checked independently and a missing table is treated as no
 * dependents, because the schema varies between environments and a delete
 * should not fail merely because an optional feature is not installed.
 */
async function findBlockingRecords(
  supabase: ReturnType<typeof createAdminClient>,
  inquiryId: string,
  companyId: string
): Promise<string[]> {
  const blockers: string[] = [];

  // A proposal is not a separate table. It is this same inquiry row with
  // proposal fields populated, so the check is on the row itself rather than
  // on a foreign key.
  //
  // The test is `proposal_created_at`, matching exactly how /api/proposals
  // decides what appears in the Proposals list. `proposal_status` alone is
  // not sufficient: rows exist carrying a status with no proposal ever built,
  // and blocking on those tells a broker their inquiry has a proposal that
  // they cannot see anywhere in the product.
  const self = await supabase
    .from("inquiries")
    .select("proposal_status, proposal_created_at")
    .eq("id", inquiryId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!self.error && self.data?.proposal_created_at) {
    const status = self.data.proposal_status
      ? String(self.data.proposal_status).toLowerCase()
      : null;

    blockers.push(status ? `a ${status} proposal` : "a proposal");
  }

  // Charters reference the inquiry with on delete restrict, so the database
  // would reject this anyway. Catching it here gives a readable reason.
  const charters = await supabase
    .from("charters")
    .select("id", { count: "exact", head: true })
    .eq("proposal_id", inquiryId)
    .eq("company_id", companyId);

  if (!charters.error && charters.count && charters.count > 0) {
    blockers.push(
      charters.count === 1 ? "a charter" : `${charters.count} charters`
    );
  }

  return blockers;
}