import { NextRequest, NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
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

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const body = (await request.json().catch(() => ({}))) as {
      read?: unknown;
    };

    const read = body.read !== false;

    const { data, error } = await supabase
      .from("notifications")
      .update({
        read_at: read
          ? new Date().toISOString()
          : null,
      })
      .eq("id", id)
      .eq("company_id", workspace.companyId)
      .select("id,read_at")
      .single();

    if (error || !data) {
      throw new Error(
        `Could not update notification: ${
          error?.message ?? "Notification not found."
        }`
      );
    }

    return NextResponse.json({
      success: true,
      notification: {
        id: data.id,
        readAt: data.read_at,
      },
    });
  } catch (error) {
    return handleRouteError(
      error,
      "Could not update notification."
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("company_id", workspace.companyId);

    if (error) {
      throw new Error(
        `Could not delete notification: ${error.message}`
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return handleRouteError(
      error,
      "Could not delete notification."
    );
  }
}

function handleRouteError(
  error: unknown,
  fallbackMessage: string
) {
  if (isAuthenticationRequiredError(error)) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }

  if (isWorkspaceAccessError(error)) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : fallbackMessage;

  console.error("Notification API failed:", error);

  return NextResponse.json(
    { success: false, error: message },
    { status: 500 }
  );
}