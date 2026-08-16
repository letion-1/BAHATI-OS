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

type CharterRow = {
  id: string;
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
  contract_status: string;
  charter_status: string;
  created_at: string;
};

type ConciergeItemRow = {
  charter_id: string;
  category: string;
  status: string;
  priority: string;
  scheduled_at: string | null;
  client_visible: boolean;
  assigned_to: string | null;
  due_at: string | null;
  estimated_cost:
    | number
    | string
    | null;
  currency: string;
};

export async function GET() {
  try {
    const workspace =
      await getCurrentWorkspace();

    const admin =
      createAdminClient();

    const chartersResult =
      await admin
        .from("charters")
        .select(
          [
            "id",
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
            "contract_status",
            "charter_status",
            "created_at",
          ].join(",")
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .neq(
          "charter_status",
          "cancelled"
        )
        .order("start_date", {
          ascending: true,
          nullsFirst: false,
        })
        .order("created_at", {
          ascending: false,
        });

    if (chartersResult.error) {
      throw new Error(
        `Could not load concierge charters: ${chartersResult.error.message}`
      );
    }

    const charters =
      (chartersResult.data ??
        []) as unknown as CharterRow[];

    const charterIds =
      charters.map(
        (charter) =>
          charter.id
      );

    let conciergeItems:
      ConciergeItemRow[] = [];

    if (
      charterIds.length > 0
    ) {
      const itemsResult =
        await admin
          .from(
            "charter_concierge_items"
          )
          .select(
            [
              "charter_id",
              "category",
              "status",
              "priority",
              "scheduled_at",
              "client_visible",
              "assigned_to",
              "due_at",
              "estimated_cost",
              "currency",
            ].join(",")
          )
          .eq(
            "company_id",
            workspace.companyId
          )
          .in(
            "charter_id",
            charterIds
          );

      if (itemsResult.error) {
        throw new Error(
          `Could not load concierge activity: ${itemsResult.error.message}`
        );
      }

      conciergeItems =
        (itemsResult.data ??
          []) as unknown as ConciergeItemRow[];
    }

    const itemsByCharter =
      new Map<
        string,
        ConciergeItemRow[]
      >();

    for (
      const item of conciergeItems
    ) {
      const existing =
        itemsByCharter.get(
          item.charter_id
        ) ?? [];

      existing.push(item);

      itemsByCharter.set(
        item.charter_id,
        existing
      );
    }

    const serializedCharters =
      charters.map(
        (charter) => {
          const items =
            itemsByCharter.get(
              charter.id
            ) ?? [];

          const activeItems =
            items.filter(
              (item) =>
                ![
                  "completed",
                  "cancelled",
                ].includes(
                  item.status
                )
            );

          const urgentItems =
            activeItems.filter(
              (item) =>
                item.priority ===
                "urgent"
            );

          const confirmedItems =
            items.filter(
              (item) =>
                item.status ===
                "confirmed"
            );

          const completedItems =
            items.filter(
              (item) =>
                item.status ===
                "completed"
            );

          const guestVisibleItems =
            items.filter(
              (item) =>
                item.client_visible
            );

          const overdueItems =
            activeItems.filter(
              (item) =>
                isOverviewOverdue(
                  item.due_at
                )
            );

          const unassignedItems =
            activeItems.filter(
              (item) =>
                !item.assigned_to
            );

          const attentionItems =
            activeItems.filter(
              (item) =>
                item.priority ===
                  "urgent" ||
                isOverviewOverdue(
                  item.due_at
                ) ||
                !item.assigned_to
            );

          const nextScheduledAt =
            activeItems
              .map(
                (item) =>
                  item.scheduled_at
              )
              .filter(
                (
                  value
                ): value is string =>
                  Boolean(value)
              )
              .sort()[0] ??
            null;

          const estimatedOpenCost =
            activeItems.reduce(
              (
                total,
                item
              ) =>
                total +
                numberValue(
                  item.estimated_cost
                ),
              0
            );

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
            embarkationPort:
              charter.embarkation_port,
            disembarkationPort:
              charter.disembarkation_port,
            guests:
              charter.guests,
            currency:
              charter.currency,
            contractStatus:
              charter.contract_status,
            charterStatus:
              charter.charter_status,
            concierge: {
              total:
                items.length,
              active:
                activeItems.length,
              urgent:
                urgentItems.length,
              confirmed:
                confirmedItems.length,
              completed:
                completedItems.length,
              guestVisible:
                guestVisibleItems.length,
              overdue:
                overdueItems.length,
              unassigned:
                unassignedItems.length,
              attention:
                attentionItems.length,
              nextScheduledAt,
              estimatedOpenCost,
            },
          };
        }
      );

    const summary =
      serializedCharters.reduce(
        (
          current,
          charter
        ) => ({
          charters:
            current.charters +
            1,
          activeRequests:
            current.activeRequests +
            charter.concierge
              .active,
          urgentRequests:
            current.urgentRequests +
            charter.concierge
              .urgent,
          confirmedRequests:
            current.confirmedRequests +
            charter.concierge
              .confirmed,
          guestVisible:
            current.guestVisible +
            charter.concierge
              .guestVisible,
          attentionRequests:
            current.attentionRequests +
            charter.concierge
              .attention,
        }),
        {
          charters: 0,
          activeRequests: 0,
          urgentRequests: 0,
          confirmedRequests: 0,
          guestVisible: 0,
          attentionRequests: 0,
        }
      );

    return NextResponse.json(
      {
        success: true,
        summary,
        charters:
          serializedCharters,
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
      "Could not load Concierge."
    );
  }
}

function isOverviewOverdue(
  dueAt: string | null
) {
  if (!dueAt) {
    return false;
  }

  const due =
    new Date(dueAt);

  return (
    !Number.isNaN(
      due.getTime()
    ) &&
    due.getTime() <
      Date.now()
  );
}

function numberValue(
  value: unknown
) {
  if (
    typeof value ===
      "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value ===
      "string" &&
    value.trim().length > 0
  ) {
    const parsed =
      Number(value);

    return Number.isFinite(
      parsed
    )
      ? parsed
      : 0;
  }

  return 0;
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
    "Concierge overview API error:",
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