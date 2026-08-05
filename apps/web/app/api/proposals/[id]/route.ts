import { NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProposalStatus =
  | "Draft"
  | "Ready"
  | "Sent"
  | "Accepted"
  | "Declined"
  | "Expired";

type ProposalRow = {
  id: string;
  reference: string;
  client_name: string;
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
  company_id: string;
  assigned_to: string | null;
  metadata: Record<string, unknown>;
  yacht_id: string | null;
  yacht_name: string | null;
  weekly_rate: number | null;
  proposal_status: ProposalStatus | null;
  proposal_pdf: string | null;
  proposal_created_at: string | null;
  proposal_sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type RouteContext = {
  params:
    | Promise<{
        id: string;
      }>
    | {
        id: string;
      };
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const params = await Promise.resolve(context.params);
    const proposalId = params.id?.trim();

    if (!proposalId) {
      return NextResponse.json(
        {
          success: false,
          error: "A proposal ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required.",
        },
        {
          status: 401,
        }
      );
    }

    const proposalResult = await supabase
      .from("inquiries")
      .select(
        [
          "id",
          "reference",
          "client_name",
          "email",
          "phone",
          "destination",
          "start_date",
          "end_date",
          "guests",
          "budget_min",
          "budget_max",
          "currency",
          "preferences",
          "source",
          "status",
          "company_id",
          "assigned_to",
          "metadata",
          "yacht_id",
          "yacht_name",
          "weekly_rate",
          "proposal_status",
          "proposal_pdf",
          "proposal_created_at",
          "proposal_sent_at",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .eq("company_id", workspace.companyId)
      .eq("id", proposalId)
      .not("proposal_created_at", "is", null)
      .maybeSingle();

    if (proposalResult.error) {
      throw new Error(
        `Could not load proposal: ${proposalResult.error.message}`
      );
    }

    if (!proposalResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: "Proposal not found.",
        },
        {
          status: 404,
        }
      );
    }

    const proposal =
      proposalResult.data as unknown as ProposalRow;

    return NextResponse.json(
      {
        success: true,
        proposal: serializeProposal(proposal),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not load proposal."
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const params = await Promise.resolve(context.params);
    const proposalId = params.id?.trim();

    if (!proposalId) {
      return NextResponse.json(
        {
          success: false,
          error: "A proposal ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required.",
        },
        {
          status: 401,
        }
      );
    }

    let body: { status?: unknown };

    try {
      body = (await request.json()) as { status?: unknown };
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "The request body must be valid JSON.",
        },
        {
          status: 400,
        }
      );
    }

    const status = normalizeRequestedStatus(body.status);

    if (!status) {
      return NextResponse.json(
        {
          success: false,
          error: "Select a valid proposal status.",
        },
        {
          status: 400,
        }
      );
    }

    const now = new Date().toISOString();

    const updatePayload: {
      proposal_status: ProposalStatus;
      updated_at: string;
      proposal_sent_at?: string | null;
    } = {
      proposal_status: status,
      updated_at: now,
    };

    if (status === "Sent") {
      updatePayload.proposal_sent_at = now;
    }

    if (status !== "Sent") {
      updatePayload.proposal_sent_at = null;
    }

    const updateResult = await supabase
      .from("inquiries")
      .update(updatePayload)
      .eq("company_id", workspace.companyId)
      .eq("assigned_to", user.id)
      .eq("id", proposalId)
      .select(
        [
          "id",
          "reference",
          "client_name",
          "email",
          "phone",
          "destination",
          "start_date",
          "end_date",
          "guests",
          "budget_min",
          "budget_max",
          "currency",
          "preferences",
          "source",
          "status",
          "company_id",
          "assigned_to",
          "metadata",
          "yacht_id",
          "yacht_name",
          "weekly_rate",
          "proposal_status",
          "proposal_pdf",
          "proposal_created_at",
          "proposal_sent_at",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .maybeSingle();

    if (updateResult.error) {
      throw new Error(
        `Could not update proposal: ${updateResult.error.message}`
      );
    }

    if (!updateResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: "Proposal not found or cannot be updated.",
        },
        {
          status: 404,
        }
      );
    }

    const proposal =
      updateResult.data as unknown as ProposalRow;

    return NextResponse.json(
      {
        success: true,
        proposal: serializeProposal(proposal),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not update proposal."
    );
  }
}

function serializeProposal(proposal: ProposalRow) {
  const metadata = readRecord(proposal.metadata);
  const commercial = readRecord(metadata.commercial);

  return {
    id: proposal.id,
    reference: proposal.reference,

    client: {
      name: proposal.client_name,
      email: proposal.email,
      phone: proposal.phone,
    },

    yacht: {
      id: proposal.yacht_id,
      name: proposal.yacht_name,
    },

    charter: {
      startDate: proposal.start_date,
      endDate: proposal.end_date,
      guests: proposal.guests,
      destination: proposal.destination,
    },

    commercial: {
      weeklyRate: proposal.weekly_rate,
      estimatedTotal:
        readNullableNumber(commercial.estimated_total) ??
        proposal.budget_max,
      currency: proposal.currency ?? "EUR",
    },

    notes: proposal.preferences,
    source: proposal.source,
    status: normalizeProposalStatus(proposal.proposal_status),
    pdfUrl: proposal.proposal_pdf,
    createdAt:
      proposal.proposal_created_at ?? proposal.created_at,
    sentAt: proposal.proposal_sent_at,
    updatedAt: proposal.updated_at,
  };
}

function normalizeRequestedStatus(
  value: unknown
): ProposalStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  const statuses: Record<string, ProposalStatus> = {
    draft: "Draft",
    ready: "Ready",
    sent: "Sent",
    accepted: "Accepted",
    declined: "Declined",
    expired: "Expired",
  };

  return statuses[normalized] ?? null;
}

function normalizeProposalStatus(
  value: string | null
): ProposalStatus {
  return normalizeRequestedStatus(value) ?? "Draft";
}

function readRecord(
  value: unknown
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readNullableNumber(value: unknown): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim().length > 0
  ) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
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
    error instanceof Error ? error.message : fallbackMessage;

  console.error("Proposal detail API error:", error);

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