"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  provisionWorkspaceForUser,
} from "@/lib/workspace/provision-workspace";

export type ConfirmSignupState = {
  status: "idle" | "error";
  message: string | null;
};

export async function confirmSignup(
  _previousState: ConfirmSignupState,
  formData: FormData
): Promise<ConfirmSignupState> {
  const tokenHash = readString(
    formData.get("token_hash")
  );

  const typeValue = readString(
    formData.get("type")
  );

  const nextPath = normalizeNextPath(
    formData.get("next")
  );

  if (!tokenHash || !typeValue) {
    return {
      status: "error",
      message:
        "This confirmation link is missing required verification details. Request a new signup email and try again.",
    };
  }

  const type =
    typeValue as EmailOtpType;

  const supabase =
    await createClient();

  const {
    data,
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

    return {
      status: "error",
      message:
        "This confirmation link is no longer valid. Request a fresh signup email and try again.",
    };
  }

  const user =
    data.user ??
    (
      await supabase.auth.getUser()
    ).data.user;

  if (!user) {
    return {
      status: "error",
      message:
        "Your email was verified, but Bahari OS could not load the new account.",
    };
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

    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Bahari OS could not create the company workspace.",
    };
  }

  redirect(
    `/onboarding?next=${encodeURIComponent(
      nextPath
    )}`
  );
}

function readString(
  value: FormDataEntryValue | null
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeNextPath(
  value: FormDataEntryValue | null
) {
  if (
    typeof value === "string" &&
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