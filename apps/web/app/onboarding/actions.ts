"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
} from "@/lib/workspace/get-current-workspace";

export type OnboardingActionState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors?: Record<string, string>;
};

type OperatingModel =
  | "independent_brokerage"
  | "yacht_management"
  | "controlled_fleet"
  | "mixed_operation";

type YachtAccessBand =
  | "1_25"
  | "26_100"
  | "101_500"
  | "501_2000"
  | "2000_plus";

const OPERATING_MODELS: OperatingModel[] = [
  "independent_brokerage",
  "yacht_management",
  "controlled_fleet",
  "mixed_operation",
];

const YACHT_ACCESS_BANDS: YachtAccessBand[] = [
  "1_25",
  "26_100",
  "101_500",
  "501_2000",
  "2000_plus",
];

export async function completeOnboarding(
  _previousState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const fullName = readString(
    formData.get("fullName")
  );

  const roleTitle = readString(
    formData.get("roleTitle")
  );

  const companyName = readString(
    formData.get("companyName")
  );

  const operatingModel =
    readOperatingModel(
      formData.get("operatingModel")
    );

  const primaryMarket = readString(
    formData.get("primaryMarket")
  );

  const yachtAccessBand =
    readYachtAccessBand(
      formData.get("yachtAccessBand")
    );

  const websiteUrl = normalizeWebsite(
    readString(formData.get("websiteUrl"))
  );

  const nextPath = normalizeNextPath(
    formData.get("next")
  );

  const fieldErrors: Record<string, string> = {};

  if (fullName.length < 2) {
    fieldErrors.fullName =
      "Enter your full name.";
  }

  if (roleTitle.length < 2) {
    fieldErrors.roleTitle =
      "Enter your professional role.";
  }

  if (companyName.length < 2) {
    fieldErrors.companyName =
      "Enter your company name.";
  }

  if (!operatingModel) {
    fieldErrors.operatingModel =
      "Choose how your company primarily operates.";
  }

  if (!yachtAccessBand) {
    fieldErrors.yachtAccessBand =
      "Choose the approximate number of yachts you work with.";
  }

  if (
    websiteUrl &&
    !isValidHttpUrl(websiteUrl)
  ) {
    fieldErrors.websiteUrl =
      "Enter a valid company website.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message:
        "Check the highlighted onboarding fields.",
      fieldErrors,
    };
  }

  const workspace =
    await getCurrentWorkspace();

  if (
    workspace.role !== "owner" &&
    workspace.role !== "admin"
  ) {
    return {
      status: "error",
      message:
        "A workspace owner or admin must complete company onboarding.",
    };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const { error: metadataError } =
    await supabase.auth.updateUser({
      data: {
        full_name: fullName,
        display_name: fullName,
        role_title: roleTitle,
      },
    });

  if (metadataError) {
    console.error(
      "Could not update user profile during onboarding:",
      metadataError.message
    );

    return {
      status: "error",
      message:
        "Your profile could not be saved. Try again.",
    };
  }

  const now = new Date().toISOString();

  const { error: companyError } =
    await admin
      .from("companies")
      .update({
        name: companyName,
        operating_model: operatingModel,
        primary_market:
          primaryMarket || null,
        yacht_access_band:
          yachtAccessBand,
        website_url:
          websiteUrl || null,
        onboarding_completed_at: now,
        onboarding_version: 1,
      })
      .eq("id", workspace.companyId);

  if (companyError) {
    console.error(
      "Could not complete company onboarding:",
      companyError.message
    );

    return {
      status: "error",
      message:
        "Your profile was saved, but the company workspace could not be updated.",
    };
  }

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  revalidatePath("/onboarding");

  redirect(nextPath);
}

function readString(
  value: FormDataEntryValue | null
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function readOperatingModel(
  value: FormDataEntryValue | null
): OperatingModel | null {
  if (typeof value !== "string") {
    return null;
  }

  return OPERATING_MODELS.includes(
    value as OperatingModel
  )
    ? (value as OperatingModel)
    : null;
}

function readYachtAccessBand(
  value: FormDataEntryValue | null
): YachtAccessBand | null {
  if (typeof value !== "string") {
    return null;
  }

  return YACHT_ACCESS_BANDS.includes(
    value as YachtAccessBand
  )
    ? (value as YachtAccessBand)
    : null;
}

function normalizeWebsite(
  value: string
): string {
  if (!value) {
    return "";
  }

  if (
    value.startsWith("http://") ||
    value.startsWith("https://")
  ) {
    return value;
  }

  return `https://${value}`;
}

function isValidHttpUrl(
  value: string
): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch {
    return false;
  }
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

  return "/";
}
