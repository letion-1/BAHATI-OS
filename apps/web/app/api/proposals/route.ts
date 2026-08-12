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

type CreateProposalBody = {
  yachtId?: unknown;
  yachts?: unknown;
  inquiryId?: unknown;
  clientName?: unknown;
  clientEmail?: unknown;
  clientPhone?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  guests?: unknown;
  weeklyRate?: unknown;
  currency?: unknown;
  notes?: unknown;
  estimatedTotal?: unknown;
};

type CreateProposalYachtInput = {
  yachtId: string;
  position: number;
  weeklyRate: number | null;
  estimatedTotal: number | null;
  currency: string;
  sourceAvailabilityStatus: string | null;
};

type FleetRow = {
  id: string;
  name: string;
};

type YachtAccessRow = {
  fleet_id: string;
  access_type:
    | "controlled"
    | "managed"
    | "broker_access"
    | "reference"
    | null;
  calendar_authority:
    | "our_company"
    | "owner"
    | "charter_manager"
    | "operator"
    | "unknown"
    | null;
  booking_model:
    | "direct"
    | "confirmation_required"
    | "owner_approval_required"
    | "reference_only"
    | null;
  client_proposal_permission: boolean | null;
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

type ProposalRow = {
  id: string;
  reference: string;
  client_name: string;
  email: string | null;
  phone: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  budget_max: number | null;
  currency: string | null;
  preferences: string | null;
  metadata: Record<string, unknown> | null;
  yacht_id: string | null;
  yacht_name: string | null;
  weekly_rate: number | null;
  proposal_status: string | null;
  proposal_pdf: string | null;
  proposal_created_at: string | null;
  proposal_sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function GET() {
  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const proposalsResult = await supabase
      .from("inquiries")
      .select(
        [
          "id",
          "reference",
          "client_name",
          "email",
          "phone",
          "start_date",
          "end_date",
          "guests",
          "budget_max",
          "currency",
          "preferences",
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
      .not("proposal_created_at", "is", null)
      .order("proposal_created_at", { ascending: false });

    if (proposalsResult.error) {
      throw new Error(
        `Could not load proposals: ${proposalsResult.error.message}`
      );
    }

    const proposals =
      (proposalsResult.data ?? []) as unknown as ProposalRow[];

    const proposalIds = proposals.map((proposal) => proposal.id);

    let proposalYachts: ProposalYachtRow[] = [];

    if (proposalIds.length > 0) {
      const proposalYachtsResult = await supabase
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
        .eq("company_id", workspace.companyId)
        .in("proposal_id", proposalIds)
        .order("position", { ascending: true });

      if (proposalYachtsResult.error) {
        throw new Error(
          `Could not load proposal yachts: ${proposalYachtsResult.error.message}`
        );
      }

      proposalYachts =
        (proposalYachtsResult.data ?? []) as unknown as ProposalYachtRow[];
    }

    const yachtsByProposal = groupProposalYachts(proposalYachts);

    const serialized = proposals.map((proposal) =>
      serializeProposal(
        proposal,
        yachtsByProposal.get(proposal.id) ?? []
      )
    );

    return NextResponse.json(
      {
        success: true,
        overview: {
          total: serialized.length,
          draft: serialized.filter((item) => item.status === "Draft").length,
          ready: serialized.filter((item) => item.status === "Ready").length,
          sent: serialized.filter((item) => item.status === "Sent").length,
          accepted: serialized.filter((item) => item.status === "Accepted")
            .length,
        },
        proposals: serialized,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return handleRouteError(error, "Could not load proposals.");
  }
}

export async function POST(request: Request) {
  try {
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
        { status: 401 }
      );
    }

    let rawBody: CreateProposalBody;

    try {
      rawBody =
        (await request.json()) as CreateProposalBody;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "The request body must be valid JSON.",
        },
        { status: 400 }
      );
    }

    const validated =
      validateCreateProposal(rawBody);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: "The proposal contains invalid fields.",
          fieldErrors: validated.errors,
        },
        { status: 400 }
      );
    }

    const input = validated.data;

    const yachtIds = input.yachts.map(
      (yacht) => yacht.yachtId
    );

    const fleetResult = await supabase
      .from("fleet")
      .select("id, name")
      .eq("company_id", workspace.companyId)
      .in("id", yachtIds);

    if (fleetResult.error) {
      throw new Error(
        `Could not verify selected yachts: ${fleetResult.error.message}`
      );
    }

    const fleetRows =
      (fleetResult.data ?? []) as unknown as FleetRow[];

    const fleetById = new Map(
      fleetRows.map((row) => [row.id, row])
    );

    const missingYachtId = yachtIds.find(
      (yachtId) => !fleetById.has(yachtId)
    );

    if (missingYachtId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "One or more selected yachts do not belong to this workspace.",
        },
        { status: 404 }
      );
    }

    const accessResult = await supabase
      .from("yacht_access_profiles")
      .select(
        [
          "fleet_id",
          "access_type",
          "calendar_authority",
          "booking_model",
          "client_proposal_permission",
        ].join(",")
      )
      .eq("company_id", workspace.companyId)
      .in("fleet_id", yachtIds);

    if (accessResult.error) {
      throw new Error(
        `Could not verify yacht access permissions: ${accessResult.error.message}`
      );
    }

    const accessRows =
      (accessResult.data ?? []) as unknown as YachtAccessRow[];

    const accessByFleetId = new Map(
      accessRows.map((row) => [row.fleet_id, row])
    );

    for (const selected of input.yachts) {
      const access =
        accessByFleetId.get(selected.yachtId) ??
        defaultBrokerAccess(selected.yachtId);

      if (
        access.client_proposal_permission === false ||
        access.access_type === "reference" ||
        access.booking_model === "reference_only"
      ) {
        const yachtName =
          fleetById.get(selected.yachtId)?.name ??
          "Selected yacht";

        return NextResponse.json(
          {
            success: false,
            error: `${yachtName} is not permitted in a client-facing proposal.`,
          },
          { status: 409 }
        );
      }
    }

    const orderedYachts = [...input.yachts].sort(
      (left, right) =>
        left.position - right.position
    );

    const primaryInput = orderedYachts[0];
    const primaryYacht =
      fleetById.get(primaryInput.yachtId)!;

    const now = new Date().toISOString();
    const proposalReference =
      generateProposalReference();

    const metadataYachts = orderedYachts.map(
      (selected) => {
        const yacht =
          fleetById.get(selected.yachtId)!;

        const access =
          accessByFleetId.get(selected.yachtId) ??
          defaultBrokerAccess(selected.yachtId);

        return {
          id: yacht.id,
          name: yacht.name,
          position: selected.position,
          commercial: {
            weekly_rate: selected.weeklyRate,
            estimated_total:
              selected.estimatedTotal,
            currency: selected.currency,
          },
          availability: {
            source_status:
              selected.sourceAvailabilityStatus,
            client_status:
              resolveClientAvailabilityStatus(
                access,
                selected.sourceAvailabilityStatus
              ),
          },
          access: {
            type: access.access_type,
            calendar_authority:
              access.calendar_authority,
            booking_model:
              access.booking_model,
          },
        };
      }
    );

    const proposalResult = await supabase
      .from("inquiries")
      .insert({
        reference: proposalReference,
        client_name: input.clientName,
        client_type: "New charter client",
        email: input.clientEmail,
        phone: input.clientPhone,
        destination: null,
        start_date: input.startDate,
        end_date: input.endDate,
        guests: input.guests,
        budget_min: primaryInput.estimatedTotal,
        budget_max: primaryInput.estimatedTotal,
        currency: primaryInput.currency,
        preferences: input.notes,
        original_inquiry: input.notes,
        source: "Proposal Builder",
        status: "Proposal",
        extraction_confidence: null,
        close_probability: 25,
        missing_information: [],
        suggested_question: null,
        company_id: workspace.companyId,
        assigned_to: user.id,

        // Legacy singular fields remain populated with option #1 so
        // existing proposal screens continue to work during migration.
        yacht_id: primaryYacht.id,
        yacht_name: primaryYacht.name,
        weekly_rate: primaryInput.weeklyRate,

        proposal_status: "Draft",
        proposal_pdf: null,
        proposal_created_at: now,
        proposal_sent_at: null,
        metadata: {
          record_type: "proposal",
          proposal_version: 2,
          yacht_count: orderedYachts.length,
          source_inquiry_id:
            input.inquiryId,
          yacht: {
            id: primaryYacht.id,
            name: primaryYacht.name,
          },
          yachts: metadataYachts,
          commercial: {
            weekly_rate:
              primaryInput.weeklyRate,
            estimated_total:
              primaryInput.estimatedTotal,
            currency: primaryInput.currency,
          },
          charter: {
            start_date: input.startDate,
            end_date: input.endDate,
            guests: input.guests,
          },
          created_by: {
            user_id: user.id,
            email: user.email ?? null,
          },
        },
      })
      .select(
        [
          "id",
          "reference",
          "client_name",
          "email",
          "phone",
          "start_date",
          "end_date",
          "guests",
          "budget_max",
          "currency",
          "preferences",
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
      .single();

    if (proposalResult.error) {
      throw new Error(
        `Could not save proposal: ${proposalResult.error.message}`
      );
    }

    const proposal =
      proposalResult.data as unknown as ProposalRow;

    const proposalYachtRows =
      orderedYachts.map((selected) => {
        const yacht =
          fleetById.get(selected.yachtId)!;

        const access =
          accessByFleetId.get(selected.yachtId) ??
          defaultBrokerAccess(selected.yachtId);

        return {
          company_id: workspace.companyId,
          proposal_id: proposal.id,
          fleet_id: yacht.id,
          position: selected.position,
          yacht_name: yacht.name,
          weekly_rate: selected.weeklyRate,
          estimated_total:
            selected.estimatedTotal,
          currency: selected.currency,
          broker_note: null,
          availability_status:
            resolveClientAvailabilityStatus(
              access,
              selected.sourceAvailabilityStatus
            ),
          verification_status:
            "not_checked",
          access_type:
            access.access_type,
          calendar_authority:
            access.calendar_authority,
          booking_model:
            access.booking_model,
          snapshot: {
            source_availability_status:
              selected.sourceAvailabilityStatus,
            proposal_reference:
              proposal.reference,
            captured_at: now,
          },
          created_by: user.id,
          created_at: now,
          updated_at: now,
        };
      });

    const proposalYachtsResult = await supabase
      .from("proposal_yachts")
      .insert(proposalYachtRows)
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
      );

    if (proposalYachtsResult.error) {
      const cleanupResult = await supabase
        .from("inquiries")
        .delete()
        .eq("company_id", workspace.companyId)
        .eq("id", proposal.id);

      if (cleanupResult.error) {
        console.error(
          "Could not clean up proposal parent after proposal_yachts insert failed:",
          cleanupResult.error
        );
      }

      throw new Error(
        `Could not save proposal yacht options: ${proposalYachtsResult.error.message}`
      );
    }

    const savedYachts =
      (proposalYachtsResult.data ??
        []) as unknown as ProposalYachtRow[];

    savedYachts.sort(
      (left, right) =>
        left.position - right.position
    );

    return NextResponse.json(
      {
        success: true,
        proposal: serializeProposal(
          proposal,
          savedYachts
        ),
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not create proposal."
    );
  }
}

