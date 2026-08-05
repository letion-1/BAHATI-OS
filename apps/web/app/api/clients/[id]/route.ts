import { NextRequest, NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();
    const body = (await request.json()) as Record<string, unknown>;

    const name = cleanText(body.name);

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: "Client name is required.",
        },
        { status: 400 }
      );
    }

    const email = cleanText(body.email);

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        {
          success: false,
          error: "Enter a valid email address.",
        },
        { status: 400 }
      );
    }

    const payload = {
      name,
      email,
      phone: cleanText(body.phone),
      status: cleanText(body.status) ?? "active",
      vip_level: cleanText(body.vipLevel) ?? "standard",
      preferred_destination: cleanText(
        body.preferredDestination
      ),
      preferred_yacht_type: cleanText(
        body.preferredYachtType
      ),
      notes: cleanText(body.notes),
      preferences:
        body.preferences &&
        typeof body.preferences === "object" &&
        !Array.isArray(body.preferences)
          ? body.preferences
          : {},
      lifetime_value:
        toNonNegativeNumber(body.lifetimeValue) ?? 0,
      last_contacted_at: cleanDate(body.lastContactedAt),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("clients")
      .update(payload)
      .eq("id", id)
      .eq("company_id", workspace.companyId)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(
        `Could not update client: ${
          error?.message ?? "Client not found."
        }`
      );
    }

    return NextResponse.json(
      {
        success: true,
        client: {
          id: data.id,
          name: data.name,
          email: data.email,
          phone: data.phone,
          status: data.status ?? "active",
          vipLevel: data.vip_level ?? "standard",
          preferredDestination:
            data.preferred_destination ?? null,
          preferredYachtType:
            data.preferred_yacht_type ?? null,
          notes: data.notes ?? null,
          preferences: data.preferences ?? {},
          lifetimeValue:
            toFiniteNumber(data.lifetime_value) ?? 0,
          lastContactedAt:
            data.last_contacted_at ?? null,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(error, "Could not update client.");
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", id)
      .eq("company_id", workspace.companyId);

    if (error) {
      throw new Error(
        `Could not delete client: ${error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(error, "Could not delete client.");
  }
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function cleanDate(value: unknown): string | null {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

function toNonNegativeNumber(value: unknown): number | null {
  const parsed = toFiniteNumber(value);

  if (parsed === null) {
    return null;
  }

  return Math.max(0, parsed);
}

function toFiniteNumber(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^\d.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : null;
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
      { status: error.status }
    );
  }

  if (isWorkspaceAccessError(error)) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: error.status }
    );
  }

  const message =
    error instanceof Error ? error.message : fallbackMessage;

  console.error("Client detail API error:", error);

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 500 }
  );
}