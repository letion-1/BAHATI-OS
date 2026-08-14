import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  hashProposalShareToken,
  isPlausibleProposalShareToken,
} from "@/lib/proposal/share-token";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type ShareLinkRow = {
  id: string;
  company_id: string;
  proposal_id: string;
  is_active: boolean;
  expires_at: string | null;
  revoked_at: string | null;
};

type ProposalYachtRow = {
  id: string;
  fleet_id: string | null;
  yacht_name: string;
  availability_status: string | null;
};

type CurrentSelectionRow = {
  proposal_yacht_id: string;
  yacht_name: string;
  selected_at: string;
};

type InquiryRow = {
  id: string;
  reference: string | null;
  client_name: string | null;
};

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { token } =
      await context.params;

    if (
      !isPlausibleProposalShareToken(
        token
      )
    ) {
      return publicError(
        "This proposal link is invalid.",
        404
      );
    }

    let body: {
      proposalYachtId?: unknown;
    };

    try {
      body =
        (await request.json()) as {
          proposalYachtId?: unknown;
        };
    } catch {
      return publicError(
        "The request body must be valid JSON.",
        400
      );
    }

    const proposalYachtId =
      cleanText(
        body.proposalYachtId
      );

    if (
      !proposalYachtId ||
      !isUuid(
        proposalYachtId
      )
    ) {
      return publicError(
        "A valid yacht option is required.",
        400
      );
    }

    const admin =
      createAdminClient();

    const tokenHash =
      hashProposalShareToken(
        token
      );

    const {
      data: shareData,
      error: shareError,
    } = await admin
      .from(
        "proposal_share_links"
      )
      .select(
        [
          "id",
          "company_id",
          "proposal_id",
          "is_active",
          "expires_at",
          "revoked_at",
        ].join(",")
      )
      .eq(
        "token_hash",
        tokenHash
      )
      .maybeSingle();

    if (
      shareError ||
      !shareData
    ) {
      return publicError(
        "This proposal link is invalid or no longer available.",
        404
      );
    }

    const share =
      shareData as unknown as ShareLinkRow;

    if (
      !share.is_active ||
      share.revoked_at
    ) {
      return publicError(
        "This proposal link has been revoked.",
        410
      );
    }

    if (
      share.expires_at &&
      new Date(
        share.expires_at
      ).getTime() <=
        Date.now()
    ) {
      return publicError(
        "This proposal link has expired.",
        410
      );
    }

    const {
      data: yachtData,
      error: yachtError,
    } = await admin
      .from(
        "proposal_yachts"
      )
      .select(
        [
          "id",
          "fleet_id",
          "yacht_name",
          "availability_status",
        ].join(",")
      )
      .eq(
        "company_id",
        share.company_id
      )
      .eq(
        "proposal_id",
        share.proposal_id
      )
      .eq(
        "id",
        proposalYachtId
      )
      .maybeSingle();

    if (
      yachtError ||
      !yachtData
    ) {
      return publicError(
        "That yacht is not part of this proposal.",
        404
      );
    }

    const yacht =
      yachtData as unknown as ProposalYachtRow;

    if (
      normalize(
        yacht.availability_status
      ) === "unavailable"
    ) {
      return publicError(
        "This yacht is currently marked unavailable and cannot be selected.",
        409
      );
    }

    const {
      data: inquiryData,
      error: inquiryError,
    } = await admin
      .from("inquiries")
      .select(
        [
          "id",
          "reference",
          "client_name",
        ].join(",")
      )
      .eq(
        "company_id",
        share.company_id
      )
      .eq(
        "id",
        share.proposal_id
      )
      .single();

    if (
      inquiryError ||
      !inquiryData
    ) {
      return publicError(
        "The proposal could not be loaded.",
        404
      );
    }

    const inquiry =
      inquiryData as unknown as InquiryRow;

    const {
      data: currentData,
      error: currentError,
    } = await admin
      .from(
        "proposal_client_selections"
      )
      .select(
        [
          "proposal_yacht_id",
          "yacht_name",
          "selected_at",
        ].join(",")
      )
      .eq(
        "company_id",
        share.company_id
      )
      .eq(
        "proposal_id",
        share.proposal_id
      )
      .maybeSingle();

    if (currentError) {
      throw new Error(
        `Could not read the current client selection: ${currentError.message}`
      );
    }

    const current =
      currentData
        ? (currentData as unknown as CurrentSelectionRow)
        : null;

    if (
      current?.proposal_yacht_id ===
      yacht.id
    ) {
      return NextResponse.json(
        {
          success: true,
          changed: false,
          selection: {
            proposalYachtId:
              current.proposal_yacht_id,
            yachtName:
              current.yacht_name,
            selectedAt:
              current.selected_at,
          },
        },
        noStore(200)
      );
    }

    const now =
      new Date().toISOString();

    const { data: selectionData, error: selectionError } =
      await admin
        .from(
          "proposal_client_selections"
        )
        .upsert(
          {
            company_id:
              share.company_id,
            proposal_id:
              share.proposal_id,
            proposal_yacht_id:
              yacht.id,
            share_link_id:
              share.id,
            fleet_id:
              yacht.fleet_id,
            yacht_name:
              yacht.yacht_name,
            selected_at:
              now,
            updated_at:
              now,
          },
          {
            onConflict:
              "proposal_id",
          }
        )
        .select(
          [
            "proposal_yacht_id",
            "yacht_name",
            "selected_at",
          ].join(",")
        )
        .single();

    if (
      selectionError ||
      !selectionData
    ) {
      throw new Error(
        `Could not save the client selection: ${
          selectionError?.message ??
          "Unknown database error."
        }`
      );
    }

    const reference =
      cleanText(
        inquiry.reference
      ) ??
      `PROP-${share.proposal_id
        .slice(0, 8)
        .toUpperCase()}`;

    const clientName =
      cleanText(
        inquiry.client_name
      ) ??
      "The client";

    const changed =
      Boolean(current);

    const notificationTitle =
      changed
        ? `${clientName} changed yacht preference`
        : `${clientName} selected a yacht`;

    const notificationMessage =
      changed
        ? `${clientName} changed their preference from ${current?.yacht_name ?? "a previous option"} to ${yacht.yacht_name} on ${reference}.`
        : `${clientName} selected ${yacht.yacht_name} as their preferred yacht on ${reference}.`;

    const eventInsert =
      admin
        .from(
          "proposal_client_events"
        )
        .insert({
          company_id:
            share.company_id,
          proposal_id:
            share.proposal_id,
          share_link_id:
            share.id,
          event_type:
            "yacht_selected",
          proposal_yacht_id:
            yacht.id,
          fleet_id:
            yacht.fleet_id,
          metadata: {
            previousProposalYachtId:
              current?.proposal_yacht_id ??
              null,
            previousYachtName:
              current?.yacht_name ??
              null,
          },
          created_at:
            now,
        });

    const notificationInsert =
      admin
        .from(
          "notifications"
        )
        .insert({
          company_id:
            share.company_id,
          type:
            "client_selection",
          title:
            notificationTitle,
          message:
            notificationMessage,
          href:
            `/proposals/${share.proposal_id}`,
          entity_type:
            "proposal",
          entity_id:
            share.proposal_id,
          priority:
            "high",
          read_at:
            null,
          created_at:
            now,
        });

    const [
      eventResult,
      notificationResult,
    ] =
      await Promise.allSettled([
        eventInsert,
        notificationInsert,
      ]);

    if (
      eventResult.status ===
        "rejected"
    ) {
      console.error(
        "Could not record proposal selection event:",
        eventResult.reason
      );
    }

    if (
      notificationResult.status ===
        "rejected"
    ) {
      console.error(
        "Could not create broker notification:",
        notificationResult.reason
      );
    }

    const selection =
      selectionData as unknown as CurrentSelectionRow;

    return NextResponse.json(
      {
        success: true,
        changed: true,
        selection: {
          proposalYachtId:
            selection.proposal_yacht_id,
          yachtName:
            selection.yacht_name,
          selectedAt:
            selection.selected_at,
        },
      },
      noStore(200)
    );
  } catch (error) {
    console.error(
      "Public proposal selection API failed:",
      error
    );

    return publicError(
      error instanceof Error
        ? error.message
        : "Your yacht preference could not be saved.",
      500
    );
  }
}

function normalize(
  value: unknown
): string {
  return (
    cleanText(value)
      ?.toLowerCase()
      .replace(
        /[\s-]+/g,
        "_"
      ) ?? ""
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

  return cleaned ||
    null;
}

function isUuid(
  value: string
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function publicError(
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
      "X-Robots-Tag":
        "noindex, nofollow, noarchive",
    },
  };
}