function serializeProposal(
  proposal: ProposalRow,
  proposalYachts: ProposalYachtRow[] = []
) {
  const metadata = readRecord(proposal.metadata);
  const commercial =
    readRecord(metadata.commercial);

  const orderedYachts =
    [...proposalYachts].sort(
      (left, right) =>
        left.position - right.position
    );

  const serializedYachts =
    orderedYachts.length > 0
      ? orderedYachts.map(
          serializeProposalYacht
        )
      : proposal.yacht_id ||
          proposal.yacht_name
        ? [
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
          ]
        : [];

  return {
    id: proposal.id,
    reference: proposal.reference,
    client: {
      name: proposal.client_name,
      email: proposal.email,
      phone: proposal.phone,
    },

    // Legacy singular object remains option #1.
    yacht: {
      id:
        serializedYachts[0]?.fleetId ??
        proposal.yacht_id,
      name:
        serializedYachts[0]?.name ??
        proposal.yacht_name,
    },

    yachts: serializedYachts,
    yachtCount:
      serializedYachts.length,

    charter: {
      startDate: proposal.start_date,
      endDate: proposal.end_date,
      guests: proposal.guests,
    },
    commercial: {
      weeklyRate:
        serializedYachts[0]
          ?.weeklyRate ??
        proposal.weekly_rate,
      estimatedTotal:
        serializedYachts[0]
          ?.estimatedTotal ??
        readNullableNumber(
          commercial.estimated_total
        ) ??
        proposal.budget_max,
      currency:
        serializedYachts[0]
          ?.currency ??
        proposal.currency ??
        "EUR",
    },
    notes: proposal.preferences,
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
    accessType: yacht.access_type,
    calendarAuthority:
      yacht.calendar_authority,
    bookingModel:
      yacht.booking_model,
    snapshot: yacht.snapshot ?? {},
  };
}

