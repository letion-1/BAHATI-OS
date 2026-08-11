import { NextResponse } from "next/server";

import {
  createEmailOAuthState,
} from "@/lib/email/token-crypto";
import {
  createGoogleEmailAuthorizationUrl,
} from "@/lib/email/google";
import {
  getCurrentWorkspace,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspace =
      await getCurrentWorkspace();

    const state = createEmailOAuthState({
      companyId: workspace.companyId,
      userId: workspace.userId,
      returnTo: "/email",
    });

    const url =
      createGoogleEmailAuthorizationUrl(
        state
      );

    return NextResponse.redirect(url);
  } catch (error) {
    console.error(
      "Google email connect error:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Could not start Google connection.";

    return NextResponse.redirect(
      new URL(
        `/email?oauthError=${encodeURIComponent(
          message
        )}`,
        getAppOrigin()
      )
    );
  }
}

function getAppOrigin(): string {
  const redirectUri =
    process.env.GOOGLE_EMAIL_REDIRECT_URI;

  if (redirectUri) {
    try {
      return new URL(
        redirectUri
      ).origin;
    } catch {
      // Continue to fallback.
    }
  }

  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}