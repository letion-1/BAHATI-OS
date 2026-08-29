import { NextRequest, NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import {
  generateContractShareToken,
  hashContractShareToken,
} from "@/lib/charter/contract-share-token";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

/**
 * Create, read and revoke the public link to a charter agreement.
 *
 * The contract tab could already generate the PDF and mail it via Gmail. That
 * assumed a working Google connection and a client who opens attachments;
 * a 2.3MB agreement is exactly what a corporate mail filter strips, and a
 * forwarded copy goes stale as soon as v2 is generated.
 *
 * A link is the version-stable alternative: it always resolves to the current
 * agreement, it can be sent over whatever channel the broker already uses,
 * and opens are recorded so "did they receive it" has an answer.
 *
 * GET    the active link's status (never the token: only its hash is stored)
 * POST   issue a link, replacing any existing one
 * DELETE revoke
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_EXPIRY_DAYS = 30;
const MAX_EXPIRY_DAYS = 180;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type CharterRow = {
  id: string;
  reference: string;
  client_name: string;
};

type LinkRow = {
  id: string;
  charter_id: string;
  is_active: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  last_opened_at: string | null;
  opened_count: number;
  created_at: string;
  updated_at: string;
};

const LINK_COLUMNS = [
  "id",
  "charter_id",
  "is_active",
  "expires_at",
  "revoked_at",
  "last_opened_at",
  "opened_count",
  "created_at",
  "updated_at",
].join(", ");

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return jsonError("Charter ID must be a valid UUID.", 400);
    }

    const workspace = await getCurrentWorkspace();
    const admin = createAdminClient();

    const charter = await loadCharter(admin, workspace.companyId, id);

    if (!charter) {
      return jsonError("The charter could not be found.", 404);
    }

    const { data, error } = await admin
      .from("charter_contract_links")
      .select(LINK_COLUMNS)
      .eq("company_id", workspace.companyId)
      .eq("charter_id", id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not load the contract link: ${error.message}`);
    }

    return NextResponse.json(
      {
        success: true,
        link: data ? serializeLink(data as unknown as LinkRow) : null,
      },
      noStore(200)
    );
  } catch (error) {
    return handleRouteError(error, "Could not load the contract link.");
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return jsonError("Charter ID must be a valid UUID.", 400);
    }

    const workspace = await getCurrentWorkspace();
    const admin = createAdminClient();

    const charter = await loadCharter(admin, workspace.companyId, id);

    if (!charter) {
      return jsonError("The charter could not be found.", 404);
    }

    /*
     * There has to be something to link to.
     *
     * Issuing a link before the agreement exists produces a URL that shows
     * the client an error, which is worse than the broker being told now that
     * they need to generate the agreement first.
     */
    const { data: document, error: documentError } = await admin
      .from("documents")
      .select("id, version")
      .eq("company_id", workspace.companyId)
      .eq("charter_id", id)
      .eq("category", "charter_agreement")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (documentError) {
      throw new Error(
        `Could not check for an agreement: ${documentError.message}`
      );
    }

    if (!document) {
      return jsonError(
        "Generate the charter agreement before sharing a link to it.",
        409
      );
    }

    const body = (await readJsonBody(request)) as {
      expiresInDays?: unknown;
    };

    const expiresInDays = normalizeExpiryDays(body.expiresInDays);

    const token = generateContractShareToken();

    const now = new Date();

    const expiresAt = new Date(
      now.getTime() + expiresInDays * 24 * 60 * 60 * 1000
    );

    /*
     * Any previous link is revoked first.
     *
     * One live link per charter, so revoking is unambiguous: the broker
     * presses one button and knows nothing is still reachable. Leaving old
     * links active would mean a client who was sent v1 keeps a working URL
     * after the broker thought they had cut access.
     */
    const revokeResult = await admin
      .from("charter_contract_links")
      .update({
        is_active: false,
        revoked_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("company_id", workspace.companyId)
      .eq("charter_id", id)
      .eq("is_active", true);

    if (revokeResult.error) {
      throw new Error(
        `Could not replace the previous link: ${revokeResult.error.message}`
      );
    }

    const insertResult = await admin
      .from("charter_contract_links")
      .insert({
        company_id: workspace.companyId,
        charter_id: id,
        token_hash: hashContractShareToken(token),
        is_active: true,
        expires_at: expiresAt.toISOString(),
        opened_count: 0,
        created_by: workspace.userId,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .select(LINK_COLUMNS)
      .single();

    if (insertResult.error || !insertResult.data) {
      throw new Error(
        `Could not create the contract link: ${
          insertResult.error?.message ?? "no row returned"
        }`
      );
    }

    return NextResponse.json(
      {
        success: true,
        link: serializeLink(insertResult.data as unknown as LinkRow),

        /*
         * Returned exactly once. Only the hash is stored, so if the broker
         * loses this they issue a new link rather than recovering this one.
         */
        url: `/contract-review/${token}`,
      },
      noStore(201)
    );
  } catch (error) {
    return handleRouteError(error, "Could not create the contract link.");
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return jsonError("Charter ID must be a valid UUID.", 400);
    }

    const workspace = await getCurrentWorkspace();
    const admin = createAdminClient();

    const now = new Date().toISOString();

    const { error } = await admin
      .from("charter_contract_links")
      .update({
        is_active: false,
        revoked_at: now,
        updated_at: now,
      })
      .eq("company_id", workspace.companyId)
      .eq("charter_id", id)
      .eq("is_active", true);

    if (error) {
      throw new Error(`Could not revoke the contract link: ${error.message}`);
    }

    return NextResponse.json({ success: true, link: null }, noStore(200));
  } catch (error) {
    return handleRouteError(error, "Could not revoke the contract link.");
  }
}

async function loadCharter(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  charterId: string
): Promise<CharterRow | null> {
  const { data, error } = await admin
    .from("charters")
    .select("id, reference, client_name")
    .eq("company_id", companyId)
    .eq("id", charterId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load the charter: ${error.message}`);
  }

  return (data as unknown as CharterRow) ?? null;
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  // The expiry is optional, so an empty body is a valid request rather than
  // an error the broker has to understand.
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeExpiryDays(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_EXPIRY_DAYS;
  }

  const rounded = Math.round(value);

  if (rounded < 1) {
    return DEFAULT_EXPIRY_DAYS;
  }

  return Math.min(rounded, MAX_EXPIRY_DAYS);
}

function serializeLink(row: LinkRow) {
  return {
    id: row.id,
    charterId: row.charter_id,
    isActive: row.is_active,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastOpenedAt: row.last_opened_at,
    openedCount: row.opened_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function noStore(status: number) {
  return {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  };
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, noStore(status));
}

function handleRouteError(error: unknown, fallbackMessage: string) {
  if (isAuthenticationRequiredError(error)) {
    return jsonError(error.message, error.status);
  }

  if (isWorkspaceAccessError(error)) {
    return jsonError(error.message, error.status);
  }

  console.error(fallbackMessage, error);

  return jsonError(fallbackMessage, 500);
}