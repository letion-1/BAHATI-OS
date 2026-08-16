import { NextResponse } from "next/server";

import {
  resolveFinalApprovalDecision,
  type ProposalConfirmationStatus,
} from "@/lib/proposal/final-approval";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";
import {
  isAuthenticationRequiredError,
} from "@/lib/auth/require-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params:
    | Promise<{
        id: string;
      }>
    | {
        id: string;
      };
};

type ConfirmationAction =
  | "request"
  | "confirm"
  | "decline"
  | "cancel"
  | "reset";

type ConfirmationBody = {
  action?: unknown;
  contactName?: unknown;
  contactEmail?: unknown;
  notes?: unknown;
};

type ClientSelectionRow = {
  id: string;
  proposal_yacht_id: string;
  fleet_id: string | null;
  yacht_name: string;
  selected_at: string;
  updated_at: string;
};

type ProposalYachtRow = {
  id: string;
  fleet_id: string | null;
  yacht_name: string;
  access_type: string | null;
  calendar_authority: string | null;
  booking_model: string | null;
};

type ConfirmationRow = {
  id: string;
  company_id: string;
  proposal_id: string;
  proposal_yacht_id: string | null;
  fleet_id: string | null;
  confirmation_type: string;
  status: ProposalConfirmationStatus;
  requested_at: string | null;
  requested_by: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  declined_at: string | null;
  declined_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  contact_name: string | null;
  contact_email: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const proposalId = await readProposalId(context);

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
    const admin = createAdminClient();

    const selection = await loadClientSelection(
      admin,
      workspace.companyId,
      proposalId
    );

    if (!selection) {
      return NextResponse.json(
        {
          success: true,
          confirmation: null,
          decision: null,
          selection: null,
          message:
            "The client has not selected a yacht yet.",
        },
        {
          status: 200,
          headers: noStoreHeaders(),
        }
      );
    }

    const selectedYacht = await loadSelectedProposalYacht(
      admin,
      workspace.companyId,
      proposalId,
      selection.proposal_yacht_id
    );

    if (!selectedYacht) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The selected yacht could not be found on this proposal.",
        },
        {
          status: 409,
        }
      );
    }

    const decision = resolveFinalApprovalDecision({
      operatingModel: workspace.operatingModel,
      accessType: selectedYacht.access_type,
      calendarAuthority:
        selectedYacht.calendar_authority,
      bookingModel: selectedYacht.booking_model,
    });

    const confirmation = await loadConfirmation(
      admin,
      workspace.companyId,
      proposalId
    );

    const confirmationMatchesSelection =
      confirmation?.proposal_yacht_id ===
      selectedYacht.id;

    return NextResponse.json(
      {
        success: true,
        selection: serializeSelection(
          selection,
          selectedYacht
        ),
        decision,
        confirmation:
          confirmation &&
          confirmationMatchesSelection
            ? serializeConfirmation(
                confirmation
              )
            : null,
        selectionChanged:
          Boolean(confirmation) &&
          !confirmationMatchesSelection,
      },
      {
        status: 200,
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not load final confirmation."
    );
  }
}

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const proposalId = await readProposalId(context);

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
    const admin = createAdminClient();

    let body: ConfirmationBody;

    try {
      body =
        (await request.json()) as ConfirmationBody;
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

    const action = readAction(body.action);

    if (!action) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Select a valid confirmation action.",
        },
        {
          status: 400,
        }
      );
    }

    const selection = await loadClientSelection(
      admin,
      workspace.companyId,
      proposalId
    );

    if (!selection) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The client must select a yacht before final confirmation can begin.",
        },
        {
          status: 409,
        }
      );
    }

    const selectedYacht = await loadSelectedProposalYacht(
      admin,
      workspace.companyId,
      proposalId,
      selection.proposal_yacht_id
    );

    if (!selectedYacht) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The selected yacht could not be found on this proposal.",
        },
        {
          status: 409,
        }
      );
    }

    const decision = resolveFinalApprovalDecision({
      operatingModel: workspace.operatingModel,
      accessType: selectedYacht.access_type,
      calendarAuthority:
        selectedYacht.calendar_authority,
      bookingModel: selectedYacht.booking_model,
    });

    const existing = await loadConfirmation(
      admin,
      workspace.companyId,
      proposalId
    );

    const now = new Date().toISOString();
    const nextStatus = resolveNextStatus({
      action,
      confirmationType:
        decision.confirmationType,
      canProceed: decision.canProceed,
    });

    const selectionChanged =
      Boolean(existing) &&
      existing?.proposal_yacht_id !==
        selectedYacht.id;

    const contactName =
      readOptionalString(body.contactName) ??
      (selectionChanged
        ? null
        : existing?.contact_name ?? null);

    const contactEmail =
      readOptionalEmail(body.contactEmail) ??
      (selectionChanged
        ? null
        : existing?.contact_email ?? null);

    const notes =
      readOptionalString(body.notes) ??
      (selectionChanged
        ? null
        : existing?.notes ?? null);

    const payload: Record<string, unknown> = {
      company_id: workspace.companyId,
      proposal_id: proposalId,
      proposal_yacht_id: selectedYacht.id,
      fleet_id:
        selectedYacht.fleet_id ??
        selection.fleet_id,
      confirmation_type:
        decision.confirmationType,
      status: nextStatus,
      contact_name: contactName,
      contact_email: contactEmail,
      notes,
      updated_at: now,
    };

    if (!existing) {
      payload.created_by = workspace.userId;
      payload.created_at = now;
    }

    if (selectionChanged) {
      payload.requested_at = null;
      payload.requested_by = null;
      payload.confirmed_at = null;
      payload.confirmed_by = null;
      payload.declined_at = null;
      payload.declined_by = null;
      payload.cancelled_at = null;
      payload.cancelled_by = null;
    }

    if (action === "request") {
      payload.requested_at = now;
      payload.requested_by = workspace.userId;
      payload.confirmed_at = null;
      payload.confirmed_by = null;
      payload.declined_at = null;
      payload.declined_by = null;
      payload.cancelled_at = null;
      payload.cancelled_by = null;
    }

    if (action === "confirm") {
      payload.confirmed_at = now;
      payload.confirmed_by = workspace.userId;
      payload.declined_at = null;
      payload.declined_by = null;
      payload.cancelled_at = null;
      payload.cancelled_by = null;
    }

    if (action === "decline") {
      payload.declined_at = now;
      payload.declined_by = workspace.userId;
      payload.confirmed_at = null;
      payload.confirmed_by = null;
    }

    if (action === "cancel") {
      payload.cancelled_at = now;
      payload.cancelled_by = workspace.userId;
    }

    if (action === "reset") {
      payload.requested_at = null;
      payload.requested_by = null;
      payload.confirmed_at = null;
      payload.confirmed_by = null;
      payload.declined_at = null;
      payload.declined_by = null;
      payload.cancelled_at = null;
      payload.cancelled_by = null;
    }

    const result = existing
      ? await admin
          .from("proposal_confirmations")
          .update(payload)
          .eq("company_id", workspace.companyId)
          .eq("proposal_id", proposalId)
          .select(confirmationSelect())
          .single()
      : await admin
          .from("proposal_confirmations")
          .insert(payload)
          .select(confirmationSelect())
          .single();

    if (result.error) {
      throw new Error(
        `Could not save final confirmation: ${result.error.message}`
      );
    }

    const saved =
      result.data as unknown as ConfirmationRow;

    return NextResponse.json(
      {
        success: true,
        selection: serializeSelection(
          selection,
          selectedYacht
        ),
        decision,
        confirmation:
          serializeConfirmation(saved),
      },
      {
        status: existing ? 200 : 201,
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not update final confirmation."
    );
  }
}

