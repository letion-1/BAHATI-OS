import {
  NextRequest,
  NextResponse,
} from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import {
  generateProposalShareToken,
  hashProposalShareToken,
} from "@/lib/proposal/share-token";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_EXPIRY_DAYS = 30;
const MAX_EXPIRY_DAYS = 180;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ProposalRow = {
  id: string;
  reference: string | null;
  client_name: string | null;
  yacht_id: string | null;
  proposal_status: string | null;
};

type ShareLinkRow = {
  id: string;
  proposal_id: string;
  is_active: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  last_opened_at: string | null;
  opened_count: number;
  created_at: string;
  updated_at: string;
};

type CreateShareBody = {
  expiresInDays?: unknown;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return jsonError(
        "Proposal ID must be a valid UUID.",
        400
      );
    }

    const workspace =
      await getCurrentWorkspace();

    const supabase =
      await createClient();

    const proposal =
      await loadProposal(
        supabase,
        workspace.companyId,
        id
      );

    if (!proposal) {
      return jsonError(
        "The proposal could not be found.",
        404
      );
    }

    const { data, error } =
      await supabase
        .from("proposal_share_links")
        .select(
          [
            "id",
            "proposal_id",
            "is_active",
            "expires_at",
            "revoked_at",
            "last_opened_at",
            "opened_count",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq("proposal_id", id)
        .order("created_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

    if (error) {
      throw new Error(
        `Could not load the proposal share link: ${error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
        proposal: {
          id: proposal.id,
          reference:
            proposal.reference,
          clientName:
            proposal.client_name,
        },
        share: data
          ? serializeShareLink(
              data as unknown as ShareLinkRow
            )
          : null,
      },
      noStore(200)
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not load proposal sharing."
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return jsonError(
        "Proposal ID must be a valid UUID.",
        400
      );
    }

    const workspace =
      await getCurrentWorkspace();

    const supabase =
      await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonError(
        "Authentication required.",
        401
      );
    }

    const proposal =
      await loadProposal(
        supabase,
        workspace.companyId,
        id
      );

    if (!proposal) {
      return jsonError(
        "The proposal could not be found.",
        404
      );
    }

    if (
      ["declined", "expired"].includes(
        normalizeStatus(
          proposal.proposal_status
        )
      )
    ) {
      return jsonError(
        "A declined or expired proposal cannot be shared. Update its status first.",
        409
      );
    }

    const yachtCount =
      await countProposalYachts(
        supabase,
        workspace.companyId,
        id
      );

    if (
      yachtCount === 0 &&
      !proposal.yacht_id
    ) {
      return jsonError(
        "Add at least one yacht to the proposal before creating a client link.",
        409
      );
    }

    let body: CreateShareBody = {};

    try {
      const text =
        await request.text();

      if (text.trim()) {
        body =
          JSON.parse(
            text
          ) as CreateShareBody;
      }
    } catch {
      return jsonError(
        "The request body must be valid JSON.",
        400
      );
    }

    const expiry =
      parseExpiryDays(
        body.expiresInDays
      );

    if (!expiry.success) {
      return jsonError(
        expiry.error,
        400
      );
    }

    const now =
      new Date();

    const nowIso =
      now.toISOString();

    const expiresAt =
      new Date(
        now.getTime() +
          expiry.days *
            24 *
            60 *
            60 *
            1000
      ).toISOString();

    const { error: revokeError } =
      await supabase
        .from(
          "proposal_share_links"
        )
        .update({
          is_active: false,
          revoked_at: nowIso,
        })
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq("proposal_id", id)
        .eq("is_active", true)
        .is("revoked_at", null);

    if (revokeError) {
      throw new Error(
        `Could not revoke the previous client link: ${revokeError.message}`
      );
    }

    const token =
      generateProposalShareToken();

    const tokenHash =
      hashProposalShareToken(
        token
      );

    const { data, error } =
      await supabase
        .from(
          "proposal_share_links"
        )
        .insert({
          company_id:
            workspace.companyId,
          proposal_id: id,
          token_hash: tokenHash,
          is_active: true,
          expires_at:
            expiresAt,
          revoked_at: null,
          last_opened_at: null,
          opened_count: 0,
          created_by:
            user.id,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select(
          [
            "id",
            "proposal_id",
            "is_active",
            "expires_at",
            "revoked_at",
            "last_opened_at",
            "opened_count",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .single();

    if (error || !data) {
      throw new Error(
        `Could not create the client proposal link: ${
          error?.message ??
          "Unknown database error."
        }`
      );
    }

    const origin =
      resolvePublicOrigin(
        request
      );

    const url =
      `${origin}/proposal-review/${encodeURIComponent(
        token
      )}`;

    return NextResponse.json(
      {
        success: true,
        proposal: {
          id: proposal.id,
          reference:
            proposal.reference,
          clientName:
            proposal.client_name,
          yachtCount,
        },
        share: {
          ...serializeShareLink(
            data as unknown as ShareLinkRow
          ),
          url,
        },
      },
      noStore(201)
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not create the client proposal link."
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return jsonError(
        "Proposal ID must be a valid UUID.",
        400
      );
    }

    const workspace =
      await getCurrentWorkspace();

    const supabase =
      await createClient();

    const proposal =
      await loadProposal(
        supabase,
        workspace.companyId,
        id
      );

    if (!proposal) {
      return jsonError(
        "The proposal could not be found.",
        404
      );
    }

    const now =
      new Date().toISOString();

    const { error } =
      await supabase
        .from(
          "proposal_share_links"
        )
        .update({
          is_active: false,
          revoked_at: now,
        })
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq("proposal_id", id)
        .eq("is_active", true)
        .is("revoked_at", null);

    if (error) {
      throw new Error(
        `Could not revoke the client proposal link: ${error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
      },
      noStore(200)
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not revoke the client proposal link."
    );
  }
}

async function loadProposal(
  supabase: Awaited<
    ReturnType<typeof createClient>
  >,
  companyId: string,
  proposalId: string
): Promise<ProposalRow | null> {
  const { data, error } =
    await supabase
      .from("inquiries")
      .select(
        [
          "id",
          "reference",
          "client_name",
          "yacht_id",
          "proposal_status",
        ].join(",")
      )
      .eq(
        "company_id",
        companyId
      )
      .eq("id", proposalId)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Could not load the proposal: ${error.message}`
    );
  }

  return data
    ? (data as unknown as ProposalRow)
    : null;
}

async function countProposalYachts(
  supabase: Awaited<
    ReturnType<typeof createClient>
  >,
  companyId: string,
  proposalId: string
): Promise<number> {
  const { count, error } =
    await supabase
      .from("proposal_yachts")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "proposal_id",
        proposalId
      );

  if (error) {
    throw new Error(
      `Could not inspect proposal yacht options: ${error.message}`
    );
  }

  return count ?? 0;
}

function parseExpiryDays(
  value: unknown
):
  | {
      success: true;
      days: number;
    }
  | {
      success: false;
      error: string;
    } {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return {
      success: true,
      days:
        DEFAULT_EXPIRY_DAYS,
    };
  }

  const days =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days >
      MAX_EXPIRY_DAYS
  ) {
    return {
      success: false,
      error:
        `expiresInDays must be a whole number between 1 and ${MAX_EXPIRY_DAYS}.`,
    };
  }

  return {
    success: true,
    days,
  };
}

function serializeShareLink(
  row: ShareLinkRow
) {
  const expired =
    row.expires_at
      ? new Date(
          row.expires_at
        ).getTime() <=
        Date.now()
      : false;

  return {
    id: row.id,
    proposalId:
      row.proposal_id,
    active:
      row.is_active &&
      !row.revoked_at &&
      !expired,
    expiresAt:
      row.expires_at,
    revokedAt:
      row.revoked_at,
    lastOpenedAt:
      row.last_opened_at,
    openedCount:
      row.opened_count,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  };
}

function normalizeStatus(
  value: string | null
): string {
  return (
    value
      ?.trim()
      .toLowerCase() ?? ""
  );
}

function resolvePublicOrigin(
  request: NextRequest
): string {
  const configured =
    process.env
      .NEXT_PUBLIC_APP_URL?.trim();

  if (configured) {
    return configured.replace(
      /\/+$/,
      ""
    );
  }

  return request.nextUrl.origin.replace(
    /\/+$/,
    ""
  );
}

function isUuid(
  value: string
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function jsonError(
  error: string,
  status: number
) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    noStore(status)
  );
}

function noStore(
  status: number
) {
  return {
    status,
    headers: {
      "Cache-Control":
        "private, no-store, max-age=0",
    },
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
      noStore(error.status)
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
      noStore(error.status)
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : fallbackMessage;

  console.error(
    "Proposal share API failed:",
    error
  );

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    noStore(500)
  );
}