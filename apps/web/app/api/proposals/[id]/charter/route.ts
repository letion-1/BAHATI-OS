import {
  NextResponse,
} from "next/server";

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
  reference: string;
  client_name: string;
  client_email: string | null;
  yacht_name: string;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  guests: number | null;
  charter_status: string;
  contract_status: string;
  payment_status: string;
  created_at: string;
  updated_at: string;
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const params =
      await Promise.resolve(
        context.params
      );

    const proposalId =
      params.id?.trim();

    if (!proposalId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A proposal ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const workspace =
      await getCurrentWorkspace();

    const admin =
      createAdminClient();

    const result =
      await admin
        .from("charters")
        .select(
          "id, proposal_id, reference, client_name, client_email, yacht_name, start_date, end_date, destination, guests, charter_status, contract_status, payment_status, created_at, updated_at"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "proposal_id",
          proposalId
        )
        .maybeSingle();

    if (result.error) {
      throw new Error(
        `Could not load converted charter: ${result.error.message}`
      );
    }

    const charter =
      (result.data ??
        null) as unknown as CharterRow | null;

    return NextResponse.json(
      {
        success: true,
        charter:
          charter
            ? {
                id:
                  charter.id,
                proposalId:
                  charter.proposal_id,
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
                charterStatus:
                  charter.charter_status,
                contractStatus:
                  charter.contract_status,
                paymentStatus:
                  charter.payment_status,
                createdAt:
                  charter.created_at,
                updatedAt:
                  charter.updated_at,
              }
            : null,
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

    console.error(
      "Proposal charter lookup error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not load converted charter.",
      },
      {
        status: 500,
      }
    );
  }
}