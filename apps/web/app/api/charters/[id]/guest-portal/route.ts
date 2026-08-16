import {
  createHash,
  randomBytes,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  isAuthenticationRequiredError,
} from "@/lib/auth/require-user";
import {
  getValidGoogleAccessToken,
  sendGmailTextMessage,
} from "@/lib/email/google";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PORTAL_LIFETIME_DAYS = 90;

type RouteContext = {
  params:
    | Promise<{
        id: string;
      }>
    | {
        id: string;
      };
};

type CharterRow = {
  id: string;
  proposal_id: string;
  fleet_id: string | null;
  reference: string;
  client_name: string;
  client_email: string | null;
  yacht_name: string;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  guests: number | null;
  contract_status: string;
  charter_status: string;
};

type PortalRow = {
  id: string;
  token_hint: string | null;
  status: string;
  expires_at: string | null;
  sent_at: string | null;
  opened_at: string | null;
  opened_count: number;
  submitted_at: string | null;
  preferences: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type ConnectionRow = {
  id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string | null;
  email_address: string;
  status: string;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const charterId =
      await readCharterId(context);

    if (!charterId) {
      return badRequest(
        "A charter ID is required."
      );
    }

    const workspace =
      await getCurrentWorkspace();
    const admin =
      createAdminClient();

    const [
      charterResult,
      portalResult,
      connectionResult,
    ] = await Promise.all([
      admin
        .from("charters")
        .select(
          [
            "id",
            "proposal_id",
            "fleet_id",
            "reference",
            "client_name",
            "client_email",
            "yacht_name",
            "start_date",
            "end_date",
            "destination",
            "guests",
            "contract_status",
            "charter_status",
          ].join(",")
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "id",
          charterId
        )
        .maybeSingle(),

      admin
        .from("guest_portals")
        .select(
          [
            "id",
            "token_hint",
            "status",
            "expires_at",
            "sent_at",
            "opened_at",
            "opened_count",
            "submitted_at",
            "preferences",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          charterId
        )
        .maybeSingle(),

      admin
        .from("email_connections")
        .select(
          "id, access_token_encrypted, refresh_token_encrypted, token_expires_at, email_address, status"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "provider",
          "gmail"
        )
        .maybeSingle(),
    ]);

    if (charterResult.error) {
      throw new Error(
        `Could not load charter: ${charterResult.error.message}`
      );
    }

    if (portalResult.error) {
      throw new Error(
        `Could not load guest portal: ${portalResult.error.message}`
      );
    }

    if (connectionResult.error) {
      throw new Error(
        `Could not load Gmail connection: ${connectionResult.error.message}`
      );
    }

    const charter =
      (charterResult.data ??
        null) as CharterRow | null;

    if (!charter) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Charter not found.",
        },
        {
          status: 404,
        }
      );
    }

    const portal =
      (portalResult.data ??
        null) as PortalRow | null;

    const connection =
      (connectionResult.data ??
        null) as ConnectionRow | null;

    return NextResponse.json(
      {
        success: true,
        charter:
          serializeCharter(
            charter
          ),
        portal:
          portal
            ? serializePortal(
                portal
              )
            : null,
        readiness: {
          contractSigned:
            charter.contract_status ===
            "signed",
          clientEmail:
            charter.client_email,
          clientEmailAvailable:
            Boolean(
              charter.client_email
            ),
          gmailConnected:
            connection?.status ===
            "connected",
          gmailAddress:
            connection?.email_address ??
            null,
        },
      },
      {
        status: 200,
        headers:
          noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not load guest portal."
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const charterId =
      await readCharterId(context);

    if (!charterId) {
      return badRequest(
        "A charter ID is required."
      );
    }

    let body: {
      action?: unknown;
    };

    try {
      body =
        (await request.json()) as {
          action?: unknown;
        };
    } catch {
      return badRequest(
        "The request body must be valid JSON."
      );
    }

    const action =
      cleanText(
        body.action
      );

    if (
      !action ||
      ![
        "generate",
        "send",
        "revoke",
      ].includes(action)
    ) {
      return badRequest(
        "Choose generate, send, or revoke."
      );
    }

    const workspace =
      await getCurrentWorkspace();
    const admin =
      createAdminClient();

    const charterResult =
      await admin
        .from("charters")
        .select(
          [
            "id",
            "proposal_id",
            "fleet_id",
            "reference",
            "client_name",
            "client_email",
            "yacht_name",
            "start_date",
            "end_date",
            "destination",
            "guests",
            "contract_status",
            "charter_status",
          ].join(",")
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "id",
          charterId
        )
        .maybeSingle();

    if (charterResult.error) {
      throw new Error(
        `Could not load charter: ${charterResult.error.message}`
      );
    }

    const charter =
      (charterResult.data ??
        null) as CharterRow | null;

    if (!charter) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Charter not found.",
        },
        {
          status: 404,
        }
      );
    }

    if (action === "revoke") {
      const now =
        new Date().toISOString();

      const revokeResult =
        await admin
          .from("guest_portals")
          .update({
            status:
              "revoked",
            token_hash:
              null,
            token_hint:
              null,
            updated_at:
              now,
          })
          .eq(
            "company_id",
            workspace.companyId
          )
          .eq(
            "charter_id",
            charterId
          );

      if (revokeResult.error) {
        throw new Error(
          `Could not revoke guest portal: ${revokeResult.error.message}`
        );
      }

      return NextResponse.json(
        {
          success: true,
          revoked: true,
        },
        {
          status: 200,
          headers:
            noStoreHeaders(),
        }
      );
    }

    if (
      charter.contract_status !==
      "signed"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Mark the Charter Agreement signed before opening the Guest Preference Portal.",
        },
        {
          status: 409,
        }
      );
    }

    const token =
      randomBytes(32)
        .toString("base64url");

    const tokenHash =
      hashToken(token);

    const tokenHint =
      token.slice(-6);

    const now =
      new Date();

    const expiresAt =
      new Date(
        now.getTime() +
          PORTAL_LIFETIME_DAYS *
            24 *
            60 *
            60 *
            1000
      ).toISOString();

    const nowIso =
      now.toISOString();

    const upsertResult =
      await admin
        .from("guest_portals")
        .upsert(
          {
            company_id:
              workspace.companyId,
            charter_id:
              charterId,
            token_hash:
              tokenHash,
            token_hint:
              tokenHint,
            status:
              "active",
            expires_at:
              expiresAt,
            created_by:
              workspace.userId,
            updated_at:
              nowIso,
          },
          {
            onConflict:
              "company_id,charter_id",
          }
        )
        .select(
          [
            "id",
            "token_hint",
            "status",
            "expires_at",
            "sent_at",
            "opened_at",
            "opened_count",
            "submitted_at",
            "preferences",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .single();

    if (
      upsertResult.error ||
      !upsertResult.data
    ) {
      throw new Error(
        `Could not create guest portal: ${
          upsertResult.error
            ?.message ??
          "Unknown error."
        }`
      );
    }

    const portal =
      upsertResult.data as unknown as PortalRow;

    const guestUrl =
      buildGuestUrl(
        request,
        token
      );

    if (
      action ===
      "generate"
    ) {
      return NextResponse.json(
        {
          success: true,
          portal:
            serializePortal(
              portal
            ),
          guestUrl,
        },
        {
          status: 201,
          headers:
            noStoreHeaders(),
        }
      );
    }

    if (!charter.client_email) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Add the client's email address before sending the guest portal.",
        },
        {
          status: 409,
        }
      );
    }

    const connectionResult =
      await admin
        .from(
          "email_connections"
        )
        .select(
          "id, access_token_encrypted, refresh_token_encrypted, token_expires_at, email_address, status"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "provider",
          "gmail"
        )
        .maybeSingle();

    if (
      connectionResult.error
    ) {
      throw new Error(
        `Could not load Gmail connection: ${connectionResult.error.message}`
      );
    }

    const connection =
      (connectionResult.data ??
        null) as ConnectionRow | null;

    if (
      !connection ||
      connection.status !==
        "connected"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Connect Gmail before sending the Guest Preference Portal.",
        },
        {
          status: 409,
        }
      );
    }

    const email =
      buildGuestPortalEmail({
        companyName:
          workspace.companyName ||
          "Yacht OS",
        charter,
        guestUrl,
      });

    const draftResult =
      await admin
        .from("email_drafts")
        .insert({
          company_id:
            workspace.companyId,
          inquiry_id:
            charter.proposal_id,
          fleet_id:
            charter.fleet_id,
          manager_contact_id:
            null,
          purpose:
            "general",
          to_email:
            charter.client_email,
          to_name:
            charter.client_name,
          subject:
            email.subject,
          body:
            email.body,
          start_date:
            charter.start_date,
          end_date:
            charter.end_date,
          status:
            "draft",
          provider:
            null,
          created_by:
            workspace.userId,
          created_at:
            nowIso,
          updated_at:
            nowIso,
        })
        .select("id")
        .single();

    if (
      draftResult.error ||
      !draftResult.data
    ) {
      throw new Error(
        `Could not create guest portal email audit: ${
          draftResult.error
            ?.message ??
          "Unknown error."
        }`
      );
    }

    const draftId =
      String(
        draftResult.data.id
      );

    try {
      const accessToken =
        await getValidGoogleAccessToken({
          admin,
          connection,
        });

      const sent =
        await sendGmailTextMessage({
          accessToken,
          to:
            charter.client_email,
          subject:
            email.subject,
          body:
            email.body,
        });

      const sentAt =
        new Date().toISOString();

      await Promise.all([
        admin
          .from("email_drafts")
          .update({
            status:
              "sent",
            provider:
              "gmail",
            external_message_id:
              sent.id,
            external_thread_id:
              sent.threadId,
            sent_at:
              sentAt,
            updated_at:
              sentAt,
          })
          .eq(
            "company_id",
            workspace.companyId
          )
          .eq(
            "id",
            draftId
          ),

        admin
          .from("guest_portals")
          .update({
            sent_at:
              sentAt,
            updated_at:
              sentAt,
          })
          .eq(
            "company_id",
            workspace.companyId
          )
          .eq(
            "charter_id",
            charterId
          ),

        admin
          .from(
            "email_connections"
          )
          .update({
            last_used_at:
              sentAt,
            updated_at:
              sentAt,
          })
          .eq(
            "company_id",
            workspace.companyId
          )
          .eq(
            "provider",
            "gmail"
          ),
      ]);

      return NextResponse.json(
        {
          success: true,
          sent: true,
          sender:
            connection.email_address,
          guestUrl,
          portal: {
            ...serializePortal(
              portal
            ),
            sentAt,
          },
        },
        {
          status: 200,
          headers:
            noStoreHeaders(),
        }
      );
    } catch (sendError) {
      await admin
        .from("email_drafts")
        .update({
          status:
            "failed",
          provider:
            "gmail",
          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "id",
          draftId
        );

      throw sendError;
    }
  } catch (error) {
    return handleRouteError(
      error,
      "Could not update guest portal."
    );
  }
}

