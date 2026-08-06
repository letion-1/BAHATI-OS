import { NextResponse } from "next/server";

import {
  createAdminClient,
} from "@/lib/supabase/admin";

import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

type InquiryPayload = {
  client_name?: string | null;
  client_type?: string | null;
  email?: string | null;
  phone?: string | null;
  destination?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  guests?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
  currency?: string | null;
  preferences?: string | null;
  source?: string | null;
  extraction_confidence?: number | null;
};

function normalizeConfidence(
  value:
    | number
    | null
    | undefined
): number | null {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(value)
  ) {
    return null;
  }

  const percentage =
    value <= 1
      ? value * 100
      : value;

  return Math.round(
    Math.min(
      100,
      Math.max(
        0,
        percentage
      )
    )
  );
}

function cleanOptionalText(
  value:
    | string
    | null
    | undefined
): string | null {
  if (!value) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned.length > 0
    ? cleaned
    : null;
}

function cleanOptionalNumber(
  value:
    | number
    | null
    | undefined
): number | null {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return value;
}

function cleanDate(
  value:
    | string
    | null
    | undefined
): string | null {
  const cleaned =
    cleanOptionalText(value);

  if (!cleaned) {
    return null;
  }

  const matchesIsoDate =
    /^\d{4}-\d{2}-\d{2}$/.test(
      cleaned
    );

  return matchesIsoDate
    ? cleaned
    : null;
}

export async function POST(
  request: Request
) {
  try {
    /*
     * This verifies that the request belongs to an authenticated
     * user who has access to the returned workspace.
     */
    const workspace =
      await getCurrentWorkspace();

    const body =
      (await request.json()) as {
        inquiry?: InquiryPayload;
        original_inquiry?: string;
      };

    const inquiry =
      body.inquiry;

    if (!inquiry) {
      return NextResponse.json(
        {
          error:
            "Inquiry data is required.",
        },
        {
          status: 400,
        }
      );
    }

    const clientName =
      cleanOptionalText(
        inquiry.client_name
      );

    const destination =
      cleanOptionalText(
        inquiry.destination
      );

    if (!clientName) {
      return NextResponse.json(
        {
          error:
            "Client name is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (!destination) {
      return NextResponse.json(
        {
          error:
            "Destination is required.",
        },
        {
          status: 400,
        }
      );
    }

    const startDate =
      cleanDate(
        inquiry.start_date
      );

    const endDate =
      cleanDate(
        inquiry.end_date
      );

    if (
      startDate &&
      endDate &&
      startDate > endDate
    ) {
      return NextResponse.json(
        {
          error:
            "The end date cannot be earlier than the start date.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * The authenticated workspace check above is the authorization
     * layer. The admin client performs the trusted server-side insert
     * without being blocked by the browser-facing RLS policy.
     */
    const admin =
      createAdminClient();

    const reference =
      `INQ-${Date.now()
        .toString()
        .slice(-8)}`;

    const {
      data,
      error,
    } =
      await admin
        .from(
          "inquiries"
        )
        .insert({
          company_id:
            workspace.companyId,

          reference,

          client_name:
            clientName,

          client_type:
            cleanOptionalText(
              inquiry.client_type
            ) ??
            "New charter client",

          email:
            cleanOptionalText(
              inquiry.email
            ),

          phone:
            cleanOptionalText(
              inquiry.phone
            ),

          destination,

          start_date:
            startDate,

          end_date:
            endDate,

          guests:
            cleanOptionalNumber(
              inquiry.guests
            ),

          budget_min:
            cleanOptionalNumber(
              inquiry.budget_min
            ),

          budget_max:
            cleanOptionalNumber(
              inquiry.budget_max
            ),

          currency:
            cleanOptionalText(
              inquiry.currency
            )?.toUpperCase() ??
            "EUR",

          preferences:
            cleanOptionalText(
              inquiry.preferences
            ),

          original_inquiry:
            cleanOptionalText(
              body.original_inquiry
            ),

          source:
            cleanOptionalText(
              inquiry.source
            ) ??
            "AI import",

          status:
            "new",

          extraction_confidence:
            normalizeConfidence(
              inquiry.extraction_confidence
            ),
        })
        .select(
          "id"
        )
        .single();

    if (
      error ||
      !data
    ) {
      console.error(
        "Supabase inquiry insert failed:",
        error
      );

      throw new Error(
        error?.message ??
          "Could not save inquiry."
      );
    }

    return NextResponse.json(
      {
        success: true,
        id: data.id,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    if (
      isWorkspaceAccessError(
        error
      )
    ) {
      return NextResponse.json(
        {
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
      "Create inquiry route failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create inquiry.",
      },
      {
        status: 500,
      }
    );
  }
}