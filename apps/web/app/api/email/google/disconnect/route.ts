import { NextResponse } from "next/server";

import {
  isAuthenticationRequiredError,
} from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptEmailToken,
} from "@/lib/email/token-crypto";
import {
  revokeGoogleToken,
} from "@/lib/email/google";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const workspace =
      await getCurrentWorkspace();

    const admin =
      createAdminClient();

    const result = await admin
      .from("email_connections")
      .select(
        "id, refresh_token_encrypted"
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
      return NextResponse.json({
        success: true,
      });
    }

    try {
      const token =
        decryptEmailToken(
          result.data
            .refresh_token_encrypted
        );

      await revokeGoogleToken(token);
    } catch (error) {
      console.warn(
        "Google token revocation warning:",
        error
      );
    }

    const deleteResult = await admin
      .from("email_connections")
      .delete()
      .eq(
        "company_id",
        workspace.companyId
      )
      .eq("provider", "gmail");

    if (deleteResult.error) {
      throw new Error(
        `Could not disconnect Gmail: ${deleteResult.error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
      },
      {
        status: 200,
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
        : "Could not disconnect Gmail.";

    console.error(
      "Gmail disconnect error:",
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