async function readProposalId(
  context: RouteContext
) {
  const params = await Promise.resolve(
    context.params
  );

  return params.id?.trim() || null;
}

async function loadClientSelection(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  proposalId: string
): Promise<ClientSelectionRow | null> {
  const result = await admin
    .from("proposal_client_selections")
    .select(
      "id, proposal_yacht_id, fleet_id, yacht_name, selected_at, updated_at"
    )
    .eq("company_id", companyId)
    .eq("proposal_id", proposalId)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      `Could not load client yacht selection: ${result.error.message}`
    );
  }

  return result.data
    ? (result.data as unknown as ClientSelectionRow)
    : null;
}

async function loadSelectedProposalYacht(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  proposalId: string,
  proposalYachtId: string
): Promise<ProposalYachtRow | null> {
  const result = await admin
    .from("proposal_yachts")
    .select(
      "id, fleet_id, yacht_name, access_type, calendar_authority, booking_model"
    )
    .eq("company_id", companyId)
    .eq("proposal_id", proposalId)
    .eq("id", proposalYachtId)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      `Could not load selected proposal yacht: ${result.error.message}`
    );
  }

  return result.data
    ? (result.data as unknown as ProposalYachtRow)
    : null;
}

async function loadConfirmation(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  proposalId: string
): Promise<ConfirmationRow | null> {
  const result = await admin
    .from("proposal_confirmations")
    .select(confirmationSelect())
    .eq("company_id", companyId)
    .eq("proposal_id", proposalId)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      `Could not load final confirmation: ${result.error.message}`
    );
  }

  return result.data
    ? (result.data as unknown as ConfirmationRow)
    : null;
}