function groupProposalYachts(
  rows: ProposalYachtRow[]
) {
  const map =
    new Map<string, ProposalYachtRow[]>();

  for (const row of rows) {
    const current =
      map.get(row.proposal_id) ?? [];

    current.push(row);
    map.set(
      row.proposal_id,
      current
    );
  }

  for (const rowsForProposal of map.values()) {
    rowsForProposal.sort(
      (left, right) =>
        left.position - right.position
    );
  }

  return map;
}

function validateCreateProposal(
  body: CreateProposalBody
):
  | {
      success: true;
      data: {
        inquiryId: string | null;
        yachts: CreateProposalYachtInput[];
        clientName: string;
        clientEmail: string;
        clientPhone: string | null;
        startDate: string;
        endDate: string;
        guests: number;
        notes: string | null;
      };
    }
  | {
      success: false;
      errors: Record<string, string>;
    } {
  const errors: Record<string, string> = {};

  const clientName =
    readRequiredString(body.clientName);

  const clientEmail =
    readRequiredString(
      body.clientEmail
    ).toLowerCase();

  const clientPhone =
    readOptionalString(body.clientPhone);

  const startDate =
    readRequiredString(body.startDate);

  const endDate =
    readRequiredString(body.endDate);

  const guests =
    readNumber(body.guests);

  const notes =
    readOptionalString(body.notes);

  const inquiryId =
    readOptionalString(body.inquiryId);

  const yachts =
    parseProposalYachts(body, errors);

  if (!clientName) {
    errors.clientName =
      "Enter the client's name.";
  }

  if (!clientEmail) {
    errors.clientEmail =
      "Enter the client's email address.";
  } else if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      clientEmail
    )
  ) {
    errors.clientEmail =
      "Enter a valid email address.";
  }

  if (!isDateKey(startDate)) {
    errors.startDate =
      "Enter a valid start date.";
  }

  if (!isDateKey(endDate)) {
    errors.endDate =
      "Enter a valid end date.";
  }

  if (
    isDateKey(startDate) &&
    isDateKey(endDate) &&
    endDate <= startDate
  ) {
    errors.endDate =
      "The end date must be after the start date.";
  }

  if (
    guests === null ||
    !Number.isInteger(guests) ||
    guests < 1
  ) {
    errors.guests =
      "Guests must be a whole number above zero.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      errors,
    };
  }

  return {
    success: true,
    data: {
      inquiryId,
      yachts,
      clientName,
      clientEmail,
      clientPhone,
      startDate,
      endDate,
      guests: guests as number,
      notes,
    },
  };
}

