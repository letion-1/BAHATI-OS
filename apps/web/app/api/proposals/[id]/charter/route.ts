import { NextResponse } from "next/server";

import {
  isAuthenticationRequiredError,
} from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

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

type ProposalRow = {
  id: string;
  reference: string;
  company_id: string;
  client_name: string;
  email: string | null;
  phone: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  currency: string | null;
  metadata: Record<string, unknown> | null;
  proposal_created_at: string | null;
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
  proposal_id: string;
  fleet_id: string | null;
  yacht_name: string;
  weekly_rate: number | string | null;
  estimated_total: number | string | null;
  currency: string | null;
  snapshot: Record<string, unknown> | null;
};

type ConfirmationRow = {
  id: string;
  company_id: string;
  proposal_id: string;
  proposal_yacht_id: string | null;
  fleet_id: string | null;
  status: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
};

type CharterRow = {
  id: string;
  company_id: string;
  proposal_id: string;
  confirmation_id: string;
  proposal_yacht_id: string | null;
  fleet_id: string | null;
  reference: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  yacht_name: string;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  embarkation_port: string | null;
  disembarkation_port: string | null;
  guests: number | null;
  currency: string;
  charter_fee: number | string | null;
  vat_percent: number | string | null;
  vat_amount: number | string | null;
  apa_percent: number | string | null;
  apa_amount: number | string | null;
  deposit_percent: number | string | null;
  deposit_amount: number | string | null;
  balance_amount: number | string | null;
  total_contract_value: number | string | null;
  charter_status: string;
  contract_status: string;
  payment_status: string;
  contract_sent_at: string | null;
  contract_signed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
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

    const existing = await loadCharter(
      admin,
      workspace.companyId,
      proposalId
    );

    if (existing) {
      const currentSelection = await loadClientSelection(
        admin,
        workspace.companyId,
        proposalId
      );

      return NextResponse.json(
        {
          success: true,
          charter: serializeCharter(existing),
          canCreate: false,
          alreadyCreated: true,
          selectionChanged:
            Boolean(currentSelection) &&
            currentSelection?.proposal_yacht_id !==
              existing.proposal_yacht_id,
        },
        {
          status: 200,
          headers: noStoreHeaders(),
        }
      );
    }

    const eligibility = await loadCreationEligibility(
      admin,
      workspace.companyId,
      proposalId
    );

    return NextResponse.json(
      {
        success: true,
        charter: null,
        canCreate: eligibility.canCreate,
        alreadyCreated: false,
        reason: eligibility.reason,
        selection: eligibility.selection
          ? {
              proposalYachtId:
                eligibility.selection.proposal_yacht_id,
              fleetId:
                eligibility.selection.fleet_id,
              yachtName:
                eligibility.selection.yacht_name,
            }
          : null,
        confirmation: eligibility.confirmation
          ? {
              id: eligibility.confirmation.id,
              status: eligibility.confirmation.status,
              confirmedAt:
                eligibility.confirmation.confirmed_at,
            }
          : null,
      },
      {
        status: 200,
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not load charter transition."
    );
  }
}

