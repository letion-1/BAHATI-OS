import {
  NextRequest,
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
  embarkation_port: string | null;
  disembarkation_port: string | null;
  guests: number | null;
  currency: string;
  total_contract_value: number | string | null;
  charter_status: string;
  contract_status: string;
  payment_status: string;
  contract_sent_at: string | null;
  contract_signed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentRow = {
  id: string;
  charter_id: string;
  status: string;
  due_date: string | null;
  amount: number | string;
  amount_paid: number | string;
};

type ConciergeRow = {
  id: string;
  charter_id: string;
  status: string;
  priority: string;
};

type ItineraryRow = {
  id: string;
  charter_id: string;
  status: string;
  updated_at: string;
};

type DayRow = {
  id: string;
  charter_id: string;
  itinerary_id: string;
};

type PortalRow = {
  id: string;
  charter_id: string;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  opened_count: number;
  submitted_at: string | null;
};

export async function GET(
  request: NextRequest
) {
  try {
    const workspace =
      await getCurrentWorkspace();

    const admin =
      createAdminClient();

    const url =
      new URL(request.url);

    const query =
      cleanText(
        url.searchParams.get(
          "q"
        )
      );

    const requestedStage =
      cleanText(
        url.searchParams.get(
          "stage"
        )
      );

    const validStages =
      new Set([
        "all",
        "contracting",
        "upcoming",
        "active",
        "completed",
        "cancelled",
      ]);

    const stage =
      requestedStage &&
      validStages.has(
        requestedStage
      )
        ? requestedStage
        : "all";

    const charterResult =
      await admin
        .from("charters")
        .select(
          [
            "id",
            "proposal_id",
            "reference",
            "client_name",
            "client_email",
            "yacht_name",
            "start_date",
            "end_date",
            "destination",
            "embarkation_port",
            "disembarkation_port",
            "guests",
            "currency",
            "total_contract_value",
            "charter_status",
            "contract_status",
            "payment_status",
            "contract_sent_at",
            "contract_signed_at",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .order(
          "start_date",
          {
            ascending: true,
            nullsFirst: false,
          }
        )
        .order(
          "updated_at",
          {
            ascending: false,
          }
        );

    if (charterResult.error) {
      throw new Error(
        `Could not load charters: ${charterResult.error.message}`
      );
    }

    const charters =
      (charterResult.data ??
        []) as unknown as CharterRow[];

    if (
      charters.length === 0
    ) {
      return NextResponse.json(
        {
          success: true,
          summary:
            emptySummary(),
          counts:
            emptyCounts(),
          charters: [],
        },
        {
          status: 200,
          headers:
            noStoreHeaders(),
        }
      );
    }

    const charterIds =
      charters.map(
        (charter) =>
          charter.id
      );

    const [
      paymentsResult,
      conciergeResult,
      itineraryResult,
      portalResult,
    ] = await Promise.all([
      admin
        .from(
          "charter_payment_schedule"
        )
        .select(
          "id, charter_id, status, due_date, amount, amount_paid"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .in(
          "charter_id",
          charterIds
        ),

      admin
        .from(
          "charter_concierge_items"
        )
        .select(
          "id, charter_id, status, priority"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .in(
          "charter_id",
          charterIds
        ),

      admin
        .from(
          "charter_itineraries"
        )
        .select(
          "id, charter_id, status, updated_at"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .in(
          "charter_id",
          charterIds
        ),

      admin
        .from(
          "guest_portals"
        )
        .select(
          "id, charter_id, status, sent_at, opened_at, opened_count, submitted_at"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .in(
          "charter_id",
          charterIds
        ),
    ]);

    if (paymentsResult.error) {
      throw new Error(
        `Could not load charter payments: ${paymentsResult.error.message}`
      );
    }

    if (conciergeResult.error) {
      throw new Error(
        `Could not load Concierge status: ${conciergeResult.error.message}`
      );
    }

    if (itineraryResult.error) {
      throw new Error(
        `Could not load itinerary status: ${itineraryResult.error.message}`
      );
    }

    if (portalResult.error) {
      throw new Error(
        `Could not load Charter Portal status: ${portalResult.error.message}`
      );
    }

    const payments =
      (paymentsResult.data ??
        []) as unknown as PaymentRow[];

    const concierge =
      (conciergeResult.data ??
        []) as unknown as ConciergeRow[];

    const itineraries =
      (itineraryResult.data ??
        []) as unknown as ItineraryRow[];

    const portals =
      (portalResult.data ??
        []) as unknown as PortalRow[];

    const itineraryIds =
      itineraries.map(
        (itinerary) =>
          itinerary.id
      );

    let days:
      DayRow[] = [];

    if (
      itineraryIds.length >
      0
    ) {
      const daysResult =
        await admin
          .from(
            "charter_itinerary_days"
          )
          .select(
            "id, charter_id, itinerary_id"
          )
          .eq(
            "company_id",
            workspace.companyId
          )
          .in(
            "itinerary_id",
            itineraryIds
          );

      if (daysResult.error) {
        throw new Error(
          `Could not load itinerary progress: ${daysResult.error.message}`
        );
      }

      days =
        (daysResult.data ??
          []) as unknown as DayRow[];
    }

    const today =
      utcDateKey(
        new Date()
      );

    const rows =
      charters.map(
        (charter) => {
          const lifecycleStage =
            deriveLifecycleStage(
              charter,
              today
            );

          const charterPayments =
            payments.filter(
              (payment) =>
                payment.charter_id ===
                charter.id
            );

          const paymentAttention =
            charterPayments.filter(
              (payment) =>
                paymentNeedsAttention(
                  payment,
                  today
                )
            );

          const paidMilestones =
            charterPayments.filter(
              (payment) => {
                const amount =
                  toNumber(
                    payment.amount
                  );

                return (
                  payment.status ===
                    "paid" ||
                  (
                    amount > 0 &&
                    toNumber(
                      payment.amount_paid
                    ) >= amount
                  )
                );
              }
            ).length;

          const charterConcierge =
            concierge.filter(
              (item) =>
                item.charter_id ===
                charter.id
            );

          const openConcierge =
            charterConcierge.filter(
              (item) =>
                ![
                  "completed",
                  "cancelled",
                ].includes(
                  item.status
                )
            );

          const urgentConcierge =
            openConcierge.filter(
              (item) =>
                item.priority ===
                  "urgent" ||
                item.priority ===
                  "high"
            );

          const itinerary =
            itineraries.find(
              (item) =>
                item.charter_id ===
                charter.id
            ) ??
            null;

          const itineraryDayCount =
            itinerary
              ? days.filter(
                  (day) =>
                    day.itinerary_id ===
                    itinerary.id
                ).length
              : 0;

          const portal =
            portals.find(
              (item) =>
                item.charter_id ===
                charter.id
            ) ??
            null;

          return {
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
            embarkationPort:
              charter.embarkation_port,
            disembarkationPort:
              charter.disembarkation_port,
            guests:
              charter.guests,
            currency:
              charter.currency,
            totalContractValue:
              nullableNumber(
                charter.total_contract_value
              ),
            charterStatus:
              charter.charter_status,
            contractStatus:
              charter.contract_status,
            paymentStatus:
              charter.payment_status,
            lifecycleStage,
            contractSentAt:
              charter.contract_sent_at,
            contractSignedAt:
              charter.contract_signed_at,
            payments: {
              total:
                charterPayments.length,
              paid:
                paidMilestones,
              attention:
                paymentAttention.length,
              overdue:
                paymentAttention.filter(
                  (payment) =>
                    payment.status ===
                      "overdue" ||
                    Boolean(
                      payment.due_date &&
                        payment.due_date <
                          today
                    )
                ).length,
            },
            concierge: {
              total:
                charterConcierge.length,
              open:
                openConcierge.length,
              attention:
                urgentConcierge.length,
            },
            itinerary:
              itinerary
                ? {
                    id:
                      itinerary.id,
                    status:
                      itinerary.status,
                    dayCount:
                      itineraryDayCount,
                    updatedAt:
                      itinerary.updated_at,
                  }
                : null,
            portal:
              portal
                ? {
                    status:
                      portal.status,
                    sentAt:
                      portal.sent_at,
                    openedAt:
                      portal.opened_at,
                    openedCount:
                      portal.opened_count,
                    submittedAt:
                      portal.submitted_at,
                  }
                : null,
            createdAt:
              charter.created_at,
            updatedAt:
              charter.updated_at,
          };
        }
      );

    const counts =
      rows.reduce(
        (
          accumulator,
          row
        ) => {
          accumulator.all += 1;

          accumulator[
            row.lifecycleStage
          ] += 1;

          return accumulator;
        },
        emptyCounts()
      );

    const summary = {
      openCharters:
        counts.contracting +
        counts.upcoming +
        counts.active,

      contractValueByCurrency:
        contractValueByCurrency(
          rows
        ),

      awaitingSignature:
        rows.filter(
          (row) =>
            row.lifecycleStage ===
              "contracting" &&
            ![
              "signed",
              "declined",
              "expired",
              "cancelled",
            ].includes(
              row.contractStatus
            )
        ).length,

      paymentAttention:
        rows.filter(
          (row) =>
            row.payments
              .attention >
              0 ||
            [
              "deposit_due",
              "balance_due",
              "partially_paid",
              "overdue",
            ].includes(
              row.paymentStatus
            )
        ).length,

      conciergeAttention:
        rows.reduce(
          (
            total,
            row
          ) =>
            total +
            row.concierge
              .attention,
          0
        ),
    };

    const normalizedQuery =
      query
        ?.toLowerCase() ??
      "";

    const filtered =
      rows.filter(
        (row) => {
          if (
            stage !== "all" &&
            row.lifecycleStage !==
              stage
          ) {
            return false;
          }

          if (!normalizedQuery) {
            return true;
          }

          return [
            row.reference,
            row.clientName,
            row.clientEmail,
            row.yachtName,
            row.destination,
            row.embarkationPort,
            row.disembarkationPort,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(
              normalizedQuery
            );
        }
      );

    return NextResponse.json(
      {
        success: true,
        summary,
        counts,
        charters:
          filtered,
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
      "Could not load charters."
    );
  }
}

function deriveLifecycleStage(
  charter: CharterRow,
  today: string
):
  | "contracting"
  | "upcoming"
  | "active"
  | "completed"
  | "cancelled" {
  if (
    charter.charter_status ===
      "cancelled" ||
    charter.contract_status ===
      "cancelled"
  ) {
    return "cancelled";
  }

  if (
    charter.charter_status ===
      "completed"
  ) {
    return "completed";
  }

  if (
    charter.charter_status ===
      "active" ||
    (
      charter.contract_status ===
        "signed" &&
      Boolean(
        charter.start_date &&
          charter.end_date &&
          charter.start_date <=
            today &&
          charter.end_date >=
            today
      )
    )
  ) {
    return "active";
  }

  if (
    charter.contract_status ===
      "signed" &&
    charter.start_date &&
    charter.start_date >
      today
  ) {
    return "upcoming";
  }

  if (
    charter.charter_status ===
      "confirmed" &&
    charter.start_date &&
    charter.start_date >
      today
  ) {
    return "upcoming";
  }

  return "contracting";
}

function paymentNeedsAttention(
  payment: PaymentRow,
  today: string
) {
  if (
    [
      "paid",
      "waived",
      "cancelled",
    ].includes(
      payment.status
    )
  ) {
    return false;
  }

  if (
    [
      "due",
      "partially_paid",
      "overdue",
    ].includes(
      payment.status
    )
  ) {
    return true;
  }

  return Boolean(
    payment.due_date &&
      payment.due_date <=
        today
  );
}

function contractValueByCurrency(
  rows: Array<{
    currency: string;
    lifecycleStage: string;
    totalContractValue:
      number | null;
  }>
) {
  const values =
    new Map<
      string,
      number
    >();

  for (const row of rows) {
    if (
      [
        "completed",
        "cancelled",
      ].includes(
        row.lifecycleStage
      ) ||
      row.totalContractValue ===
        null
    ) {
      continue;
    }

    values.set(
      row.currency,
      (
        values.get(
          row.currency
        ) ?? 0
      ) +
        row.totalContractValue
    );
  }

  return Object.fromEntries(
    [...values.entries()].sort(
      (
        left,
        right
      ) =>
        right[1] -
        left[1]
    )
  );
}

function nullableNumber(
  value: unknown
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : null;
}

function toNumber(
  value: unknown
) {
  return (
    nullableNumber(value) ??
    0
  );
}

function utcDateKey(
  value: Date
) {
  return value
    .toISOString()
    .slice(0, 10);
}

function cleanText(
  value: unknown
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned
    ? cleaned
    : null;
}

function emptySummary() {
  return {
    openCharters: 0,
    contractValueByCurrency: {},
    awaitingSignature: 0,
    paymentAttention: 0,
    conciergeAttention: 0,
  };
}

function emptyCounts() {
  return {
    all: 0,
    contracting: 0,
    upcoming: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
  };
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

  console.error(
    "Charters overview API error:",
    error
  );

  return NextResponse.json(
    {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : fallbackMessage,
    },
    {
      status: 500,
    }
  );
}