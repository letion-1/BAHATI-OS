import { NextResponse } from "next/server";

import {
  isAuthenticationRequiredError,
} from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspace =
      await getCurrentWorkspace();

    const admin =
      createAdminClient();

    const result = await admin
      .from("email_connections")
      .select(
        "id, email_address, status, token_expires_at, updated_at"
      )
      .eq(
        "company_id",
        workspace.companyId
      )
      .eq("provider", "gmail")
      .maybeSingle();

    if (result.error) {
      throw new Error(
        `Could not load Gmail connection: ${result.error.message}`
      );
    }

    if (!result.data) {
      return NextResponse.json(
        {
          success: true,
          connection: {
            connected: false,
            emailAddress: null,
            status: "disconnected",
          },
        },
        {
          status: 200,
          headers: {
            "Cache-Control":
              "private, no-store, max-age=0",
          },
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        connection: {
          connected:
            result.data.status ===
            "connected",
          emailAddress:
            result.data.email_address,
          status:
            result.data.status,
          tokenExpiresAt:
            result.data.token_expires_at,
          updatedAt:
            result.data.updated_at,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    if (
      isAuthenticationRequiredError(
        error
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        {
          status: error.status,
        }
      );
    }

    if (
      isWorkspaceAccessError(error)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        {
          status: error.status,
        }
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Could not load Gmail connection.";

    console.error(
      "Gmail status error:",
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