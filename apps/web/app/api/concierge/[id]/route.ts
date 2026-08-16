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

type RouteContext = {
  params:
    | Promise<{
        id: string;
      }>
    | {
        id: string;
      };
};

const categories = new Set([
  "transfer",
  "restaurant",
  "provisioning",
  "activity",
  "special_request",
  "crew_coordination",
  "other",
]);

const statuses = new Set([
  "pending",
  "planning",
  "confirmed",
  "completed",
  "cancelled",
]);

const priorities = new Set([
  "normal",
  "high",
  "urgent",
]);

const sources = new Set([
  "broker",
  "client",
  "crew",
  "owner",
  "other",
]);

type ConciergeRow = {
  id: string;
  company_id: string;
  charter_id: string;
  category: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  scheduled_at: string | null;
  location: string | null;
  vendor_name: string | null;
  vendor_contact: string | null;
  estimated_cost: number | string | null;
  currency: string;
  source: string;
  client_visible: boolean;
  notes: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  due_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type CharterRow = {
  id: string;
  reference: string;
  yacht_name: string;
  client_name: string;
  client_email: string | null;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  embarkation_port: string | null;
  disembarkation_port: string | null;
  guests: number | null;
  currency: string;
  contract_status: string;
  charter_status: string;
};

export async function GET(
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

    const workspace =
      await getCurrentWorkspace();
    const admin =
      createAdminClient();

    const charter =
      await loadCharter(
        admin,
        workspace.companyId,
        charterId
      );

    if (!charter) {
      return NextResponse.json(
        {
          success: false,
          error: "Charter not found.",
        },
        {
          status: 404,
        }
      );
    }

    const url =
      new URL(request.url);

    const category =
      cleanText(
        url.searchParams.get(
          "category"
        )
      );

    const status =
      cleanText(
        url.searchParams.get(
          "status"
        )
      );

    let query = admin
      .from(
        "charter_concierge_items"
      )
      .select(conciergeSelect())
      .eq(
        "company_id",
        workspace.companyId
      )
      .eq(
        "charter_id",
        charterId
      )
      .order("scheduled_at", {
        ascending: true,
        nullsFirst: false,
      })
      .order("created_at", {
        ascending: false,
      });

    if (
      category &&
      categories.has(category)
    ) {
      query =
        query.eq(
          "category",
          category
        );
    }

    if (
      status &&
      statuses.has(status)
    ) {
      query =
        query.eq(
          "status",
          status
        );
    }

    const result =
      await query;

    if (result.error) {
      throw new Error(
        `Could not load concierge items: ${result.error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
        charter:
          serializeCharter(charter),
        items:
          (
            result.data ?? []
          ).map((row) =>
            serializeConcierge(
              row as unknown as ConciergeRow
            )
          ),
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
      "Could not load concierge workspace."
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

    const workspace =
      await getCurrentWorkspace();
    const admin =
      createAdminClient();

    const charter =
      await loadCharter(
        admin,
        workspace.companyId,
        charterId
      );

    if (!charter) {
      return NextResponse.json(
        {
          success: false,
          error: "Charter not found.",
        },
        {
          status: 404,
        }
      );
    }

    const body =
      await request.json();

    const category =
      cleanText(
        body.category
      );

    const title =
      cleanText(body.title);

    const status =
      cleanText(
        body.status
      ) ?? "pending";

    const priority =
      cleanText(
        body.priority
      ) ?? "normal";

    const source =
      cleanText(
        body.source
      ) ?? "broker";

    if (
      !category ||
      !categories.has(category)
    ) {
      return badRequest(
        "Choose a valid concierge category."
      );
    }

    if (!title) {
      return badRequest(
        "A concierge item title is required."
      );
    }

    if (
      !statuses.has(status)
    ) {
      return badRequest(
        "Choose a valid concierge status."
      );
    }

    if (
      !priorities.has(priority)
    ) {
      return badRequest(
        "Choose a valid priority."
      );
    }

    if (
      !sources.has(source)
    ) {
      return badRequest(
        "Choose a valid source."
      );
    }

    const currency =
      readCurrency(
        body.currency
      ) ??
      readCurrency(
        charter.currency
      ) ??
      "EUR";

    const estimatedCost =
      readOptionalNonNegativeNumber(
        body.estimatedCost
      );

    if (
      estimatedCost.error
    ) {
      return badRequest(
        estimatedCost.error
      );
    }

    const scheduledAt =
      readOptionalDateTime(
        body.scheduledAt
      );

    if (
      scheduledAt.error
    ) {
      return badRequest(
        scheduledAt.error
      );
    }

    const now =
      new Date().toISOString();

    const result =
      await admin
        .from(
          "charter_concierge_items"
        )
        .insert({
          company_id:
            workspace.companyId,
          charter_id:
            charterId,
          category,
          title,
          description:
            cleanText(
              body.description
            ),
          status,
          priority,
          scheduled_at:
            scheduledAt.value,
          location:
            cleanText(
              body.location
            ),
          vendor_name:
            cleanText(
              body.vendorName
            ),
          vendor_contact:
            cleanText(
              body.vendorContact
            ),
          estimated_cost:
            estimatedCost.value,
          currency,
          source,
          client_visible:
            body.clientVisible ===
            true,
          notes:
            cleanText(
              body.notes
            ),
          created_by:
            workspace.userId,
          created_at: now,
          updated_at: now,
        })
        .select(
          conciergeSelect()
        )
        .single();

    if (
      result.error ||
      !result.data
    ) {
      throw new Error(
        `Could not create concierge item: ${
          result.error
            ?.message ??
          "Unknown error."
        }`
      );
    }

    return NextResponse.json(
      {
        success: true,
        item:
          serializeConcierge(
            result.data as unknown as ConciergeRow
          ),
      },
      {
        status: 201,
        headers:
          noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not create concierge item."
    );
  }
}

async function loadCharter(
  admin: ReturnType<
    typeof createAdminClient
  >,
  companyId: string,
  charterId: string
): Promise<CharterRow | null> {
  const result =
    await admin
      .from("charters")
      .select(
        [
          "id",
          "reference",
          "yacht_name",
          "client_name",
          "client_email",
          "start_date",
          "end_date",
          "destination",
          "embarkation_port",
          "disembarkation_port",
          "guests",
          "currency",
          "contract_status",
          "charter_status",
        ].join(",")
      )
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "id",
        charterId
      )
      .maybeSingle();

  if (result.error) {
    throw new Error(
      `Could not load charter: ${result.error.message}`
    );
  }

  return (
    result.data ??
    null
  ) as CharterRow | null;
}

function conciergeSelect() {
  return [
    "id",
    "company_id",
    "charter_id",
    "category",
    "title",
    "description",
    "status",
    "priority",
    "scheduled_at",
    "location",
    "vendor_name",
    "vendor_contact",
    "estimated_cost",
    "currency",
    "source",
    "client_visible",
    "notes",
    "assigned_to",
    "assigned_at",
    "due_at",
    "created_by",
    "created_at",
    "updated_at",
  ].join(",");
}

function serializeCharter(
  row: CharterRow
) {
  return {
    id: row.id,
    reference:
      row.reference,
    yachtName:
      row.yacht_name,
    clientName:
      row.client_name,
    clientEmail:
      row.client_email,
    startDate:
      row.start_date,
    endDate:
      row.end_date,
    destination:
      row.destination,
    embarkationPort:
      row.embarkation_port,
    disembarkationPort:
      row.disembarkation_port,
    guests:
      row.guests,
    currency:
      row.currency,
    contractStatus:
      row.contract_status,
    charterStatus:
      row.charter_status,
  };
}

function serializeConcierge(
  row: ConciergeRow
) {
  return {
    id: row.id,
    category:
      row.category,
    title: row.title,
    description:
      row.description,
    status: row.status,
    priority:
      row.priority,
    scheduledAt:
      row.scheduled_at,
    location:
      row.location,
    vendorName:
      row.vendor_name,
    vendorContact:
      row.vendor_contact,
    estimatedCost:
      toNullableNumber(
        row.estimated_cost
      ),
    currency:
      row.currency,
    source:
      row.source,
    clientVisible:
      Boolean(
        row.client_visible
      ),
    notes:
      row.notes,
    assignedTo:
      row.assigned_to,
    assignedAt:
      row.assigned_at,
    dueAt:
      row.due_at,
    overdue:
      isConciergeOverdue(
        row.due_at,
        row.status
      ),
    needsAttention:
      isConciergeAttentionNeeded(
        row
      ),
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  };
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

function readCurrency(
  value: unknown
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const cleaned =
    value
      .trim()
      .toUpperCase();

  return /^[A-Z]{3}$/.test(
    cleaned
  )
    ? cleaned
    : null;
}

function readOptionalNonNegativeNumber(
  value: unknown
):
  | {
      value: number | null;
      error: null;
    }
  | {
      value: null;
      error: string;
    } {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return {
      value: null,
      error: null,
    };
  }

  const parsed =
    typeof value ===
    "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed < 0
  ) {
    return {
      value: null,
      error:
        "Estimated cost must be a valid non-negative number.",
    };
  }

  return {
    value: parsed,
    error: null,
  };
}

function readOptionalDateTime(
  value: unknown
):
  | {
      value: string | null;
      error: null;
    }
  | {
      value: null;
      error: string;
    } {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return {
      value: null,
      error: null,
    };
  }

  if (
    typeof value !==
    "string"
  ) {
    return {
      value: null,
      error:
        "Scheduled time is invalid.",
    };
  }

  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return {
      value: null,
      error:
        "Scheduled time is invalid.",
    };
  }

  return {
    value:
      parsed.toISOString(),
    error: null,
  };
}

function toNullableNumber(
  value: unknown
): number | null {
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
      : null;
  }

  return null;
}

function isConciergeOverdue(
  dueAt: string | null,
  status: string
) {
  if (
    !dueAt ||
    [
      "completed",
      "cancelled",
    ].includes(status)
  ) {
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

function isConciergeAttentionNeeded(
  row: ConciergeRow
) {
  if (
    [
      "completed",
      "cancelled",
    ].includes(
      row.status
    )
  ) {
    return false;
  }

  return (
    row.priority ===
      "urgent" ||
    isConciergeOverdue(
      row.due_at,
      row.status
    ) ||
    !row.assigned_to
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
    "Charter concierge API error:",
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