function serializeCharter(
  charter: CharterRow
) {
  return {
    id:
      charter.id,
    reference:
      charter.reference,
    clientName:
      charter.client_name,
    clientEmail:
      charter.client_email,
    yachtName:
      charter.yacht_name,
    startDate:
      charter.start_date,
    endDate:
      charter.end_date,
    destination:
      charter.destination,
    guests:
      charter.guests,
    contractStatus:
      charter.contract_status,
    charterStatus:
      charter.charter_status,
  };
}

function serializePortal(
  portal: PortalRow
) {
  return {
    id:
      portal.id,
    status:
      portal.status,
    tokenHint:
      portal.token_hint,
    expiresAt:
      portal.expires_at,
    sentAt:
      portal.sent_at,
    openedAt:
      portal.opened_at,
    openedCount:
      portal.opened_count,
    submittedAt:
      portal.submitted_at,
    preferences:
      portal.preferences ??
      {},
    createdAt:
      portal.created_at,
    updatedAt:
      portal.updated_at,
  };
}

function buildGuestPortalEmail({
  companyName,
  charter,
  guestUrl,
}: {
  companyName: string;
  charter: CharterRow;
  guestUrl: string;
}) {
  return {
    subject:
      `Your ${charter.yacht_name} Charter Experience`,
    body: [
      `Dear ${charter.client_name},`,
      "",
      `Your charter aboard ${charter.yacht_name} is ready for the next planning stage.`,
      "",
      `Charter reference: ${charter.reference}`,
      `Charter period: ${formatDateRange(
        charter.start_date,
        charter.end_date
      )}`,
      charter.destination
        ? `Destination: ${charter.destination}`
        : null,
      "",
      "Use your private link below to share travel details, dining requests, provisioning preferences, activities and special requests:",
      "",
      guestUrl,
      "",
      "Your selections are requests for your broker to arrange. Supplier availability and final confirmation remain with your broker and the relevant yacht or service provider.",
      "",
      "Please keep this private link confidential.",
      "",
      `Kind regards,`,
      companyName,
    ]
      .filter(
        (
          line
        ): line is string =>
          line !== null
      )
      .join("\n"),
  };
}

function buildGuestUrl(
  request: NextRequest,
  token: string
) {
  const configuredBase =
    process.env
      .NEXT_PUBLIC_APP_URL
      ?.trim()
      .replace(
        /\/+$/,
        ""
      );

  const base =
    configuredBase ||
    request.nextUrl.origin;

  return `${base}/guest/${encodeURIComponent(
    token
  )}`;
}

function hashToken(
  token: string
) {
  return createHash(
    "sha256"
  )
    .update(token)
    .digest("hex");
}

async function readCharterId(
  context: RouteContext
) {
  const params =
    await Promise.resolve(
      context.params
    );

  return (
    params.id?.trim() ||
    null
  );
}

function cleanText(
  value: unknown
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned.length > 0
    ? cleaned
    : null;
}

function formatDateRange(
  start: string | null,
  end: string | null
) {
  return `${start ?? "Date TBC"} to ${
    end ?? "Date TBC"
  }`;
}

function badRequest(
  message: string
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status: 400,
    }
  );
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
        status:
          error.status,
      }
    );
  }

  if (
    isWorkspaceAccessError(
      error
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status:
          error.status,
      }
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : fallbackMessage;

  console.error(
    "Guest portal API error:",
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