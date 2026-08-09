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

type AvailabilityCheckSource =
  | "yachtfolio"
  | "manager_email"
  | "manager_manual"
  | "management_calendar"
  | "other";

type AvailabilityCheckStatus =
  | "available"
  | "booked"
  | "option"
  | "unavailable"
  | "pending";

type CreateAvailabilityCheckBody = {
  inquiryId?: unknown;
  yachtId?: unknown;
  source?: unknown;
  status?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  notes?: unknown;
};

const ALLOWED_SOURCES: AvailabilityCheckSource[] = [
  "yachtfolio",
  "manager_email",
  "manager_manual",
  "management_calendar",
  "other",
];

const ALLOWED_STATUSES: AvailabilityCheckStatus[] = [
  "available",
  "booked",
  "option",
  "unavailable",
  "pending",
];

export async function GET(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();
    const admin = createAdminClient();

    const url = new URL(request.url);
    const inquiryId = url.searchParams.get("inquiryId")?.trim();
    const yachtId = url.searchParams.get("yachtId")?.trim();

    if (!inquiryId) {
      return NextResponse.json(
        {
          success: false,
          error: "An inquiry ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    let query = admin
      .from("availability_checks")
      .select(
        [
          "id",
          "company_id",
          "inquiry_id",
          "yacht_id",
          "source",
          "status",
          "start_date",
          "end_date",
          "checked_at",
          "checked_by",
          "notes",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .eq("company_id", workspace.companyId)
      .eq("inquiry_id", inquiryId)
      .order("checked_at", {
        ascending: false,
      });

    if (yachtId) {
      query = query.eq("yacht_id", yachtId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(
        `Could not load availability checks: ${error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
        checks: (data ?? []).map((row) => serializeCheck(row)),
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
      "Could not load availability checks."
    );
  }
}

export async function POST(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();
    const admin = createAdminClient();

    let body: CreateAvailabilityCheckBody;

    try {
      body =
        (await request.json()) as CreateAvailabilityCheckBody;
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

    const inquiryId = readRequiredString(body.inquiryId);
    const yachtId = readRequiredString(body.yachtId);
    const source = readSource(body.source);
    const status = readStatus(body.status);
    const startDate = readDate(body.startDate);
    const endDate = readDate(body.endDate);
    const notes = readOptionalString(body.notes);

    const fieldErrors: Record<string, string> = {};

    if (!inquiryId) {
      fieldErrors.inquiryId = "Inquiry ID is required.";
    }

    if (!yachtId) {
      fieldErrors.yachtId = "Yacht ID is required.";
    }

    if (!source) {
      fieldErrors.source = "Select a valid availability source.";
    }

    if (!status) {
      fieldErrors.status = "Select a valid availability status.";
    }

    if (!startDate) {
      fieldErrors.startDate = "Start date is required.";
    }

    if (!endDate) {
      fieldErrors.endDate = "End date is required.";
    }

    if (
      startDate &&
      endDate &&
      endDate < startDate
    ) {
      fieldErrors.endDate =
        "End date cannot be earlier than the start date.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Check the availability verification fields.",
          fieldErrors,
        },
        {
          status: 400,
        }
      );
    }

    const inquiryResult = await admin
      .from("inquiries")
      .select("id, company_id")
      .eq("company_id", workspace.companyId)
      .eq("id", inquiryId!)
      .maybeSingle();

    if (inquiryResult.error) {
      throw new Error(
        `Could not validate inquiry: ${inquiryResult.error.message}`
      );
    }

    if (!inquiryResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: "Inquiry not found in the active workspace.",
        },
        {
          status: 404,
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
          error: "Yacht not found in the active fleet.",
        },
        {
          status: 404,
        }
      );
    }

    const now = new Date().toISOString();

    const insertResult = await admin
      .from("availability_checks")
      .insert({
        company_id: workspace.companyId,
        inquiry_id: inquiryId!,
        yacht_id: yachtId!,
        source: source!,
        status: status!,
        start_date: startDate!,
        end_date: endDate!,
        checked_at: now,
        checked_by: workspace.userId,
        notes,
        created_at: now,
        updated_at: now,
      })
      .select(
        [
          "id",
          "company_id",
          "inquiry_id",
          "yacht_id",
          "source",
          "status",
          "start_date",
          "end_date",
          "checked_at",
          "checked_by",
          "notes",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .single();

    if (insertResult.error) {
      throw new Error(
        `Could not save availability check: ${insertResult.error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
        check: serializeCheck(insertResult.data),
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
      "Could not save availability check."
    );
  }
}

function serializeCheck(value: unknown) {
  const row = readUnknownRecord(value);

  return {
    id: String(row.id ?? ""),
    inquiryId: String(row.inquiry_id ?? ""),
    yachtId: String(row.yacht_id ?? ""),
    source: String(row.source ?? ""),
    status: String(row.status ?? ""),
    startDate: String(row.start_date ?? ""),
    endDate: String(row.end_date ?? ""),
    checkedAt: String(row.checked_at ?? ""),
    checkedBy:
      typeof row.checked_by === "string"
        ? row.checked_by
        : null,
    notes:
      typeof row.notes === "string"
        ? row.notes
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
  return normalized.length > 0 ? normalized : null;
}

function readOptionalString(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readSource(
  value: unknown
): AvailabilityCheckSource | null {
  if (typeof value !== "string") {
    return null;
  }

  return ALLOWED_SOURCES.includes(
    value as AvailabilityCheckSource
  )
    ? (value as AvailabilityCheckSource)
    : null;
}

function readStatus(
  value: unknown
): AvailabilityCheckStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  return ALLOWED_STATUSES.includes(
    value as AvailabilityCheckStatus
  )
    ? (value as AvailabilityCheckStatus)
    : null;
}

function readDate(
  value: unknown
): string | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return null;
  }

  return value;
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

  console.error("Availability checks API error:", error);

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