"use server";

import { redirect } from "next/navigation";

import { headers } from "next/headers";

import {
  checkRateLimit,
  clientIdentifier,
} from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import {
  provisionWorkspaceForUser,
} from "@/lib/workspace/provision-workspace";

type LoginActionState = {
  status: "idle" | "error";
  message: string | null;
};

type MembershipRow = {
  company_id: string;
  created_at: string;
};

type CompanyOnboardingRow = {
  onboarding_completed_at: string | null;
  operating_model: string | null;
};

export async function login(
  _previousState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const email = readString(
    formData.get("email")
  ).toLowerCase();

  const password = readString(
    formData.get("password")
  );

  const nextPath = normalizeNextPath(
    formData.get("next")
  );

  if (!isValidEmail(email)) {
    return {
      status: "error",
      message: "Enter a valid email address.",
    };
  }

  if (password.length < 6) {
    return {
      status: "error",
      message: "Enter your account password.",
    };
  }

  /*
   * Rate limit before touching the auth provider.
   *
   * Two independent limits, because they defend against different attacks:
   *
   *   per account - stops someone guessing one user's password. Keyed on the
   *                 email, so an attacker cannot dodge it by rotating IPs.
   *   per address - stops credential stuffing, where a leaked list is tried
   *                 one attempt per account across thousands of accounts.
   *
   * Both must pass. The response is identical either way and does not reveal
   * whether the account exists.
   */
  const requestHeaders = await headers();

  const address = clientIdentifier(
    new Request("https://internal", { headers: requestHeaders })
  );

  const perAccount = checkRateLimit(`login:account:${email}`, {
    limit: 5,
    windowSeconds: 300,
  });

  const perAddress = checkRateLimit(`login:address:${address}`, {
    limit: 20,
    windowSeconds: 300,
  });

  if (!perAccount.ok || !perAddress.ok) {
    const wait = Math.max(
      perAccount.retryAfterSeconds,
      perAddress.retryAfterSeconds
    );

    return {
      status: "error",
      message: `Too many sign-in attempts. Please wait ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""} and try again.`,
    };
  }

  const supabase = await createClient();

  const {
    data: signInData,
    error: signInError,
  } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (signInError || !signInData.user) {
    console.error(
      "Supabase sign-in failed:",
      signInError?.message
    );

    const normalizedMessage =
      (
        signInError?.message ?? ""
      ).toLowerCase();

    if (
      normalizedMessage.includes(
        "email not confirmed"
      )
    ) {
      return {
        status: "error",
        message:
          "Your email address has not been confirmed yet. Open the latest Bahari OS confirmation email before signing in.",
      };
    }

    return {
      status: "error",
      message:
        signInError?.status === 429
          ? "Too many sign-in attempts. Wait a moment and try again."
          : "The email or password is incorrect.",
    };
  }

  const {
    data: membershipData,
    error: membershipError,
  } = await supabase
    .from("company_members")
    .select("company_id, created_at")
    .eq("user_id", signInData.user.id)
    .order("created_at", {
      ascending: true,
    })
    .limit(1);

  if (membershipError) {
    console.error(
      "Could not resolve workspace membership:",
      membershipError.message
    );

    await supabase.auth.signOut();

    return {
      status: "error",
      message:
        "Your account signed in, but Bahari OS could not load its company workspace.",
    };
  }

  let membership =
    (
      membershipData ?? []
    )[0] as MembershipRow | undefined;

  if (!membership?.company_id) {
    const metadata =
      isRecord(
        signInData.user.user_metadata
      )
        ? signInData.user.user_metadata
        : {};

    const companyName =
      readMetadataString(
        metadata,
        "pending_company_name"
      );

    try {
      const provisioned =
        await provisionWorkspaceForUser({
          userId: signInData.user.id,
          email: signInData.user.email,
          companyName,
        });

      membership = {
        company_id:
          provisioned.companyId,
        created_at:
          new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        "Could not repair missing Bahari OS workspace:",
        error
      );

      await supabase.auth.signOut();

      return {
        status: "error",
        message:
          "Your account is verified, but Bahari OS could not finish creating its company workspace. Please try again.",
      };
    }

    redirect(
      `/onboarding?next=${encodeURIComponent(
        nextPath
      )}`
    );
  }

  const {
    data: companyData,
    error: companyError,
  } = await supabase
    .from("companies")
    .select(
      "onboarding_completed_at, operating_model"
    )
    .eq(
      "id",
      membership.company_id
    )
    .maybeSingle();

  if (companyError) {
    console.error(
      "Could not inspect workspace onboarding:",
      companyError.message
    );

    return {
      status: "error",
      message:
        "You were signed in, but Bahari OS could not load the workspace setup state.",
    };
  }

  const company =
    companyData as unknown as
      | CompanyOnboardingRow
      | null;

  const needsOnboarding =
    !company?.onboarding_completed_at ||
    !company?.operating_model;

  if (needsOnboarding) {
    redirect(
      `/onboarding?next=${encodeURIComponent(
        nextPath
      )}`
    );
  }

  redirect(nextPath);
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
  const value = record[key];

  return typeof value === "string"
    ? value.trim()
    : null;
}