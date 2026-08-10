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

type SaveContactBody = {
  yachtId?: unknown;
  managementCompany?: unknown;
  contactName?: unknown;
  role?: unknown;
  email?: unknown;
  phone?: unknown;
};

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
      .from("yacht_contacts")
      .select(
        [
          "id",
          "company_id",
          "fleet_id",
          "management_company",
          "contact_name",
          "role",
          "email",
          "phone",
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
        `Could not load yacht contacts: ${error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
        contacts: (data ?? []).map((row) =>
          serializeContact(row)
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
      "Could not load yacht contacts."
    );
  }
}

export async function POST(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();
    const admin = createAdminClient();

    let body: SaveContactBody;

    try {
      body =
        (await request.json()) as SaveContactBody;
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
    const managementCompany =
      readOptionalString(body.managementCompany);
    const contactName =
      readOptionalString(body.contactName);
    const role =
      readOptionalString(body.role) ??
      "Charter Manager";
    const email = readRequiredString(body.email);
    const phone = readOptionalString(body.phone);

    const fieldErrors: Record<string, string> = {};

    if (!yachtId) {
      fieldErrors.yachtId = "A yacht is required.";
    }

    if (!email) {
      fieldErrors.email =
        "Enter the Charter Manager email.";
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      fieldErrors.email =
        "Enter a valid email address.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Check the manager contact details.",
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
          error: "Yacht not found in the active fleet.",
        },
        {
          status: 404,
        }
      );
    }

    const now = new Date().toISOString();

    const result = await admin
      .from("yacht_contacts")
      .upsert(
        {
          company_id: workspace.companyId,
          fleet_id: yachtId!,
          management_company: managementCompany,
          contact_name: contactName,
          role,
          email: email!,
          phone,
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
          "management_company",
          "contact_name",
          "role",
          "email",
          "phone",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .single();

    if (result.error) {
      throw new Error(
        `Could not save yacht contact: ${result.error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
        contact: serializeContact(result.data),
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
      "Could not save yacht contact."
    );
  }
}

function serializeContact(value: unknown) {
  const row = readUnknownRecord(value);

  return {
    id: String(row.id ?? ""),
    yachtId: String(row.fleet_id ?? ""),
    managementCompany:
      typeof row.management_company === "string"
        ? row.management_company
        : null,
    contactName:
      typeof row.contact_name === "string"
        ? row.contact_name
        : null,
    role:
      typeof row.role === "string"
        ? row.role
        : "Charter Manager",
    email: String(row.email ?? ""),
    phone:
      typeof row.phone === "string"
        ? row.phone
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

  console.error("Yacht contacts API error:", error);

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