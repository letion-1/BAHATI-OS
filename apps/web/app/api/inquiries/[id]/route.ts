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