import { NextRequest, NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  href: string | null;
  entity_type: string | null;
  entity_id: string | null;
  priority: string;
  read_at: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const requestedLimit = Number(
      request.nextUrl.searchParams.get("limit") ?? "50"
    );

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 50;

    const { data, error } = await supabase
      .from("notifications")
      .select(
        [
          "id",
          "type",
          "title",
          "message",
          "href",
          "entity_type",
          "entity_id",
          "priority",
          "read_at",
          "created_at",
        ].join(",")
      )
      .eq("company_id", workspace.companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(
        `Could not load notifications: ${error.message}`
      );
    }

    const rows =
      (data ?? []) as unknown as NotificationRow[];

    return NextResponse.json(
      {
        success: true,
        notifications: rows.map(serializeNotification),
        unreadCount: rows.filter(
          (item) => !item.read_at
        ).length,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not load notifications."
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();
    const body = (await request.json()) as {
      type?: unknown;
      title?: unknown;
      message?: unknown;
      href?: unknown;
      entityType?: unknown;
      entityId?: unknown;
      priority?: unknown;
    };

    const title = cleanText(body.title);

    if (!title) {
      return NextResponse.json(
        {
          success: false,
          error: "Notification title is required.",
        },
        { status: 400 }
      );
    }

    const priority = cleanText(body.priority) ?? "normal";

    if (
      !["low", "normal", "high", "critical"].includes(
        priority
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid notification priority.",
        },
        { status: 400 }
      );
    }

    const entityId = cleanText(body.entityId);

    if (entityId && !isUuid(entityId)) {
      return NextResponse.json(
        {
          success: false,
          error: "Entity ID must be a valid UUID.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("notifications")
      .insert({
        company_id: workspace.companyId,
        type: cleanText(body.type) ?? "system",
        title,
        message: cleanText(body.message),
        href: cleanText(body.href),
        entity_type: cleanText(body.entityType),
        entity_id: entityId,
        priority,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(
        `Could not create notification: ${
          error?.message ?? "Unknown error."
        }`
      );
    }

    return NextResponse.json(
      {
        success: true,
        notification: serializeNotification(
          data as unknown as NotificationRow
        ),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not create notification."
    );
  }
}

export async function PATCH() {
  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const { error } = await supabase
      .from("notifications")
      .update({
        read_at: new Date().toISOString(),
      })
      .eq("company_id", workspace.companyId)
      .is("read_at", null);

    if (error) {
      throw new Error(
        `Could not mark notifications as read: ${error.message}`
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return handleRouteError(
      error,
      "Could not update notifications."
    );
  }
}

function serializeNotification(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    href: row.href,
    entityType: row.entity_type,
    entityId: row.entity_id,
    priority: row.priority,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();
  return cleaned || null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function handleRouteError(
  error: unknown,
  fallbackMessage: string
) {
  if (isAuthenticationRequiredError(error)) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }

  if (isWorkspaceAccessError(error)) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : fallbackMessage;

  console.error("Notifications API failed:", error);

  return NextResponse.json(
    { success: false, error: message },
    { status: 500 }
  );
}