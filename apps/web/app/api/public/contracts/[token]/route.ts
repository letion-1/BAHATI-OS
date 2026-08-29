import { NextRequest, NextResponse } from "next/server";

import {
  hashContractShareToken,
  isPlausibleContractShareToken,
} from "@/lib/charter/contract-share-token";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The client's view of a charter agreement. No authentication: the token is
 * the credential.
 *
 * Everything here is written on the assumption that the URL will be forwarded
 * further than the broker intended, because in practice it always is. So the
 * response carries what a client needs to check the contract is theirs and
 * download it, and nothing else. No pricing breakdown beyond what is already
 * in the PDF they are about to open, no client contact details, no internal
 * notes, no broker identifiers.
 *
 * Failures are deliberately indistinguishable. A wrong token, a revoked link
 * and an expired one all return the same 404, so the endpoint cannot be used
 * to learn which charters exist.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Long enough to download a 2MB PDF on hotel wifi, short enough to expire. */
const SIGNED_URL_TTL_SECONDS = 600;

const BUCKET_NAME = "documents";

type RouteContext = {
  params: Promise<{ token: string }>;
};

type LinkRow = {
  id: string;
  company_id: string;
  charter_id: string;
  is_active: boolean;
  expires_at: string | null;
  opened_count: number;
};

type CharterRow = {
  id: string;
  reference: string;
  client_name: string;
  yacht_name: string;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  embarkation_port: string | null;
  disembarkation_port: string | null;
  guests: number | null;
  contract_status: string | null;
};

type DocumentRow = {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  version: number;
  created_at: string;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { token } = await context.params;

    /*
     * Shape-checked before the database is touched, so a scraper hitting this
     * path with arbitrary strings costs a regex rather than a query.
     */
    if (!isPlausibleContractShareToken(token)) {
      return notFound();
    }

    const admin = createAdminClient();

    const { data: linkData, error: linkError } = await admin
      .from("charter_contract_links")
      .select(
        "id, company_id, charter_id, is_active, expires_at, opened_count"
      )
      .eq("token_hash", hashContractShareToken(token))
      .maybeSingle();

    if (linkError) {
      throw new Error(`Could not resolve the link: ${linkError.message}`);
    }

    const link = (linkData as unknown as LinkRow) ?? null;

    if (!link || !link.is_active) {
      return notFound();
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      /*
       * Told plainly, and only here.
       *
       * An expired link is the one failure where the visitor is the intended
       * recipient, and "this link has expired, ask your broker" is actionable
       * where a bare 404 would just look broken. It reveals nothing: they
       * already held the token.
       */
      return NextResponse.json(
        {
          success: false,
          error: "expired",
          message:
            "This link has expired. Please ask your broker to send a new one.",
        },
        noStore(410)
      );
    }

    const { data: charterData, error: charterError } = await admin
      .from("charters")
      .select(
        [
          "id",
          "reference",
          "client_name",
          "yacht_name",
          "start_date",
          "end_date",
          "destination",
          "embarkation_port",
          "disembarkation_port",
          "guests",
          "contract_status",
        ].join(", ")
      )
      .eq("company_id", link.company_id)
      .eq("id", link.charter_id)
      .maybeSingle();

    if (charterError) {
      throw new Error(`Could not load the charter: ${charterError.message}`);
    }

    const charter = (charterData as unknown as CharterRow) ?? null;

    if (!charter) {
      return notFound();
    }

    /*
     * Resolved at request time rather than pinned at link creation, so a v2
     * agreement replaces v1 for anyone holding the link. That is the point of
     * sending a link instead of an attachment.
     */
    const { data: documentData, error: documentError } = await admin
      .from("documents")
      .select("id, name, storage_path, mime_type, version, created_at")
      .eq("company_id", link.company_id)
      .eq("charter_id", link.charter_id)
      .eq("category", "charter_agreement")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (documentError) {
      throw new Error(`Could not load the agreement: ${documentError.message}`);
    }

    const document = (documentData as unknown as DocumentRow) ?? null;

    if (!document) {
      return notFound();
    }

    const signed = await admin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS);

    if (signed.error || !signed.data?.signedUrl) {
      throw new Error(
        `Could not sign the agreement URL: ${
          signed.error?.message ?? "no URL returned"
        }`
      );
    }

    /*
     * Recorded after everything else has succeeded, so a count only rises
     * when the client actually saw the contract.
     *
     * Not awaited for correctness: a failure to record an open should never
     * stop a client reading their agreement. It is logged instead.
     */
    const now = new Date().toISOString();

    const openResult = await admin
      .from("charter_contract_links")
      .update({
        last_opened_at: now,
        opened_count: link.opened_count + 1,
        updated_at: now,
      })
      .eq("id", link.id)
      .eq("company_id", link.company_id);

    if (openResult.error) {
      console.error("Could not record contract link open:", openResult.error);
    }

    return NextResponse.json(
      {
        success: true,
        charter: {
          reference: charter.reference,
          clientName: charter.client_name,
          yachtName: charter.yacht_name,
          startDate: charter.start_date,
          endDate: charter.end_date,
          destination: charter.destination,
          embarkationPort: charter.embarkation_port,
          disembarkationPort: charter.disembarkation_port,
          guests: charter.guests,
          contractStatus: charter.contract_status,
        },
        document: {
          name: document.name,
          version: document.version,
          mimeType: document.mime_type,
          createdAt: document.created_at,
          downloadUrl: signed.data.signedUrl,
          expiresInSeconds: SIGNED_URL_TTL_SECONDS,
        },
      },
      noStore(200)
    );
  } catch (error) {
    console.error("Public contract link failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "unavailable",
        message:
          "This contract could not be loaded right now. Please try again shortly.",
      },
      noStore(500)
    );
  }
}

/**
 * One response for every "you cannot see this" case.
 *
 * A wrong token, a revoked link and a deleted charter are indistinguishable
 * from the outside, so this endpoint cannot be probed to discover which
 * charters exist.
 */
function notFound() {
  return NextResponse.json(
    {
      success: false,
      error: "not_found",
      message:
        "This link is no longer valid. Please ask your broker for an up to date link.",
    },
    noStore(404)
  );
}

function noStore(status: number) {
  return {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  };
}