export async function POST(
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

    const existing = await loadCharter(
      admin,
      workspace.companyId,
      proposalId
    );

    if (existing) {
      return NextResponse.json(
        {
          success: true,
          created: false,
          charter: serializeCharter(existing),
        },
        {
          status: 200,
          headers: noStoreHeaders(),
        }
      );
    }

    const proposal = await loadProposal(
      admin,
      workspace.companyId,
      proposalId
    );

    if (!proposal) {
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
            "The client must select a yacht before a charter can be created.",
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
            "The client-selected yacht could not be found on this proposal.",
        },
        {
          status: 409,
        }
      );
    }

    const confirmation = await loadConfirmation(
      admin,
      workspace.companyId,
      proposalId
    );

    if (!confirmation) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Final yacht confirmation is required before creating a charter.",
        },
        {
          status: 409,
        }
      );
    }

    if (confirmation.status !== "confirmed") {
      return NextResponse.json(
        {
          success: false,
          error:
            "The selected yacht has not been finally confirmed yet.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      confirmation.proposal_yacht_id !==
      selection.proposal_yacht_id
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The final confirmation belongs to a different yacht selection. Reconfirm the client's current preferred yacht before creating the charter.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      confirmation.fleet_id &&
      selectedYacht.fleet_id &&
      confirmation.fleet_id !==
        selectedYacht.fleet_id
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The confirmed fleet yacht no longer matches the selected proposal yacht.",
        },
        {
          status: 409,
        }
      );
    }

    const now = new Date().toISOString();

    // Only copy pricing that is explicitly stored as an estimated total
    // for the selected option. Weekly rate is not silently treated as the
    // final charter fee.
    const selectedEstimatedTotal =
      toNullableNumber(
        selectedYacht.estimated_total
      );

    const currency =
      cleanCurrency(selectedYacht.currency) ??
      cleanCurrency(proposal.currency) ??
      workspace.defaultCurrency ??
      "EUR";

    const insertResult = await admin
      .from("charters")
      .insert({
        company_id: workspace.companyId,
        proposal_id: proposal.id,
        confirmation_id: confirmation.id,
        proposal_yacht_id:
          selectedYacht.id,
        fleet_id:
          selectedYacht.fleet_id ??
          selection.fleet_id ??
          confirmation.fleet_id,
        reference:
          buildCharterReference(
            proposal.reference
          ),
        client_name: proposal.client_name,
        client_email: proposal.email,
        client_phone: proposal.phone,
        yacht_name:
          selectedYacht.yacht_name ||
          selection.yacht_name,
        start_date: proposal.start_date,
        end_date: proposal.end_date,
        destination:
          proposal.destination,
        embarkation_port: null,
        disembarkation_port: null,
        guests: proposal.guests,
        currency,
        charter_fee:
          selectedEstimatedTotal,
        vat_percent: null,
        vat_amount: null,
        apa_percent: null,
        apa_amount: null,
        deposit_percent: null,
        deposit_amount: null,
        balance_amount: null,
        total_contract_value: null,
        charter_status: "draft",
        contract_status: "not_started",
        payment_status: "not_started",
        created_by: workspace.userId,
        created_at: now,
        updated_at: now,
      })
      .select(charterSelect())
      .single();

    if (insertResult.error) {
      // The unique company/proposal constraint makes creation idempotent
      // even if two requests arrive at nearly the same time.
      if (
        insertResult.error.code === "23505"
      ) {
        const concurrentExisting =
          await loadCharter(
            admin,
            workspace.companyId,
            proposalId
          );

        if (concurrentExisting) {
          return NextResponse.json(
            {
              success: true,
              created: false,
              charter:
                serializeCharter(
                  concurrentExisting
                ),
            },
            {
              status: 200,
              headers: noStoreHeaders(),
            }
          );
        }
      }

      throw new Error(
        `Could not create charter: ${insertResult.error.message}`
      );
    }

    const charter =
      insertResult.data as unknown as CharterRow;

    return NextResponse.json(
      {
        success: true,
        created: true,
        charter: serializeCharter(charter),
      },
      {
        status: 201,
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not create charter."
    );
  }
}

async function loadCreationEligibility(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  proposalId: string
) {
  const selection = await loadClientSelection(
    admin,
    companyId,
    proposalId
  );

  if (!selection) {
    return {
      canCreate: false,
      reason:
        "The client has not selected a yacht yet.",
      selection: null,
      confirmation: null,
    };
  }

  const confirmation = await loadConfirmation(
    admin,
    companyId,
    proposalId
  );

  if (!confirmation) {
    return {
      canCreate: false,
      reason:
        "Final yacht confirmation has not started.",
      selection,
      confirmation: null,
    };
  }

  if (confirmation.status !== "confirmed") {
    return {
      canCreate: false,
      reason:
        "The selected yacht is not finally confirmed yet.",
      selection,
      confirmation,
    };
  }

  if (
    confirmation.proposal_yacht_id !==
    selection.proposal_yacht_id
  ) {
    return {
      canCreate: false,
      reason:
        "The confirmed yacht no longer matches the client's current selection.",
      selection,
      confirmation,
    };
  }

  return {
    canCreate: true,
    reason: null,
    selection,
    confirmation,
  };
}

