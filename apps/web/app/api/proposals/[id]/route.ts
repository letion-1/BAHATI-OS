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
  metadata: Record<string, unknown> | null;
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

type ProposalYachtRow = {
  id: string;
  proposal_id: string;
  fleet_id: string | null;
  position: number;
  yacht_name: string;
  weekly_rate: number | null;
  estimated_total: number | null;
  currency: string;
  broker_note: string | null;
  availability_status: string;
  verification_status: string;
  access_type: string | null;
  calendar_authority: string | null;
  booking_model: string | null;
  snapshot: Record<string, unknown> | null;
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
        proposalSelect()
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

    const proposalYachts =
      await loadProposalYachts(
        supabase,
        workspace.companyId,
        proposal.id
      );

    return NextResponse.json(
      {
        success: true,
        proposal: serializeProposal(
          proposal,
          proposalYachts
        ),
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

    let body: {
      status?: unknown;
    };

    try {
      body =
        (await request.json()) as {
          status?: unknown;
        };
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "The request body must be valid JSON.",
        },
        {
          status: 400,
        }
      );
    }

    const status =
      normalizeRequestedStatus(body.status);

    if (!status) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Select a valid proposal status.",
        },
        {
          status: 400,
        }
      );
    }

    const now =
      new Date().toISOString();

    const updatePayload: {
      proposal_status: ProposalStatus;
      updated_at: string;
      proposal_sent_at?: string | null;
    } = {
      proposal_status: status,
      updated_at: now,
    };

    if (status === "Sent") {
      updatePayload.proposal_sent_at =
        now;
    } else {
      updatePayload.proposal_sent_at =
        null;
    }

    const updateResult = await supabase
      .from("inquiries")
      .update(updatePayload)
      .eq("company_id", workspace.companyId)
      .eq("assigned_to", user.id)
      .eq("id", proposalId)
      .select(
        proposalSelect()
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
          error:
            "Proposal not found or cannot be updated.",
        },
        {
          status: 404,
        }
      );
    }

    const proposal =
      updateResult.data as unknown as ProposalRow;

    const proposalYachts =
      await loadProposalYachts(
        supabase,
        workspace.companyId,
        proposal.id
      );

    return NextResponse.json(
      {
        success: true,
        proposal: serializeProposal(
          proposal,
          proposalYachts
        ),
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

async function loadProposalYachts(
  supabase: Awaited<
    ReturnType<typeof createClient>
  >,
  companyId: string,
  proposalId: string
): Promise<ProposalYachtRow[]> {
  const result = await supabase
    .from("proposal_yachts")
    .select(
      [
        "id",
        "proposal_id",
        "fleet_id",
        "position",
        "yacht_name",
        "weekly_rate",
        "estimated_total",
        "currency",
        "broker_note",
        "availability_status",
        "verification_status",
        "access_type",
        "calendar_authority",
        "booking_model",
        "snapshot",
        "created_at",
        "updated_at",
      ].join(",")
    )
    .eq("company_id", companyId)
    .eq("proposal_id", proposalId)
    .order("position", {
      ascending: true,
    });

  if (result.error) {
    throw new Error(
      `Could not load proposal yachts: ${result.error.message}`
    );
  }

  return (
    (result.data ??
      []) as unknown as ProposalYachtRow[]
  );
}

function proposalSelect(): string {
  return [
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
  ].join(",");
}

function serializeProposal(
  proposal: ProposalRow,
  proposalYachts: ProposalYachtRow[]
) {
  const metadata =
    readRecord(proposal.metadata);

  const commercial =
    readRecord(metadata.commercial);

  const serializedYachts =
    proposalYachts.length > 0
      ? [...proposalYachts]
          .sort(
            (left, right) =>
              left.position -
              right.position
          )
          .map(
            serializeProposalYacht
          )
      : buildLegacyYachtFallback(
          proposal,
          commercial
        );

  const primary =
    serializedYachts[0] ?? null;

  return {
    id: proposal.id,
    reference: proposal.reference,

    client: {
      name: proposal.client_name,
      email: proposal.email,
      phone: proposal.phone,
    },

    // Kept for compatibility with current proposal pages.
    yacht: {
      id:
        primary?.fleetId ??
        proposal.yacht_id,
      name:
        primary?.name ??
        proposal.yacht_name,
    },

    // New multi-yacht payload.
    yachts: serializedYachts,
    yachtCount:
      serializedYachts.length,

    charter: {
      startDate: proposal.start_date,
      endDate: proposal.end_date,
      guests: proposal.guests,
      destination:
        proposal.destination ??
        readOptionalString(
          readRecord(
            metadata.charter
          ).destination
        ),
    },

    commercial: {
      weeklyRate:
        primary?.weeklyRate ??
        proposal.weekly_rate,
      estimatedTotal:
        primary?.estimatedTotal ??
        readNullableNumber(
          commercial.estimated_total
        ) ??
        proposal.budget_max,
      currency:
        primary?.currency ??
        proposal.currency ??
        "EUR",
    },

    notes: proposal.preferences,
    source: proposal.source,
    status:
      normalizeProposalStatus(
        proposal.proposal_status
      ),
    pdfUrl: proposal.proposal_pdf,
    createdAt:
      proposal.proposal_created_at ??
      proposal.created_at,
    sentAt:
      proposal.proposal_sent_at,
    updatedAt: proposal.updated_at,
  };
}

function serializeProposalYacht(
  yacht: ProposalYachtRow
) {
  return {
    id: yacht.id,
    fleetId: yacht.fleet_id,
    position: yacht.position,
    name: yacht.yacht_name,
    weeklyRate: yacht.weekly_rate,
    estimatedTotal:
      yacht.estimated_total,
    currency: yacht.currency,
    brokerNote: yacht.broker_note,
    availabilityStatus:
      yacht.availability_status,
    verificationStatus:
      yacht.verification_status,
    accessType:
      yacht.access_type,
    calendarAuthority:
      yacht.calendar_authority,
    bookingModel:
      yacht.booking_model,
    snapshot:
      yacht.snapshot ?? {},
  };
}

function buildLegacyYachtFallback(
  proposal: ProposalRow,
  commercial: Record<
    string,
    unknown
  >
) {
  if (
    !proposal.yacht_id &&
    !proposal.yacht_name
  ) {
    return [];
  }

  return [
    {
      id: null,
      fleetId:
        proposal.yacht_id,
      position: 1,
      name:
        proposal.yacht_name ??
        "Selected yacht",
      weeklyRate:
        proposal.weekly_rate,
      estimatedTotal:
        readNullableNumber(
          commercial.estimated_total
        ) ??
        proposal.budget_max,
      currency:
        proposal.currency ?? "EUR",
      brokerNote: null,
      availabilityStatus:
        "unverified",
      verificationStatus:
        "not_checked",
      accessType: null,
      calendarAuthority: null,
      bookingModel: null,
      snapshot: {},
    },
  ];
}

function normalizeRequestedStatus(
  value: unknown
): ProposalStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value.trim().toLowerCase();

  const statuses: Record<
    string,
    ProposalStatus
  > = {
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
  return (
    normalizeRequestedStatus(value) ??
    "Draft"
  );
}

function readRecord(
  value: unknown
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  return {};
}

function readOptionalString(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value.trim();

  return normalized || null;
}

function readNullableNumber(
  value: unknown
): number | null {
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

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function handleRouteError(
  error: unknown,
  fallbackMessage: string
) {
  if (
    isAuthenticationRequiredError(
      error
    )
  ) {
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

  if (
    isWorkspaceAccessError(error)
  ) {
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

  console.error(
    "Proposal detail API error:",
    error
  );

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