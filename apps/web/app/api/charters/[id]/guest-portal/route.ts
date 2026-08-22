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
import {
  decryptEmailToken,
  encryptEmailToken,
} from "@/lib/email/token-crypto";
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
    | Promise<{ id: string }>
    | { id: string };
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
  token_hash: string | null;
  token_encrypted: string | null;
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
        .eq("id", charterId)
        .maybeSingle(),

      admin
        .from("guest_portals")
        .select(
          [
            "id",
            "token_hash",
            "token_encrypted",
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
        `Could not load Charter Portal: ${portalResult.error.message}`
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
          error: "Charter not found.",
        },
        { status: 404 }
      );
    }

    const portal =
      (portalResult.data ??
        null) as PortalRow | null;

    const connection =
      (connectionResult.data ??
        null) as ConnectionRow | null;

    const recoverableUrl =
      portal &&
      portal.status !== "revoked" &&
      portal.token_encrypted
        ? buildGuestUrl(
            _request,
            decryptEmailToken(
              portal.token_encrypted
            )
          )
        : null;

    return NextResponse.json(
      {
        success: true,
        charter:
          serializeCharter(charter),
        portal:
          portal
            ? serializePortal(
                portal
              )
            : null,
        guestUrl:
          recoverableUrl,
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
          stableLinkAvailable:
            Boolean(
              recoverableUrl
            ),
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
      "Could not load Charter Portal."
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

    const [
      charterResult,
      existingPortalResult,
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
        .eq("id", charterId)
        .maybeSingle(),

      admin
        .from("guest_portals")
        .select(
          [
            "id",
            "token_hash",
            "token_encrypted",
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
    ]);

    if (charterResult.error) {
      throw new Error(
        `Could not load charter: ${charterResult.error.message}`
      );
    }

    if (existingPortalResult.error) {
      throw new Error(
        `Could not load Charter Portal: ${existingPortalResult.error.message}`
      );
    }

    const charter =
      (charterResult.data ??
        null) as CharterRow | null;

    if (!charter) {
      return NextResponse.json(
        {
          success: false,
          error: "Charter not found.",
        },
        { status: 404 }
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
            token_hash: null,
            token_encrypted:
              null,
            token_hint: null,
            updated_at: now,
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
          `Could not revoke Charter Portal: ${revokeResult.error.message}`
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
            "Mark the Charter Agreement signed before activating the client Charter Portal.",
        },
        { status: 409 }
      );
    }

    const existingPortal =
      (existingPortalResult.data ??
        null) as PortalRow | null;

    const portalAccess =
      await ensureStablePortal({
        admin,
        companyId:
          workspace.companyId,
        charterId,
        userId:
          workspace.userId,
        existingPortal,
        forceRotate:
          action === "generate",
      });

    const portal: PortalRow = portalAccess.portal as PortalRow;

    const guestUrl =
      buildGuestUrl(
        request,
        portalAccess.token
      );

    if (
      action === "generate"
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
            "Add the client's email address before sending the Charter Portal.",
        },
        { status: 409 }
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

    if (connectionResult.error) {
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
            "Connect Gmail before sending the Charter Portal.",
        },
        { status: 409 }
      );
    }

    const email =
      buildCharterPortalEmail({
        companyName:
          workspace.companyName ||
          "Bahari OS",
        charter,
        guestUrl,
      });

    const nowIso =
      new Date().toISOString();

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
          purpose: "general",
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
          status: "draft",
          provider: null,
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
        `Could not create Charter Portal email audit: ${
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

      const [
        draftUpdate,
        portalUpdate,
        connectionUpdate,
      ] = await Promise.all([
        admin
          .from("email_drafts")
          .update({
            status: "sent",
            provider: "gmail",
            external_message_id:
              sent.id,
            external_thread_id:
              sent.threadId,
            sent_at: sentAt,
            updated_at:
              sentAt,
          })
          .eq(
            "company_id",
            workspace.companyId
          )
          .eq("id", draftId),

        admin
          .from("guest_portals")
          .update({
            sent_at: sentAt,
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

      if (draftUpdate.error) {
        console.error(
          "Charter Portal email sent but email audit could not be finalized:",
          draftUpdate.error
        );
      }

      if (portalUpdate.error) {
        console.error(
          "Charter Portal email sent but portal sent_at could not be updated:",
          portalUpdate.error
        );
      }

      if (
        connectionUpdate.error
      ) {
        console.error(
          "Charter Portal email sent but Gmail last_used_at could not be updated:",
          connectionUpdate.error
        );
      }

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
          status: "failed",
          provider: "gmail",
          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq("id", draftId);

      throw sendError;
    }
  } catch (error) {
    return handleRouteError(
      error,
      "Could not update Charter Portal."
    );
  }
}

async function ensureStablePortal({
  admin,
  companyId,
  charterId,
  userId,
  existingPortal,
  forceRotate,
}: {
  admin: ReturnType<
    typeof createAdminClient
  >;
  companyId: string;
  charterId: string;
  userId: string;
  existingPortal:
    PortalRow | null;
  forceRotate: boolean;
}) {
  const existingToken =
    !forceRotate &&
    existingPortal &&
    existingPortal.status !==
      "revoked" &&
    existingPortal
      .token_encrypted
      ? decryptEmailToken(
          existingPortal
            .token_encrypted
        )
      : null;

  if (existingToken) {
    return {
      token:
        existingToken,
      portal:
        existingPortal,
    };
  }

  const token =
    randomBytes(32)
      .toString(
        "base64url"
      );

  const now =
    new Date();

  const nowIso =
    now.toISOString();

  const expiresAt =
    new Date(
      now.getTime() +
        PORTAL_LIFETIME_DAYS *
          24 *
          60 *
          60 *
          1000
    ).toISOString();

  const nextStatus =
    existingPortal
      ?.submitted_at
      ? "submitted"
      : "active";

  const upsertResult =
    await admin
      .from("guest_portals")
      .upsert(
        {
          company_id:
            companyId,
          charter_id:
            charterId,
          token_hash:
            hashToken(token),
          token_encrypted:
            encryptEmailToken(
              token
            ),
          token_hint:
            token.slice(-6),
          status:
            nextStatus,
          expires_at:
            expiresAt,
          created_by:
            userId,
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
          "token_hash",
          "token_encrypted",
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
      `Could not create Charter Portal: ${
        upsertResult.error
          ?.message ??
        "Unknown error."
      }`
    );
  }

  return {
    token,
    portal:
      upsertResult.data as unknown as PortalRow,
  };
}

function serializeCharter(
  charter: CharterRow
) {
  return {
    id: charter.id,
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
    id: portal.id,
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

function buildCharterPortalEmail({
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
      `Your ${charter.yacht_name} Charter Portal`,
    body: [
      `Dear ${charter.client_name},`,
      "",
      `Your private Charter Portal for ${charter.yacht_name} is ready.`,
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
      "Your portal brings your charter into one private place:",
      "",
      "- Day-by-day itinerary",
      "- Guest preferences",
      "- Concierge arrangements",
      "- Charter documents",
      "",
      "Open your Charter Portal:",
      guestUrl,
      "",
      "Your itinerary and arrangements may continue to update as your broker and yacht team finalize the charter. The same secure link will always show the latest published information.",
      "",
      "Please keep this private link confidential.",
      "",
      "Kind regards,",
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
  request:
    NextRequest | Request,
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

  const requestUrl =
    new URL(request.url);

  const base =
    configuredBase ||
    requestUrl.origin;

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
  return `${formatDate(
    start
  )} - ${formatDate(
    end
  )}`;
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "Date TBC";
  }

  const date =
    new Date(
      `${value.slice(
        0,
        10
      )}T12:00:00Z`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }
  );
}

function badRequest(
  message: string
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 400 }
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
        error:
          error.message,
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
        error:
          error.message,
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
    "Charter Portal API error:",
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