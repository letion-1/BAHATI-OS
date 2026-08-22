import { NextResponse } from "next/server";

import {
  isAuthenticationRequiredError,
} from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getValidGoogleAccessToken,
  sendGmailTextMessage,
} from "@/lib/email/google";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

/**
 * The columns this route reads from email_drafts. Declared explicitly rather
 * than cast to `any`, so a renamed column fails the build instead of becoming
 * `undefined` at runtime and silently sending an empty email.
 */
type EmailDraftRow = {
  status: string | null;
  to_email: string | null;
  subject: string | null;
  body: string | null;
  purpose: string | null;
  inquiry_id: string | null;
  fleet_id: string | null;
  start_date: string | null;
  end_date: string | null;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SendBody = {
  draftId?: unknown;
};

export async function POST(
  request: Request
) {
  try {
    const workspace =
      await getCurrentWorkspace();

    const admin =
      createAdminClient();

    let body: SendBody;

    try {
      body =
        (await request.json()) as SendBody;
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

    const draftId =
      typeof body.draftId === "string"
        ? body.draftId.trim()
        : "";

    if (!draftId) {
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

    const draftResult = await admin
      .from("email_drafts")
      .select(
        [
          "id",
          "company_id",
          "inquiry_id",
          "fleet_id",
          "purpose",
          "to_email",
          "to_name",
          "subject",
          "body",
          "start_date",
          "end_date",
          "status",
        ].join(",")
      )
      .eq(
        "company_id",
        workspace.companyId
      )
      .eq("id", draftId)
      .maybeSingle();

    if (draftResult.error) {
      throw new Error(
        `Could not load email draft: ${draftResult.error.message}`
      );
    }

    if (!draftResult.data) {
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

    const draft =
      draftResult.data as unknown as EmailDraftRow;

    if (draft.status === "sent") {
      return NextResponse.json(
        {
          success: false,
          error:
            "This email has already been sent.",
        },
        {
          status: 409,
        }
      );
    }

    const connectionResult = await admin
      .from("email_connections")
      .select(
        "id, access_token_encrypted, refresh_token_encrypted, token_expires_at, email_address, status"
      )
      .eq(
        "company_id",
        workspace.companyId
      )
      .eq("provider", "gmail")
      .maybeSingle();

    if (connectionResult.error) {
      throw new Error(
        `Could not load Gmail connection: ${connectionResult.error.message}`
      );
    }

    if (
      !connectionResult.data ||
      connectionResult.data.status !==
        "connected"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Connect Gmail before sending this draft.",
        },
        {
          status: 409,
        }
      );
    }

    const accessToken =
      await getValidGoogleAccessToken({
        admin,
        connection:
          connectionResult.data,
      });

    if (
      !draft.to_email ||
      !draft.subject ||
      !draft.body
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This draft is missing a recipient, subject or body.",
        },
        {
          status: 400,
        }
      );
    }

    const sent =
      await sendGmailTextMessage({
        accessToken,
        to: draft.to_email,
        subject: draft.subject,
        body: draft.body,
      });

    const now =
      new Date().toISOString();

    const updateResult = await admin
      .from("email_drafts")
      .update({
        status: "sent",
        provider: "gmail",
        external_message_id: sent.id,
        external_thread_id:
          sent.threadId,
        sent_at: now,
        updated_at: now,
      })
      .eq(
        "company_id",
        workspace.companyId
      )
      .eq("id", draftId)
      .select(
        [
          "id",
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
        `Email was sent, but Bahari OS could not save the sent state: ${updateResult.error.message}`
      );
    }

    await admin
      .from("email_connections")
      .update({
        last_used_at: now,
        updated_at: now,
      })
      .eq(
        "company_id",
        workspace.companyId
      )
      .eq("provider", "gmail");

    if (
      draft.purpose ===
        "availability_verification" &&
      draft.inquiry_id &&
      draft.fleet_id &&
      draft.start_date &&
      draft.end_date
    ) {
      const verificationResult =
        await admin
          .from(
            "availability_checks"
          )
          .insert({
            company_id:
              workspace.companyId,
            inquiry_id:
              draft.inquiry_id,
            yacht_id:
              draft.fleet_id,
            source: "manager_email",
            status: "pending",
            start_date:
              draft.start_date,
            end_date:
              draft.end_date,
            checked_at: now,
            checked_by:
              workspace.userId,
            notes:
              `Availability verification sent via Gmail from ${connectionResult.data.email_address}. Gmail message ${sent.id}.`,
            created_at: now,
            updated_at: now,
          });

      if (
        verificationResult.error
      ) {
        console.error(
          "Gmail sent but verification history could not be recorded:",
          verificationResult.error
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        draft: serializeDraft(
          updateResult.data
        ),
        sender:
          connectionResult.data
            .email_address,
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
        {
          status: error.status,
        }
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
        {
          status: error.status,
        }
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Could not send Gmail message.";

    console.error(
      "Gmail send error:",
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
}

function serializeDraft(
  value: unknown
) {
  const row =
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? (value as Record<
          string,
          unknown
        >)
      : {};

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
      typeof row.manager_contact_id ===
      "string"
        ? row.manager_contact_id
        : null,
    purpose:
      String(
        row.purpose ?? "general"
      ),
    toEmail:
      String(row.to_email ?? ""),
    toName:
      typeof row.to_name === "string"
        ? row.to_name
        : null,
    subject:
      String(row.subject ?? ""),
    body: String(row.body ?? ""),
    startDate:
      typeof row.start_date === "string"
        ? row.start_date
        : null,
    endDate:
      typeof row.end_date === "string"
        ? row.end_date
        : null,
    status:
      String(row.status ?? "sent"),
    provider:
      typeof row.provider === "string"
        ? row.provider
        : null,
    externalMessageId:
      typeof row.external_message_id ===
      "string"
        ? row.external_message_id
        : null,
    externalThreadId:
      typeof row.external_thread_id ===
      "string"
        ? row.external_thread_id
        : null,
    createdAt:
      String(row.created_at ?? ""),
    updatedAt:
      String(row.updated_at ?? ""),
    sentAt:
      typeof row.sent_at === "string"
        ? row.sent_at
        : null,
  };
}