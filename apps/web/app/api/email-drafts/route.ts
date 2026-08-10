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

type DraftPurpose =
  | "availability_verification"
  | "general";

type DraftStatus =
  | "draft"
  | "sent"
  | "received"
  | "failed"
  | "archived";

type CreateDraftBody = {
  inquiryId?: unknown;
  yachtId?: unknown;
  managerContactId?: unknown;
  purpose?: unknown;
  toEmail?: unknown;
  toName?: unknown;
  subject?: unknown;
  body?: unknown;
  startDate?: unknown;
  endDate?: unknown;
};

type UpdateDraftBody = {
  id?: unknown;
  toEmail?: unknown;
  toName?: unknown;
  subject?: unknown;
  body?: unknown;
  status?: unknown;
  provider?: unknown;
  externalMessageId?: unknown;
  externalThreadId?: unknown;
};

const PURPOSES: DraftPurpose[] = [
  "availability_verification",
  "general",
];

const STATUSES: DraftStatus[] = [
  "draft",
  "sent",
  "received",
  "failed",
  "archived",
];

export async function GET(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();
    const admin = createAdminClient();

    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    const status = url.searchParams.get("status")?.trim();

    let query = admin
      .from("email_drafts")
      .select(
        [
          "id",
          "company_id",
          "inquiry_id",
          "fleet_id",
          "manager_contact_id",
          "purpose",
          "to_email",
          "to_name",
          "subject",
          "body",
          "start_date",
          "end_date",
          "status",
          "provider",
          "external_message_id",
          "external_thread_id",
          "created_at",
          "updated_at",
          "sent_at",
        ].join(",")
      )
      .eq("company_id", workspace.companyId)
      .order("updated_at", {
        ascending: false,
      });

    if (id) {
      query = query.eq("id", id);
    }

    if (status && STATUSES.includes(status as DraftStatus)) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(
        `Could not load email drafts: ${error.message}`
      );
    }

    const drafts = (data ?? []).map((row) =>
      serializeDraft(row)
    );

    return NextResponse.json(
      {
        success: true,
        drafts,
        draft: id ? drafts[0] ?? null : undefined,
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
      "Could not load email drafts."
    );
  }
}