function parseProposalYachts(
  body: CreateProposalBody,
  errors: Record<string, string>
): CreateProposalYachtInput[] {
  const rawYachts =
    Array.isArray(body.yachts)
      ? body.yachts
      : [];

  const legacyYachtId =
    readRequiredString(body.yachtId);

  const candidates =
    rawYachts.length > 0
      ? rawYachts
      : legacyYachtId
        ? [
            {
              yachtId: legacyYachtId,
              position: 1,
              weeklyRate:
                body.weeklyRate,
              estimatedTotal:
                body.estimatedTotal,
              currency:
                body.currency,
              availabilityStatus:
                "unverified",
            },
          ]
        : [];

  if (candidates.length === 0) {
    errors.yachts =
      "Select at least one yacht.";
    return [];
  }

  if (candidates.length > 3) {
    errors.yachts =
      "A proposal can contain a maximum of three yachts.";
    return [];
  }

  const parsed:
    CreateProposalYachtInput[] = [];

  const seenIds = new Set<string>();
  const seenPositions =
    new Set<number>();

  candidates.forEach(
    (candidate, index) => {
      const record =
        readRecord(candidate);

      const yachtId =
        readRequiredString(
          record.yachtId
        );

      const rawPosition =
        readNumber(record.position);

      const position =
        rawPosition ??
        index + 1;

      const weeklyRate =
        readNullableNumber(
          record.weeklyRate
        );

      const estimatedTotal =
        readNullableNumber(
          record.estimatedTotal
        );

      const currency =
        (
          readRequiredString(
            record.currency
          ) ||
          readRequiredString(
            body.currency
          ) ||
          "EUR"
        ).toUpperCase();

      const sourceAvailabilityStatus =
        readOptionalString(
          record.availabilityStatus
        );

      if (!yachtId) {
        errors[
          `yachts.${index}.yachtId`
        ] = "Select a yacht.";
      }

      if (
        !Number.isInteger(position) ||
        position < 1 ||
        position > 3
      ) {
        errors[
          `yachts.${index}.position`
        ] =
          "Yacht position must be 1, 2 or 3.";
      }

      if (
        weeklyRate !== null &&
        weeklyRate < 0
      ) {
        errors[
          `yachts.${index}.weeklyRate`
        ] =
          "The weekly rate cannot be negative.";
      }

      if (
        estimatedTotal !== null &&
        estimatedTotal < 0
      ) {
        errors[
          `yachts.${index}.estimatedTotal`
        ] =
          "The estimated total cannot be negative.";
      }

      if (
        !/^[A-Z]{3}$/.test(currency)
      ) {
        errors[
          `yachts.${index}.currency`
        ] =
          "Currency must use a three-letter code.";
      }

      if (
        yachtId &&
        seenIds.has(yachtId)
      ) {
        errors.yachts =
          "The same yacht cannot appear twice in one proposal.";
      }

      if (
        Number.isInteger(position) &&
        seenPositions.has(position)
      ) {
        errors.yachts =
          "Each yacht must have a unique proposal position.";
      }

      if (yachtId) {
        seenIds.add(yachtId);
      }

      if (
        Number.isInteger(position)
      ) {
        seenPositions.add(position);
      }

      parsed.push({
        yachtId,
        position,
        weeklyRate,
        estimatedTotal,
        currency,
        sourceAvailabilityStatus,
      });
    }
  );

  return parsed.sort(
    (left, right) =>
      left.position - right.position
  );
}

