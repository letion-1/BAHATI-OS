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

type AccessType =
  | "controlled"
  | "managed"
  | "broker_access"
  | "reference";

type CalendarAuthority =
  | "our_company"
  | "owner"
  | "charter_manager"
  | "operator"
  | "unknown";

type BookingModel =
  | "direct"
  | "confirmation_required"
  | "owner_approval_required"
  | "reference_only";

type SaveAccessBody = {
  yachtId?: unknown;
  accessType?: unknown;
  calendarAuthority?: unknown;
  bookingModel?: unknown;
  clientProposalPermission?: unknown;
  publicListingPermission?: unknown;
  notes?: unknown;
};

const ACCESS_TYPES: AccessType[] = [
  "controlled",
  "managed",
  "broker_access",
  "reference",
];

const CALENDAR_AUTHORITIES: CalendarAuthority[] = [
  "our_company",
  "owner",
  "charter_manager",
  "operator",
  "unknown",
];

const BOOKING_MODELS: BookingModel[] = [
  "direct",
  "confirmation_required",
  "owner_approval_required",
  "reference_only",
];

export async function GET(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();
    const admin = createAdminClient();

    const url = new URL(request.url);

    const yachtId =
      url.searchParams.get("yachtId")?.trim() ?? "";

    const yachtIds = (
      url.searchParams.get("yachtIds") ?? ""
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    let query = admin
      .from("yacht_access_profiles")
      .select(
        [
          "id",
          "company_id",
          "fleet_id",
          "access_type",
          "calendar_authority",
          "booking_model",
          "client_proposal_permission",
          "public_listing_permission",
          "notes",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .eq("company_id", workspace.companyId)
      .order("updated_at", {
        ascending: false,
      });

    if (yachtId) {
      query = query.eq("fleet_id", yachtId);
    } else if (yachtIds.length > 0) {
      query = query.in("fleet_id", yachtIds);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(
        `Could not load yacht access profiles: ${error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
        profiles: (data ?? []).map((row) =>
          serializeProfile(row)
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
      "Could not load yacht access profiles."
    );
  }
}

export async function POST(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();
    const admin = createAdminClient();

    let body: SaveAccessBody;

    try {
      body =
        (await request.json()) as SaveAccessBody;
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

    const yachtId = readRequiredString(body.yachtId);
    const accessType = readAccessType(body.accessType);
    const calendarAuthority =
      readCalendarAuthority(body.calendarAuthority);
    const bookingModel =
      readBookingModel(body.bookingModel);
    const clientProposalPermission =
      readBoolean(body.clientProposalPermission);
    const publicListingPermission =
      readBoolean(body.publicListingPermission);
    const notes = readOptionalString(body.notes);

    const fieldErrors: Record<string, string> = {};

    if (!yachtId) {
      fieldErrors.yachtId = "A yacht is required.";
    }

    if (!accessType) {
      fieldErrors.accessType =
        "Select a valid yacht access type.";
    }

    if (!calendarAuthority) {
      fieldErrors.calendarAuthority =
        "Select who controls the calendar.";
    }

    if (!bookingModel) {
      fieldErrors.bookingModel =
        "Select a valid booking model.";
    }

    if (clientProposalPermission === null) {
      fieldErrors.clientProposalPermission =
        "Client proposal permission must be true or false.";
    }

    if (publicListingPermission === null) {
      fieldErrors.publicListingPermission =
        "Public listing permission must be true or false.";
    }

    if (
      accessType === "reference" &&
      clientProposalPermission === true
    ) {
      fieldErrors.clientProposalPermission =
        "Reference-only yachts cannot be enabled for client proposals.";
    }

    if (
      bookingModel === "reference_only" &&
      accessType !== "reference"
    ) {
      fieldErrors.bookingModel =
        "Reference-only booking is only valid for reference yachts.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Check the yacht access settings.",
          fieldErrors,
        },
        {
          status: 400,
        }
      );
    }

    const yachtResult = await admin
      .from("fleet")
      .select("id, company_id")
      .eq("company_id", workspace.companyId)
      .eq("id", yachtId!)
      .maybeSingle();

    if (yachtResult.error) {
      throw new Error(
        `Could not validate yacht: ${yachtResult.error.message}`
      );
    }

    if (!yachtResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: "Yacht not found in the active workspace.",
        },
        {
          status: 404,
        }
      );
    }

    const now = new Date().toISOString();

    const result = await admin
      .from("yacht_access_profiles")
      .upsert(
        {
          company_id: workspace.companyId,
          fleet_id: yachtId!,
          access_type: accessType!,
          calendar_authority: calendarAuthority!,
          booking_model: bookingModel!,
          client_proposal_permission:
            clientProposalPermission!,
          public_listing_permission:
            publicListingPermission!,
          notes,
          created_by: workspace.userId,
          updated_at: now,
        },
        {
          onConflict: "company_id,fleet_id",
        }
      )
      .select(
        [
          "id",
          "company_id",
          "fleet_id",
          "access_type",
          "calendar_authority",
          "booking_model",
          "client_proposal_permission",
          "public_listing_permission",
          "notes",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .single();

    if (result.error) {
      throw new Error(
        `Could not save yacht access profile: ${result.error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
        profile: serializeProfile(result.data),
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
      "Could not save yacht access profile."
    );
  }
}

function serializeProfile(value: unknown) {
  const row = readUnknownRecord(value);

  return {
    id: String(row.id ?? ""),
    yachtId: String(row.fleet_id ?? ""),
    accessType: String(row.access_type ?? ""),
    calendarAuthority: String(
      row.calendar_authority ?? "unknown"
    ),
    bookingModel: String(
      row.booking_model ?? "confirmation_required"
    ),
    clientProposalPermission:
      row.client_proposal_permission === true,
    publicListingPermission:
      row.public_listing_permission === true,
    notes:
      typeof row.notes === "string"
        ? row.notes
        : null,
    updatedAt:
      typeof row.updated_at === "string"
        ? row.updated_at
        : null,
  };
}

function readUnknownRecord(
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

function readRequiredString(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0
    ? normalized
    : null;
}

function readOptionalString(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0
    ? normalized
    : null;
}

function readAccessType(
  value: unknown
): AccessType | null {
  if (typeof value !== "string") {
    return null;
  }

  return ACCESS_TYPES.includes(
    value as AccessType
  )
    ? (value as AccessType)
    : null;
}

function readCalendarAuthority(
  value: unknown
): CalendarAuthority | null {
  if (typeof value !== "string") {
    return null;
  }

  return CALENDAR_AUTHORITIES.includes(
    value as CalendarAuthority
  )
    ? (value as CalendarAuthority)
    : null;
}

function readBookingModel(
  value: unknown
): BookingModel | null {
  if (typeof value !== "string") {
    return null;
  }

  return BOOKING_MODELS.includes(
    value as BookingModel
  )
    ? (value as BookingModel)
    : null;
}

function readBoolean(
  value: unknown
): boolean | null {
  return typeof value === "boolean"
    ? value
    : null;
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

  console.error("Yacht access API error:", error);

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