function confirmationSelect() {
  return [
    "id",
    "company_id",
    "proposal_id",
    "proposal_yacht_id",
    "fleet_id",
    "confirmation_type",
    "status",
    "requested_at",
    "requested_by",
    "confirmed_at",
    "confirmed_by",
    "declined_at",
    "declined_by",
    "cancelled_at",
    "cancelled_by",
    "contact_name",
    "contact_email",
    "notes",
    "created_by",
    "created_at",
    "updated_at",
  ].join(",");
}

function resolveNextStatus({
  action,
  confirmationType,
  canProceed,
}: {
  action: ConfirmationAction;
  confirmationType: string;
  canProceed: boolean;
}): ProposalConfirmationStatus {
  if (!canProceed) {
    return "blocked";
  }

  switch (action) {
    case "request":
      if (
        confirmationType === "owner_approval"
      ) {
        return "owner_approval_pending";
      }

      if (
        confirmationType ===
        "manager_confirmation"
      ) {
        return "manager_confirmation_pending";
      }

      return "confirmation_requested";

    case "confirm":
      return "confirmed";

    case "decline":
      return "declined";

    case "cancel":
      return "cancelled";

    case "reset":
    default:
      return "confirmation_required";
  }
}

function serializeSelection(
  selection: ClientSelectionRow,
  yacht: ProposalYachtRow
) {
  return {
    id: selection.id,
    proposalYachtId:
      selection.proposal_yacht_id,
    fleetId:
      selection.fleet_id ??
      yacht.fleet_id ??
      null,
    yachtName:
      selection.yacht_name ||
      yacht.yacht_name,
    selectedAt: selection.selected_at,
    updatedAt: selection.updated_at,
    accessType: yacht.access_type,
    calendarAuthority:
      yacht.calendar_authority,
    bookingModel: yacht.booking_model,
  };
}

function serializeConfirmation(
  row: ConfirmationRow
) {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    proposalYachtId:
      row.proposal_yacht_id,
    fleetId: row.fleet_id,
    confirmationType:
      row.confirmation_type,
    status: row.status,
    requestedAt: row.requested_at,
    requestedBy: row.requested_by,
    confirmedAt: row.confirmed_at,
    confirmedBy: row.confirmed_by,
    declinedAt: row.declined_at,
    declinedBy: row.declined_by,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readAction(
  value: unknown
): ConfirmationAction | null {
  if (typeof value !== "string") {
    return null;
  }

  switch (value) {
    case "request":
    case "confirm":
    case "decline":
    case "cancel":
    case "reset":
      return value;

    default:
      return null;
  }
}

function readOptionalString(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
}

function readOptionalEmail(
  value: unknown
): string | null {
  const normalized =
    readOptionalString(value);

  if (!normalized) {
    return null;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    normalized
  )
    ? normalized
    : null;
}

function noStoreHeaders() {
  return {
    "Cache-Control":
      "private, no-store, max-age=0",
  };
}

function handleRouteError(
  error: unknown,
  fallbackMessage: string
) {
  if (
    isAuthenticationRequiredError(error)
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

  console.error(
    "Proposal confirmation API error:",
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