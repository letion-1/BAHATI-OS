"use server";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
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

  const fieldErrors: Record<
    string,
    string
  > = {};

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

  if (
    Object.keys(fieldErrors).length >
    0
  ) {
    return {
      status: "error",
      message:
        "Check the highlighted account details.",
      fieldErrors,
    };
  }

  const existingUser =
    await findAuthUserByEmail(email);

  if (existingUser) {
    const isConfirmed =
      Boolean(
        existingUser.email_confirmed_at
      ) ||
      Boolean(
        existingUser.confirmed_at
      );

    return {
      status: "error",
      message: isConfirmed
        ? "A Yacht OS account already exists with this email. Sign in instead."
        : "An account already exists with this email and is waiting for email confirmation. Open the latest confirmation email before signing in.",
      fieldErrors: {
        email: isConfirmed
          ? "Account already exists."
          : "Confirmation is still pending.",
      },
    };
  }

  const supabase =
    await createClient();

  const {
    data,
    error,
  } =
    await supabase.auth.signUp({
      email,
      password,
      options: {
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

    const normalizedMessage =
      error.message.toLowerCase();

    return {
      status: "error",
      message:
        error.status === 429
          ? "Too many signup attempts. Wait a moment and try again."
          : normalizedMessage.includes(
                "already registered"
              ) ||
              normalizedMessage.includes(
                "already exists"
              )
            ? "A Yacht OS account already exists with this email. Sign in instead."
            : "Yacht OS could not create the account. Check the details and try again.",
    };
  }

  if (data.user && data.session) {
    await provisionWorkspaceForUser({
      userId: data.user.id,
      email:
        data.user.email ?? email,
      companyName,
    });

    redirect(
      "/onboarding?next=%2F"
    );
  }

  return {
    status: "success",
    message:
      "Check your inbox and confirm your email address to finish creating your Yacht OS workspace.",
    email,
  };
}

async function findAuthUserByEmail(
  email: string
): Promise<User | null> {
  const admin =
    createAdminClient();

  const target =
    email.trim().toLowerCase();

  const perPage = 1000;
  let page = 1;

  while (page <= 100) {
    const {
      data,
      error,
    } =
      await admin.auth.admin.listUsers({
        page,
        perPage,
      });

    if (error) {
      console.error(
        "Could not inspect existing Supabase Auth users:",
        error.message
      );

      return null;
    }

    const found =
      data.users.find(
        (user) =>
          user.email
            ?.trim()
            .toLowerCase() === target
      );

    if (found) {
      return found;
    }

    if (
      data.users.length < perPage
    ) {
      return null;
    }

    page += 1;
  }

  return null;
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