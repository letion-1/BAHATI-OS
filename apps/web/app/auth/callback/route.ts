import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  provisionWorkspaceForUser,
} from "@/lib/workspace/provision-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request
) {
  const url = new URL(request.url);
  const origin = url.origin;

  const code =
    url.searchParams.get("code");

  const providerError =
    url.searchParams.get(
      "error_description"
    ) ??
    url.searchParams.get("error");

  const next =
    normalizeNextPath(
      url.searchParams.get("next")
    );

  if (providerError) {
    return redirectToSignupError(
      origin,
      providerError
    );
  }

  if (!code) {
    return redirectToSignupError(
      origin,
      "The verification link is missing its authentication code. Request a new signup email and try again."
    );
  }

  const supabase =
    await createClient();

  const {
    error: exchangeError,
  } =
    await supabase.auth
      .exchangeCodeForSession(code);

  if (exchangeError) {
    console.error(
      "Supabase signup callback exchange failed:",
      exchangeError.message
    );

    return redirectToSignupError(
      origin,
      "The verification link could not be completed. It may have expired or already been used."
    );
  }

  const {
    data: { user },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    console.error(
      "Verified signup user could not be loaded:",
      userError?.message
    );

    return redirectToSignupError(
      origin,
      "Your email was verified, but Yacht OS could not load the new account."
    );
  }

  try {
    const metadata =
      isRecord(
        user.user_metadata
      )
        ? user.user_metadata
        : {};

    const companyName =
      readMetadataString(
        metadata,
        "pending_company_name"
      );

    await provisionWorkspaceForUser({
      userId: user.id,
      email: user.email,
      companyName,
    });
  } catch (error) {
    console.error(
      "Workspace provisioning failed after email verification:",
      error
    );

    return redirectToSignupError(
      origin,
      error instanceof Error
        ? error.message
        : "Yacht OS could not create the company workspace."
    );
  }

  return NextResponse.redirect(
    new URL(
      `/onboarding?next=${encodeURIComponent(
        next
      )}`,
      origin
    )
  );
}

function redirectToSignupError(
  origin: string,
  message: string
) {
  return NextResponse.redirect(
    new URL(
      `/sign-up?authError=${encodeURIComponent(
        message
      )}`,
      origin
    )
  );
}

function normalizeNextPath(
  value: string | null
) {
  if (
    value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/login") &&
    !value.startsWith("/sign-up") &&
    !value.startsWith("/auth/")
  ) {
    return value;
  }

  return "/availability";
}

function isRecord(
  value: unknown
): value is Record<
  string,
  unknown
> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readMetadataString(
  record: Record<
    string,
    unknown
  >,
  key: string
) {
  const value =
    record[key];

  return typeof value === "string"
    ? value.trim()
    : null;
}