export async function POST(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();
    const admin = createAdminClient();

    let body: CreateDraftBody;

    try {
      body =
        (await request.json()) as CreateDraftBody;
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

    const inquiryId = readOptionalString(body.inquiryId);
    const yachtId = readOptionalString(body.yachtId);
    const managerContactId =
      readOptionalString(body.managerContactId);
    const purpose =
      readPurpose(body.purpose) ?? "general";
    const toEmail = readRequiredString(body.toEmail);
    const toName = readOptionalString(body.toName);
    const subject = readRequiredString(body.subject);
    const emailBody = readRequiredString(body.body);
    const startDate = readOptionalDate(body.startDate);
    const endDate = readOptionalDate(body.endDate);

    const fieldErrors: Record<string, string> = {};

    if (!toEmail) {
      fieldErrors.toEmail = "Recipient email is required.";
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)
    ) {
      fieldErrors.toEmail = "Enter a valid recipient email.";
    }

    if (!subject) {
      fieldErrors.subject = "Email subject is required.";
    }

    if (!emailBody) {
      fieldErrors.body = "Email body is required.";
    }

    if (
      startDate &&
      endDate &&
      endDate < startDate
    ) {
      fieldErrors.endDate =
        "End date cannot be earlier than start date.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Check the email draft fields.",
          fieldErrors,
        },
        {
          status: 400,
        }
      );
    }

    if (inquiryId) {
      const inquiryResult = await admin
        .from("inquiries")
        .select("id")
        .eq("company_id", workspace.companyId)
        .eq("id", inquiryId)
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
    }

    if (yachtId) {
      const yachtResult = await admin
        .from("fleet")
        .select("id")
        .eq("company_id", workspace.companyId)
        .eq("id", yachtId)
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
    }

    if (managerContactId) {
      const contactResult = await admin
        .from("yacht_contacts")
        .select("id")
        .eq("company_id", workspace.companyId)
        .eq("id", managerContactId)
        .maybeSingle();

      if (contactResult.error) {
        throw new Error(
          `Could not validate manager contact: ${contactResult.error.message}`
        );
      }

      if (!contactResult.data) {
        return NextResponse.json(
          {
            success: false,
            error: "Charter Manager contact was not found.",
          },
          {
            status: 404,
          }
        );
      }
    }

    const now = new Date().toISOString();

    const result = await admin
      .from("email_drafts")
      .insert({
        company_id: workspace.companyId,
        inquiry_id: inquiryId,
        fleet_id: yachtId,
        manager_contact_id: managerContactId,
        purpose,
        to_email: toEmail!,
        to_name: toName,
        subject: subject!,
        body: emailBody!,
        start_date: startDate,
        end_date: endDate,
        status: "draft",
        provider: null,
        created_by: workspace.userId,
        created_at: now,
        updated_at: now,
      })
      .select(
        [
          "id",
          "company_id",
          "inquiry_id",
          "fleet_id",
          "manager_contact_id",
          "purpose",
          "to_email",
          "to_name",
          "subject",
          "body",
          "start_date",
          "end_date",
          "status",
          "provider",
          "external_message_id",
          "external_thread_id",
          "created_at",
          "updated_at",
          "sent_at",
        ].join(",")
      )
      .single();

    if (result.error) {
      throw new Error(
        `Could not create email draft: ${result.error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
        draft: serializeDraft(result.data),
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
      "Could not create email draft."
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();
    const admin = createAdminClient();

    let body: UpdateDraftBody;

    try {
      body =
        (await request.json()) as UpdateDraftBody;
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

    const id = readRequiredString(body.id);

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error: "Email draft ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const currentResult = await admin
      .from("email_drafts")
      .select(
        "id, company_id, inquiry_id, fleet_id, purpose, start_date, end_date, status"
      )
      .eq("company_id", workspace.companyId)
      .eq("id", id)
      .maybeSingle();

    if (currentResult.error) {
      throw new Error(
        `Could not load email draft: ${currentResult.error.message}`
      );
    }

    if (!currentResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: "Email draft was not found.",
        },
        {
          status: 404,
        }
      );
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.toEmail !== undefined) {
      const toEmail = readRequiredString(body.toEmail);

      if (
        !toEmail ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Enter a valid recipient email.",
          },
          {
            status: 400,
          }
        );
      }

      update.to_email = toEmail;
    }

    if (body.toName !== undefined) {
      update.to_name =
        readOptionalString(body.toName);
    }

    if (body.subject !== undefined) {
      const subject = readRequiredString(body.subject);

      if (!subject) {
        return NextResponse.json(
          {
            success: false,
            error: "Email subject cannot be blank.",
          },
          {
            status: 400,
          }
        );
      }

      update.subject = subject;
    }

    if (body.body !== undefined) {
      const emailBody = readRequiredString(body.body);

      if (!emailBody) {
        return NextResponse.json(
          {
            success: false,
            error: "Email body cannot be blank.",
          },
          {
            status: 400,
          }
        );
      }

      update.body = emailBody;
    }

    const nextStatus =
      body.status !== undefined
        ? readStatus(body.status)
        : null;

    if (body.status !== undefined && !nextStatus) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid email status.",
        },
        {
          status: 400,
        }
      );
    }

    if (nextStatus) {
      update.status = nextStatus;

      if (
        nextStatus === "sent" &&
        currentResult.data.status !== "sent"
      ) {
        update.sent_at = new Date().toISOString();
      }
    }

    if (body.provider !== undefined) {
      update.provider =
        readProvider(body.provider);
    }

    if (body.externalMessageId !== undefined) {
      update.external_message_id =
        readOptionalString(body.externalMessageId);
    }

    if (body.externalThreadId !== undefined) {
      update.external_thread_id =
        readOptionalString(body.externalThreadId);
    }

    const updateResult = await admin
      .from("email_drafts")
      .update(update)
      .eq("company_id", workspace.companyId)
      .eq("id", id)
      .select(
        [
          "id",
          "company_id",
          "inquiry_id",
          "fleet_id",
          "manager_contact_id",
          "purpose",
          "to_email",
          "to_name",
          "subject",
          "body",
          "start_date",
          "end_date",
          "status",
          "provider",
          "external_message_id",
          "external_thread_id",
          "created_at",
          "updated_at",
          "sent_at",
        ].join(",")
      )
      .single();

    if (updateResult.error) {
      throw new Error(
        `Could not update email draft: ${updateResult.error.message}`
      );
    }

    if (
      nextStatus === "sent" &&
      currentResult.data.status !== "sent" &&
      currentResult.data.purpose ===
        "availability_verification" &&
      currentResult.data.inquiry_id &&
      currentResult.data.fleet_id &&
      currentResult.data.start_date &&
      currentResult.data.end_date
    ) {
      const now = new Date().toISOString();

      const verificationResult = await admin
        .from("availability_checks")
        .insert({
          company_id: workspace.companyId,
          inquiry_id: currentResult.data.inquiry_id,
          yacht_id: currentResult.data.fleet_id,
          source: "manager_email",
          status: "pending",
          start_date: currentResult.data.start_date,
          end_date: currentResult.data.end_date,
          checked_at: now,
          checked_by: workspace.userId,
          notes: `Availability verification email sent from Yacht OS. Draft ${id}.`,
          created_at: now,
          updated_at: now,
        });

      if (verificationResult.error) {
        console.error(
          "Email was marked sent, but verification history could not be recorded:",
          verificationResult.error
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        draft: serializeDraft(updateResult.data),
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
      "Could not update email draft."
    );
  }
}

function serializeDraft(value: unknown) {
  const row = readUnknownRecord(value);

  return {
    id: String(row.id ?? ""),
    inquiryId:
      typeof row.inquiry_id === "string"
        ? row.inquiry_id
        : null,
    yachtId:
      typeof row.fleet_id === "string"
        ? row.fleet_id
        : null,
    managerContactId:
      typeof row.manager_contact_id === "string"
        ? row.manager_contact_id
        : null,
    purpose: String(row.purpose ?? "general"),
    toEmail: String(row.to_email ?? ""),
    toName:
      typeof row.to_name === "string"
        ? row.to_name
        : null,
    subject: String(row.subject ?? ""),
    body: String(row.body ?? ""),
    startDate:
      typeof row.start_date === "string"
        ? row.start_date
        : null,
    endDate:
      typeof row.end_date === "string"
        ? row.end_date
        : null,
    status: String(row.status ?? "draft"),
    provider:
      typeof row.provider === "string"
        ? row.provider
        : null,
    externalMessageId:
      typeof row.external_message_id === "string"
        ? row.external_message_id
        : null,
    externalThreadId:
      typeof row.external_thread_id === "string"
        ? row.external_thread_id
        : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    sentAt:
      typeof row.sent_at === "string"
        ? row.sent_at
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

function readOptionalDate(
  value: unknown
): string | null {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

function readPurpose(
  value: unknown
): DraftPurpose | null {
  if (typeof value !== "string") {
    return null;
  }

  return PURPOSES.includes(value as DraftPurpose)
    ? (value as DraftPurpose)
    : null;
}

function readStatus(
  value: unknown
): DraftStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  return STATUSES.includes(value as DraftStatus)
    ? (value as DraftStatus)
    : null;
}

function readProvider(
  value: unknown
): "gmail" | "outlook" | "manual" | null {
  if (value === null) {
    return null;
  }

  if (
    value === "gmail" ||
    value === "outlook" ||
    value === "manual"
  ) {
    return value;
  }

  return null;
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

  console.error("Email drafts API error:", error);

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