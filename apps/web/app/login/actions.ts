"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

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
        "Your account signed in, but Yacht OS could not load its company workspace.",
    };
  }

  const membership =
    (
      membershipData ?? []
    )[0] as MembershipRow | undefined;

  if (!membership?.company_id) {
    await supabase.auth.signOut();

    return {
      status: "error",
      message:
        "This account is not connected to a Yacht OS company workspace yet.",
    };
  }

  const {
    data: companyData,
    error: companyError,
  } = await supabase
    .from("companies")
    .select(
      "onboarding_completed_at, operating_model"
    )
    .eq("id", membership.company_id)
    .maybeSingle();

  if (companyError) {
    console.error(
      "Could not inspect workspace onboarding:",
      companyError.message
    );

    return {
      status: "error",
      message:
        "You were signed in, but Yacht OS could not load the workspace setup state.",
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

function isValidEmail(value: string) {
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
    !value.startsWith("/onboarding")
  ) {
    return value;
  }

  return "/availability";
}