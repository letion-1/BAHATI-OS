import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { executeDeletion } from "@/lib/gdpr/execute-deletion";
import type { DeletionScope } from "@/lib/gdpr/execute-deletion";

/**
 * Runs erasure requests whose grace period has elapsed.
 *
 * Meant to be called on a schedule, once a day is ample. Vercel Cron, or any
 * scheduler that can send a header.
 *
 * NOT PROTECTED BY A SESSION
 *
 * There is no user here, so the usual workspace check does not apply. It is
 * guarded by a shared secret compared in constant time instead. This endpoint
 * permanently destroys data across every tenant, so an unauthenticated route
 * would be the most dangerous thing in the codebase.
 *
 * If CRON_SECRET is unset the route refuses every request rather than running
 * open. A deployment that forgot to configure it should do nothing, not
 * everything.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One at a time. A run that deletes half a tenant then times out is worse
 * than one that gets through fewer tenants and finishes each. */
const MAX_PER_RUN = 5;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error("CRON_SECRET is not set; deletion worker refused to run.");
    return false;
  }

  const header = request.headers.get("authorization") ?? "";

  const expected = `Bearer ${secret}`;

  /*
   * Constant time. A plain === leaks the position of the first differing
   * byte through timing, which over enough attempts recovers the secret.
   */
  const given = Buffer.from(header);
  const want = Buffer.from(expected);

  if (given.length !== want.length) {
    return false;
  }

  return timingSafeEqual(given, want);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Not authorized." },
      { status: 401 }
    );
  }

  const admin = createAdminClient();

  const now = new Date().toISOString();

  const due = await admin
    .from("deletion_requests")
    .select("id, company_id, scope")
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(MAX_PER_RUN);

  if (due.error) {
    console.error("Could not read due deletions:", due.error);

    return NextResponse.json(
      { success: false, error: "Could not read the queue." },
      { status: 500 }
    );
  }

  const results: { id: string; status: string; error?: string }[] = [];

  for (const item of due.data ?? []) {
    /*
     * Claimed with a conditional update, so two overlapping worker runs
     * cannot both take the same request. The second update matches no rows
     * and the request is skipped.
     */
    const claim = await admin
      .from("deletion_requests")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("status", "pending")
      .select("id");

    if (claim.error || !claim.data?.length) {
      continue;
    }

    try {
      const outcome = await executeDeletion({
        admin,
        companyId: item.company_id,
        scope: item.scope as DeletionScope,
      });

      await admin
        .from("deletion_requests")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          execution_log: outcome,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      results.push({ id: item.id, status: "completed" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown failure";

      /*
       * Left as 'failed' rather than reset to 'pending'. A cascade that threw
       * halfway has already removed some rows, so retrying it blindly would
       * run the earlier passes against a tenant that is now inconsistent.
       * This wants a human to look at execution_log and decide.
       */
      await admin
        .from("deletion_requests")
        .update({
          status: "failed",
          error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      console.error(`Deletion ${item.id} failed:`, error);

      results.push({ id: item.id, status: "failed", error: message });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    results,
  });
}