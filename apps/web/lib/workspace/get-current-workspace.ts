import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

const ACTIVE_COMPANY_COOKIE = "intrigue-active-company-id";

export type WorkspaceRole =
  | "owner"
  | "admin"
  | "broker"
  | "viewer"
  | string;

export type CompanyOperatingModel =
  | "independent_brokerage"
  | "yacht_management"
  | "controlled_fleet"
  | "mixed_operation";

export type CurrentWorkspace = {
  userId: string;
  membershipId: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  companyLogoUrl: string | null;
  defaultCurrency: string;
  timezone: string;
  subscriptionStatus: string;
  operatingModel: CompanyOperatingModel | null;
  role: WorkspaceRole;
};

type MembershipRow = {
  id: string;
  company_id: string;
  role: string;
  created_at: string;
};

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  default_currency: string;
  timezone: string;
  subscription_status: string;
  operating_model: CompanyOperatingModel | null;
};

export class WorkspaceAccessError extends Error {
  readonly code:
    | "WORKSPACE_REQUIRED"
    | "WORKSPACE_QUERY_FAILED";

  readonly status: 403 | 500;

  constructor(
    code:
      | "WORKSPACE_REQUIRED"
      | "WORKSPACE_QUERY_FAILED",
    message: string
  ) {
    super(message);
    this.name = "WorkspaceAccessError";
    this.code = code;
    this.status =
      code === "WORKSPACE_REQUIRED"
        ? 403
        : 500;
  }
}

/**
 * Resolves the active company for the signed-in user.
 *
 * Selection order:
 * 1. A valid company ID stored in the active-workspace cookie.
 * 2. The user's oldest company membership as a deterministic fallback.
 *
 * The cookie never grants access by itself. The selected company must also
 * appear in company_members for the authenticated user, and Supabase RLS
 * independently enforces the same tenant boundary.
 */
export const getCurrentWorkspace = cache(
  async (): Promise<CurrentWorkspace> => {
    const user = await requireUser();
    const supabase = await createClient();
    const cookieStore = await cookies();

    const requestedCompanyId =
      cookieStore.get(
        ACTIVE_COMPANY_COOKIE
      )?.value ?? null;

    const {
      data: membershipData,
      error: membershipError,
    } = await supabase
      .from("company_members")
      .select(
        "id, company_id, role, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", {
        ascending: true,
      });

    if (membershipError) {
      throw new WorkspaceAccessError(
        "WORKSPACE_QUERY_FAILED",
        `Could not load workspace membership: ${membershipError.message}`
      );
    }

    const memberships =
      (membershipData ??
        []) as MembershipRow[];

    if (memberships.length === 0) {
      throw new WorkspaceAccessError(
        "WORKSPACE_REQUIRED",
        "Your account is not connected to a company workspace yet."
      );
    }

    const membership =
      (requestedCompanyId
        ? memberships.find(
            (item) =>
              item.company_id ===
              requestedCompanyId
          )
        : null) ?? memberships[0];

    const {
      data: companyData,
      error: companyError,
    } = await supabase
      .from("companies")
      .select(
        "id, name, slug, logo_url, default_currency, timezone, subscription_status, operating_model"
      )
      .eq("id", membership.company_id)
      .maybeSingle();

    if (companyError) {
      throw new WorkspaceAccessError(
        "WORKSPACE_QUERY_FAILED",
        `Could not load company workspace: ${companyError.message}`
      );
    }

    if (!companyData) {
      throw new WorkspaceAccessError(
        "WORKSPACE_REQUIRED",
        "The selected company workspace is unavailable."
      );
    }

    const company =
      companyData as CompanyRow;

    return {
      userId: user.id,
      membershipId: membership.id,
      companyId: company.id,
      companyName: company.name,
      companySlug: company.slug,
      companyLogoUrl: company.logo_url,
      defaultCurrency:
        company.default_currency,
      timezone: company.timezone,
      subscriptionStatus:
        company.subscription_status,
      operatingModel:
        company.operating_model,
      role: membership.role,
    };
  }
);

export function isWorkspaceAccessError(
  error: unknown
): error is WorkspaceAccessError {
  return error instanceof WorkspaceAccessError;
}

export function getActiveCompanyCookieName() {
  return ACTIVE_COMPANY_COOKIE;
}