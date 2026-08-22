import "server-only";

import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

type ProvisionInput = {
  userId: string;
  email: string | null | undefined;
  companyName: string | null | undefined;
};

type ProvisionResult = {
  companyId: string;
  created: boolean;
};

type MembershipRow = {
  company_id: string;
};

type CompanyRow = {
  id: string;
};

export async function provisionWorkspaceForUser({
  userId,
  email,
  companyName,
}: ProvisionInput): Promise<ProvisionResult> {
  const admin = createAdminClient();

  const existingMembership =
    await admin
      .from("company_members")
      .select("company_id")
      .eq("user_id", userId)
      .order("created_at", {
        ascending: true,
      })
      .limit(1);

  if (existingMembership.error) {
    throw new Error(
      `Could not inspect existing workspace membership: ${existingMembership.error.message}`
    );
  }

  const membership =
    (
      existingMembership.data ?? []
    )[0] as MembershipRow | undefined;

  if (membership?.company_id) {
    return {
      companyId:
        membership.company_id,
      created: false,
    };
  }

  const cleanCompanyName =
    normalizeCompanyName(
      companyName,
      email
    );

  let company: CompanyRow | null =
    null;

  let lastCompanyError:
    | { message: string; code?: string }
    | null = null;

  for (
    let attempt = 0;
    attempt < 4;
    attempt += 1
  ) {
    const slug =
      buildUniqueSlug(
        cleanCompanyName,
        userId,
        attempt
      );

        const companyResult =
      await admin
        // audit-ignore: this call creates the company itself, so there is no
        // existing company_id to scope to. Reached only from authenticated
        // sign-up and workspace-provisioning flows.
        .from("companies")
        .insert({
          name: cleanCompanyName,
          slug,
          contact_email:
            email?.trim().toLowerCase() ||
            null,
          subscription_status:
            "trial",
        })
        .select("id")
        .single();

    if (
      !companyResult.error &&
      companyResult.data
    ) {
      company =
        companyResult.data as CompanyRow;
      break;
    }

    lastCompanyError =
      companyResult.error
        ? {
            message:
              companyResult.error.message,
            code:
              companyResult.error.code,
          }
        : {
            message:
              "Company record was not returned.",
          };

    if (
      companyResult.error?.code !==
      "23505"
    ) {
      break;
    }
  }

  if (!company) {
    throw new Error(
      `Could not create Bahari OS company workspace: ${
        lastCompanyError?.message ??
        "Unknown database error."
      }`
    );
  }

  const membershipResult =
    await admin
      .from("company_members")
      .insert({
        company_id: company.id,
        user_id: userId,
        role: "owner",
      })
      .select("id")
      .single();

  if (membershipResult.error) {
    const cleanup =
      await admin
        .from("companies")
        .delete()
        .eq("id", company.id);

    if (cleanup.error) {
      console.error(
        "Could not clean up failed signup company:",
        cleanup.error
      );
    }

    throw new Error(
      `Could not connect the signup user to the new workspace: ${membershipResult.error.message}`
    );
  }

  return {
    companyId: company.id,
    created: true,
  };
}

function normalizeCompanyName(
  companyName:
    | string
    | null
    | undefined,
  email:
    | string
    | null
    | undefined
) {
  const supplied =
    companyName?.trim();

  if (supplied) {
    return supplied.slice(0, 120);
  }

  const localPart =
    email
      ?.split("@")[0]
      ?.trim();

  if (localPart) {
    return `${humanize(
      localPart
    )} Yacht Workspace`.slice(
      0,
      120
    );
  }

  return "New Bahari OS Workspace";
}

function buildUniqueSlug(
  companyName: string,
  userId: string,
  attempt: number
) {
  const base =
    slugify(companyName) ||
    "yacht-workspace";

  const userSuffix =
    userId
      .replace(/-/g, "")
      .slice(0, 8);

  const retrySuffix =
    attempt === 0
      ? ""
      : `-${randomUUID()
          .replace(/-/g, "")
          .slice(0, 5)}`;

  return `${base}-${userSuffix}${retrySuffix}`.slice(
    0,
    120
  );
}

function slugify(
  value: string
) {
  return value
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function humanize(
  value: string
) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}