async function loadProposal(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  proposalId: string
): Promise<ProposalRow | null> {
  const result = await admin
    .from("inquiries")
    .select(
      "id, reference, company_id, client_name, email, phone, destination, start_date, end_date, guests, currency, metadata, proposal_created_at"
    )
    .eq("company_id", companyId)
    .eq("id", proposalId)
    .not("proposal_created_at", "is", null)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      `Could not load proposal: ${result.error.message}`
    );
  }

  return result.data
    ? (result.data as unknown as ProposalRow)
    : null;
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
      "id, proposal_id, fleet_id, yacht_name, weekly_rate, estimated_total, currency, snapshot"
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
    .select(
      "id, company_id, proposal_id, proposal_yacht_id, fleet_id, status, confirmed_at, confirmed_by"
    )
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

async function loadCharter(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  proposalId: string
): Promise<CharterRow | null> {
  const result = await admin
    .from("charters")
    .select(charterSelect())
    .eq("company_id", companyId)
    .eq("proposal_id", proposalId)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      `Could not load charter: ${result.error.message}`
    );
  }

  return result.data
    ? (result.data as unknown as CharterRow)
    : null;
}

function charterSelect() {
  return [
    "id",
    "company_id",
    "proposal_id",
    "confirmation_id",
    "proposal_yacht_id",
    "fleet_id",
    "reference",
    "client_name",
    "client_email",
    "client_phone",
    "yacht_name",
    "start_date",
    "end_date",
    "destination",
    "embarkation_port",
    "disembarkation_port",
    "guests",
    "currency",
    "charter_fee",
    "vat_percent",
    "vat_amount",
    "apa_percent",
    "apa_amount",
    "deposit_percent",
    "deposit_amount",
    "balance_amount",
    "total_contract_value",
    "charter_status",
    "contract_status",
    "payment_status",
    "contract_sent_at",
    "contract_signed_at",
    "cancelled_at",
    "cancelled_by",
    "cancellation_reason",
    "created_by",
    "created_at",
    "updated_at",
  ].join(",");
}

function serializeCharter(
  row: CharterRow
) {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    confirmationId:
      row.confirmation_id,
    proposalYachtId:
      row.proposal_yacht_id,
    fleetId: row.fleet_id,
    reference: row.reference,

    client: {
      name: row.client_name,
      email: row.client_email,
      phone: row.client_phone,
    },

    yacht: {
      name: row.yacht_name,
      fleetId: row.fleet_id,
    },

    charter: {
      startDate: row.start_date,
      endDate: row.end_date,
      destination: row.destination,
      embarkationPort:
        row.embarkation_port,
      disembarkationPort:
        row.disembarkation_port,
      guests: row.guests,
    },

    commercial: {
      currency: row.currency,
      charterFee:
        toNullableNumber(
          row.charter_fee
        ),
      vatPercent:
        toNullableNumber(
          row.vat_percent
        ),
      vatAmount:
        toNullableNumber(
          row.vat_amount
        ),
      apaPercent:
        toNullableNumber(
          row.apa_percent
        ),
      apaAmount:
        toNullableNumber(
          row.apa_amount
        ),
      depositPercent:
        toNullableNumber(
          row.deposit_percent
        ),
      depositAmount:
        toNullableNumber(
          row.deposit_amount
        ),
      balanceAmount:
        toNullableNumber(
          row.balance_amount
        ),
      totalContractValue:
        toNullableNumber(
          row.total_contract_value
        ),
    },

    charterStatus:
      row.charter_status,
    contractStatus:
      row.contract_status,
    paymentStatus:
      row.payment_status,

    contractSentAt:
      row.contract_sent_at,
    contractSignedAt:
      row.contract_signed_at,

    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    cancellationReason:
      row.cancellation_reason,

    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readProposalId(
  context: RouteContext
) {
  const params = await Promise.resolve(
    context.params
  );

  return params.id?.trim() || null;
}

function buildCharterReference(
  proposalReference: string
) {
  const trimmed =
    proposalReference.trim();

  if (
    /^PROP-/i.test(trimmed)
  ) {
    return trimmed.replace(
      /^PROP-/i,
      "CHTR-"
    );
  }

  return `CHTR-${trimmed}`;
}

function cleanCurrency(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value.trim().toUpperCase();

  return /^[A-Z]{3}$/.test(normalized)
    ? normalized
    : null;
}

function toNullableNumber(
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
    "Proposal charter API error:",
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