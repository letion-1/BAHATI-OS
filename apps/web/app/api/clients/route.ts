import { NextRequest, NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  vip_level: string | null;
  preferred_destination: string | null;
  preferred_yacht_type: string | null;
  notes: string | null;
  preferences: Record<string, unknown> | null;
  lifetime_value: number | string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const search = request.nextUrl.searchParams
      .get("search")
      ?.trim();

    let query = supabase
      .from("clients")
      .select(
        [
          "id",
          "company_id",
          "name",
          "email",
          "phone",
          "status",
          "vip_level",
          "preferred_destination",
          "preferred_yacht_type",
          "notes",
          "preferences",
          "lifetime_value",
          "last_contacted_at",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .eq("company_id", workspace.companyId)
      .order("updated_at", { ascending: false });

    if (search) {
      query = query.or(
        [
          `name.ilike.%${escapeSearch(search)}%`,
          `email.ilike.%${escapeSearch(search)}%`,
          `phone.ilike.%${escapeSearch(search)}%`,
          `preferred_destination.ilike.%${escapeSearch(search)}%`,
        ].join(",")
      );
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Could not load clients: ${error.message}`);
    }

    const clients = (data ?? []) as unknown as ClientRow[];

    return NextResponse.json(
      {
        success: true,
        clients: clients.map(serializeClient),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return handleRouteError(error, "Could not load clients.");
  }
}

export async function POST(request: NextRequest) {
  try {
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
    const phone = cleanText(body.phone);

    if (email && !isValidEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          error: "Enter a valid email address.",
        },
        { status: 400 }
      );
    }

    const payload = {
      company_id: workspace.companyId,
      name,
      email,
      phone,
      status: cleanText(body.status) ?? "active",
      vip_level: cleanText(body.vipLevel) ?? "standard",
      preferred_destination: cleanText(
        body.preferredDestination
      ),
      preferred_yacht_type: cleanText(
        body.preferredYachtType
      ),
      notes: cleanText(body.notes),
      preferences: normalizePreferences(body.preferences),
      lifetime_value: toNonNegativeNumber(body.lifetimeValue) ?? 0,
      last_contacted_at: cleanDate(body.lastContactedAt),
    };

    const { data, error } = await supabase
      .from("clients")
      .insert(payload)
      .select(
        [
          "id",
          "company_id",
          "name",
          "email",
          "phone",
          "status",
          "vip_level",
          "preferred_destination",
          "preferred_yacht_type",
          "notes",
          "preferences",
          "lifetime_value",
          "last_contacted_at",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .single();

    if (error || !data) {
      throw new Error(
        `Could not create client: ${
          error?.message ?? "Unknown database error."
        }`
      );
    }

    return NextResponse.json(
      {
        success: true,
        client: serializeClient(
          data as unknown as ClientRow
        ),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error, "Could not create client.");
  }
}

function serializeClient(client: ClientRow) {
  return {
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    status: client.status ?? "active",
    vipLevel: client.vip_level ?? "standard",
    preferredDestination: client.preferred_destination,
    preferredYachtType: client.preferred_yacht_type,
    notes: client.notes,
    preferences: client.preferences ?? {},
    lifetimeValue: toFiniteNumber(client.lifetime_value) ?? 0,
    lastContactedAt: client.last_contacted_at,
    createdAt: client.created_at,
    updatedAt: client.updated_at,
  };
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

function normalizePreferences(
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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeSearch(value: string): string {
  return value.replace(/[,%()]/g, " ");
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

  console.error("Clients API error:", error);

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 500 }
  );
}