import type { EmailOtpType } from "@supabase/supabase-js";
import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  provisionWorkspaceForUser,
} from "@/lib/workspace/provision-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest
) {
  const { searchParams, origin } =
    new URL(request.url);

  const tokenHash =
    searchParams.get("token_hash");

  const type =
    searchParams.get(
      "type"
    ) as EmailOtpType | null;

  const next =
    normalizeNextPath(
      searchParams.get("next")
    );

  if (!tokenHash || !type) {
    return redirectToSignupError(
      origin,
      "The verification link is missing required confirmation details."
    );
  }

  const supabase =
    await createClient();

  const {
    error: verifyError,
  } =
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

  if (verifyError) {
    console.error(
      "Supabase email verification failed:",
      verifyError.message
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

  if (userError || !user) {
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
    !value.startsWith("/auth/") &&
    !value.startsWith("/onboarding")
  ) {
    return value;
  }

  return "/";
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