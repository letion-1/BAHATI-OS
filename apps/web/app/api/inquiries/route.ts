import { NextRequest, NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InquiryRow = {
  id: string;
  reference: string | null;
  client_name: string;
  client_type: string |null;
  email: string | null;
  phone: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  preferences: string | null;
  source: string | null;
  status: string | null;
  client_id: string | null;
  proposal_pdf: string | null;
  proposal_status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const search =
      request.nextUrl.searchParams.get("search")?.trim();

    const status =
      request.nextUrl.searchParams.get("status")?.trim();

    let query = supabase
      .from("inquiries")
      .select(
        `
        id,
        reference,
        client_name,
        client_type,
        email,
        phone,
        destination,
        start_date,
        end_date,
        guests,
        budget_min,
        budget_max,
        currency,
        preferences,
        source,
        status,
        client_id,
        proposal_pdf,
        proposal_status,
        created_at,
        updated_at
      `
      )
      .eq("company_id", workspace.companyId)
      .order("created_at", { ascending: false });

    if (search) {
      const safe = search.replace(/[,%()]/g, " ");

      query = query.or(
        [
          `client_name.ilike.%${safe}%`,
          `email.ilike.%${safe}%`,
          `phone.ilike.%${safe}%`,
          `destination.ilike.%${safe}%`,
          `reference.ilike.%${safe}%`,
        ].join(",")
      );
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const result = await query;

    if (result.error) {
      throw new Error(result.error.message);
    }

    const inquiryRows =
      (result.data ?? []) as InquiryRow[];

    const inquiries = inquiryRows.map((inquiry) => ({
      ...inquiry,
      status: normalizeStatus(inquiry.status),
    }));

    return NextResponse.json(
      {
        success: true,
        inquiries,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not load inquiries."
    );
  }
}

function normalizeStatus(value: string | null): string {
  const normalized = (value ?? "new")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  const aliases: Record<string, string> = {
    proposal_ready: "proposal_sent",
    matching: "qualified",
    matching_complete: "qualified",
    needs_review: "new",
  };

  return aliases[normalized] ?? normalized;
}

function handleRouteError(
  error: unknown,
  fallbackMessage: string
) {
  if (isAuthenticationRequiredError(error)) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: error.status,
      }
    );
  }

  if (isWorkspaceAccessError(error)) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: error.status,
      }
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : fallbackMessage;

  console.error("Inquiries API error:", error);

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status: 500,
    }
  );
}