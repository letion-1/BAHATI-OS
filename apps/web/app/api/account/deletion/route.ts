import { NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DELETION_GRACE_DAYS } from "@/lib/gdpr/retention";

/**
 * Raise, inspect and cancel an Art. 17 erasure request.
 *
 * The request is recorded here; the cascade runs later, from the worker.
 * Splitting them is what makes the grace period real: between the two there
 * is a month in which a broker who clicked this by mistake can undo it.
 *
 * Art. 12(3) allows one month to respond, so the delay is lawful. Art. 9
 * health data and live share tokens do not wait for it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The pending request, if any, so the UI can show its countdown. */
export async function GET() {
  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("deletion_requests")
      .select(
        "id, scope, status, requested_at, scheduled_for, cancelled_at, completed_at"
      )
      .eq("company_id", workspace.companyId)
      .in("status", ["pending", "processing"])
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, request: data ?? null });
  } catch (error) {
    return handle(error, "Could not load the deletion request.");
  }
}

export async function POST(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();

    /*
     * Owner only. Deleting a workspace erases every colleague's work as well
     * as the requester's, so it is not a decision one member should be able
     * to take alone.
     */
    if (workspace.role !== "owner") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Only the workspace owner can request deletion of the account.",
        },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      scope?: unknown;
      confirmation?: unknown;
      reason?: unknown;
    };

    const scope = body.scope === "member" ? "member" : "company";

    /*
     * Typed confirmation, and it has to be the workspace name. A checkbox is
     * too easy to click through for something with a month-long fuse and an
     * irreversible end, and "DELETE" becomes muscle memory by the third time.
     */
    if (scope === "company") {
      const confirmation =
        typeof body.confirmation === "string" ? body.confirmation : "";

      if (
        confirmation.trim().toLowerCase() !==
        workspace.companyName.trim().toLowerCase()
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Type the workspace name exactly to confirm.",
          },
          { status: 400 }
        );
      }
    }

    const admin = createAdminClient();

    const scheduledFor = new Date();

    scheduledFor.setUTCDate(scheduledFor.getUTCDate() + DELETION_GRACE_DAYS);

    const { data, error } = await admin
      .from("deletion_requests")
      .insert({
        company_id: workspace.companyId,
        scope,
        subject_user_id: scope === "member" ? workspace.userId : null,
        requested_by: workspace.userId,
        reason:
          typeof body.reason === "string" ? body.reason.slice(0, 2000) : null,
        scheduled_for: scheduledFor.toISOString(),
        status: "pending",
      })
      .select("id, scope, status, requested_at, scheduled_for")
      .single();

    /*
     * A unique violation here is the partial index doing its job: a request
     * for this subject is already live. Reported as a conflict rather than a
     * failure, because from the broker's side nothing is wrong.
     */
    if (error?.code === "23505") {
      return NextResponse.json(
        {
          success: false,
          error: "A deletion request is already scheduled for this account.",
        },
        { status: 409 }
      );
    }

    if (error || !data) {
      throw new Error(error?.message ?? "no row returned");
    }

    return NextResponse.json({ success: true, request: data }, { status: 201 });
  } catch (error) {
    return handle(error, "Could not schedule the deletion.");
  }
}

/** Cancel during the grace period. */
export async function DELETE() {
  try {
    const workspace = await getCurrentWorkspace();

    if (workspace.role !== "owner") {
      return NextResponse.json(
        {
          success: false,
          error: "Only the workspace owner can cancel a deletion request.",
        },
        { status: 403 }
      );
    }

    const admin = createAdminClient();

    const now = new Date().toISOString();

    /*
     * Only 'pending' can be cancelled. Once the worker has moved a request to
     * 'processing' the Art. 9 data and share tokens are already gone, and a
     * cancel button at that point would promise a restoration nothing can
     * deliver.
     */
    const { data, error } = await admin
      .from("deletion_requests")
      .update({
        status: "cancelled",
        cancelled_at: now,
        cancelled_by: workspace.userId,
        updated_at: now,
      })
      .eq("company_id", workspace.companyId)
      .eq("status", "pending")
      .select("id");

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.length) {
      return NextResponse.json(
        {
          success: false,
          error:
            "There is no pending request to cancel. If deletion has already started, it cannot be undone.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, cancelled: data.length });
  } catch (error) {
    return handle(error, "Could not cancel the deletion request.");
  }
}

function handle(error: unknown, fallback: string) {
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

  console.error("Deletion request failed:", error);

  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}