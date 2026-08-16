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
        itemId: string;
      }>
    | {
        id: string;
        itemId: string;
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
  created_at: string;
  updated_at: string;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const ids =
      await readIds(context);

    if (
      !ids.charterId ||
      !ids.itemId
    ) {
      return badRequest(
        "Charter ID and concierge item ID are required."
      );
    }

    const workspace =
      await getCurrentWorkspace();
    const admin =
      createAdminClient();

    const body =
      await request.json();

    const patch:
      Record<string, unknown> = {
        updated_at:
          new Date().toISOString(),
      };

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "category"
      )
    ) {
      const category =
        cleanText(
          body.category
        );

      if (
        !category ||
        !categories.has(category)
      ) {
        return badRequest(
          "Choose a valid concierge category."
        );
      }

      patch.category =
        category;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "title"
      )
    ) {
      const title =
        cleanText(
          body.title
        );

      if (!title) {
        return badRequest(
          "Title cannot be blank."
        );
      }

      patch.title = title;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "description"
      )
    ) {
      patch.description =
        cleanText(
          body.description
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "status"
      )
    ) {
      const status =
        cleanText(
          body.status
        );

      if (
        !status ||
        !statuses.has(status)
      ) {
        return badRequest(
          "Choose a valid concierge status."
        );
      }

      patch.status =
        status;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "priority"
      )
    ) {
      const priority =
        cleanText(
          body.priority
        );

      if (
        !priority ||
        !priorities.has(priority)
      ) {
        return badRequest(
          "Choose a valid priority."
        );
      }

      patch.priority =
        priority;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "scheduledAt"
      )
    ) {
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

      patch.scheduled_at =
        scheduledAt.value;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "location"
      )
    ) {
      patch.location =
        cleanText(
          body.location
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "vendorName"
      )
    ) {
      patch.vendor_name =
        cleanText(
          body.vendorName
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "vendorContact"
      )
    ) {
      patch.vendor_contact =
        cleanText(
          body.vendorContact
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "estimatedCost"
      )
    ) {
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

      patch.estimated_cost =
        estimatedCost.value;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "currency"
      )
    ) {
      const currency =
        readCurrency(
          body.currency
        );

      if (!currency) {
        return badRequest(
          "Currency must be a three-letter ISO code."
        );
      }

      patch.currency =
        currency;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "source"
      )
    ) {
      const source =
        cleanText(
          body.source
        );

      if (
        !source ||
        !sources.has(source)
      ) {
        return badRequest(
          "Choose a valid source."
        );
      }

      patch.source =
        source;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "clientVisible"
      )
    ) {
      patch.client_visible =
        body.clientVisible ===
        true;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "notes"
      )
    ) {
      patch.notes =
        cleanText(
          body.notes
        );
    }

    if (
      Object.keys(patch).length === 1
    ) {
      return badRequest(
        "No concierge changes were supplied."
      );
    }

    const result =
      await admin
        .from(
          "charter_concierge_items"
        )
        .update(patch)
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          ids.charterId
        )
        .eq(
          "id",
          ids.itemId
        )
        .select(
          conciergeSelect()
        )
        .maybeSingle();

    if (result.error) {
      throw new Error(
        `Could not update concierge item: ${result.error.message}`
      );
    }

    if (!result.data) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Concierge item not found.",
        },
        {
          status: 404,
        }
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
        status: 200,
        headers:
          noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not update concierge item."
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const ids =
      await readIds(context);

    if (
      !ids.charterId ||
      !ids.itemId
    ) {
      return badRequest(
        "Charter ID and concierge item ID are required."
      );
    }

    const workspace =
      await getCurrentWorkspace();
    const admin =
      createAdminClient();

    const result =
      await admin
        .from(
          "charter_concierge_items"
        )
        .delete()
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          ids.charterId
        )
        .eq(
          "id",
          ids.itemId
        )
        .select("id")
        .maybeSingle();

    if (result.error) {
      throw new Error(
        `Could not delete concierge item: ${result.error.message}`
      );
    }

    if (!result.data) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Concierge item not found.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        deleted: true,
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
      "Could not delete concierge item."
    );
  }
}

function conciergeSelect() {
  return [
    "id",
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
    "created_at",
    "updated_at",
  ].join(",");
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
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  };
}

async function readIds(
  context: RouteContext
) {
  const params =
    await Promise.resolve(
      context.params
    );

  return {
    charterId:
      params.id?.trim() ||
      null,
    itemId:
      params.itemId?.trim() ||
      null,
  };
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
    "Charter concierge item API error:",
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