"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  provisionWorkspaceForUser,
} from "@/lib/workspace/provision-workspace";

export type SignUpActionState = {
  status: "idle" | "error" | "success";
  message: string | null;
  email?: string;
  fieldErrors?: Record<string, string>;
};

export async function signUp(
  _previousState: SignUpActionState,
  formData: FormData
): Promise<SignUpActionState> {
  const companyName = readString(
    formData.get("companyName")
  );

  const email = readString(
    formData.get("email")
  ).toLowerCase();

  const password = readString(
    formData.get("password")
  );

  const confirmPassword = readString(
    formData.get("confirmPassword")
  );

  const fieldErrors: Record<string, string> = {};

  if (companyName.length < 2) {
    fieldErrors.companyName =
      "Enter your company or brokerage name.";
  }

  if (!isValidEmail(email)) {
    fieldErrors.email =
      "Enter a valid work email address.";
  }

  if (password.length < 8) {
    fieldErrors.password =
      "Use at least 8 characters.";
  }

  if (password !== confirmPassword) {
    fieldErrors.confirmPassword =
      "The passwords do not match.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message:
        "Check the highlighted account details.",
      fieldErrors,
    };
  }

  const supabase = await createClient();
  const origin = await getRequestOrigin();

  const { data, error } =
    await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          `${origin}/auth/callback?next=${encodeURIComponent(
            "/"
          )}`,
        data: {
          pending_company_name:
            companyName,
          signup_source:
            "self_service",
        },
      },
    });

  if (error) {
    console.error(
      "Yacht OS signup failed:",
      error.message
    );

    return {
      status: "error",
      message:
        error.status === 429
          ? "Too many signup attempts. Wait a moment and try again."
          : "Yacht OS could not create the account. Check the details and try again.",
    };
  }

  // Supabase normally returns no session while email confirmation is enabled.
  // If confirmation is disabled in a development environment, provision now.
  if (data.user && data.session) {
    await provisionWorkspaceForUser({
      userId: data.user.id,
      email:
        data.user.email ?? email,
      companyName,
    });

    redirect("/onboarding");
  }

  return {
    status: "success",
    message:
      "Check your inbox and confirm your email address to finish creating your Yacht OS workspace.",
    email,
  };
}

async function getRequestOrigin() {
  const requestHeaders =
    await headers();

  const forwardedHost =
    requestHeaders
      .get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim();

  const host =
    forwardedHost ||
    requestHeaders.get("host")?.trim();

  const forwardedProto =
    requestHeaders
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();

  if (host) {
    const protocol =
      forwardedProto ||
      (host.startsWith("localhost") ||
      host.startsWith("127.0.0.1")
        ? "http"
        : "https");

    return `${protocol}://${host}`;
  }

  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  throw new Error(
    "Could not resolve the Yacht OS application URL."
  );
}

function readString(
  value: FormDataEntryValue | null
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isValidEmail(
  value: string
) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}