function defaultBrokerAccess(
  fleetId: string
): YachtAccessRow {
  return {
    fleet_id: fleetId,
    access_type: "broker_access",
    calendar_authority: "unknown",
    booking_model:
      "owner_approval_required",
    client_proposal_permission: true,
  };
}

function resolveClientAvailabilityStatus(
  access: YachtAccessRow,
  sourceAvailabilityStatus: string | null
):
  | "available"
  | "subject_to_confirmation"
  | "owner_approval_required"
  | "unverified"
  | "unavailable" {
  const normalizedSource =
    sourceAvailabilityStatus
      ?.trim()
      .toLowerCase() ?? null;

  if (
    normalizedSource === "booked" ||
    normalizedSource === "unavailable" ||
    normalizedSource === "maintenance"
  ) {
    return "unavailable";
  }

  if (
    access.access_type === "managed" ||
    access.booking_model ===
      "owner_approval_required"
  ) {
    return "owner_approval_required";
  }

  if (
    access.access_type ===
      "broker_access" ||
    access.booking_model ===
      "confirmation_required"
  ) {
    return "subject_to_confirmation";
  }

  if (
    access.access_type === "controlled" &&
    normalizedSource === "available"
  ) {
    return "available";
  }

  return "unverified";
}

function normalizeProposalStatus(
  value: string | null
): ProposalStatus {
  const normalized =
    value?.trim().toLowerCase();

  if (normalized === "ready") {
    return "Ready";
  }

  if (normalized === "sent") {
    return "Sent";
  }

  if (normalized === "accepted") {
    return "Accepted";
  }

  if (normalized === "declined") {
    return "Declined";
  }

  if (normalized === "expired") {
    return "Expired";
  }

  return "Draft";
}

function generateProposalReference(): string {
  const date = new Date();

  const stamp = [
    date.getUTCFullYear(),
    String(
      date.getUTCMonth() + 1
    ).padStart(2, "0"),
    String(
      date.getUTCDate()
    ).padStart(2, "0"),
  ].join("");

  const random =
    crypto
      .randomUUID()
      .replaceAll("-", "")
      .slice(0, 6)
      .toUpperCase();

  return `PROP-${stamp}-${random}`;
}

function readRequiredString(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
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

function readNumber(
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
    value.trim()
  ) {
    const parsed =
      Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function readNullableNumber(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return readNumber(value);
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

function isDateKey(
  value: string
): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value
    )
  ) {
    return false;
  }

  const date =
    new Date(
      `${value}T00:00:00Z`
    );

  return (
    !Number.isNaN(
      date.getTime()
    ) &&
    date
      .toISOString()
      .slice(0, 10) === value
  );
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
      { status: error.status }
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
      { status: error.status }
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : fallbackMessage;

  console.error(
    "Proposal API error:",
    error
  );

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 500 }
  );
}