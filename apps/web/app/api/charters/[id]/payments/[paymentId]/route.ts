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
        paymentId: string;
      }>
    | {
        id: string;
        paymentId: string;
      };
};

const itemStatuses = new Set([
  "not_due",
  "due",
  "paid",
  "partially_paid",
  "overdue",
  "waived",
  "cancelled",
]);

type PaymentRow = {
  id: string;
  company_id: string;
  charter_id: string;
  payment_type: string;
  label: string | null;
  amount: number | string;
  currency: string;
  due_date: string | null;
  status: string;
  amount_paid: number | string;
  paid_at: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const {
      charterId,
      paymentId,
    } = await readIds(context);

    if (!charterId || !paymentId) {
      return badRequest(
        "Charter ID and payment ID are required."
      );
    }

    const workspace =
      await getCurrentWorkspace();
    const admin = createAdminClient();

    const existingResult =
      await admin
        .from(
          "charter_payment_schedule"
        )
        .select(paymentSelect())
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          charterId
        )
        .eq("id", paymentId)
        .maybeSingle();

    if (existingResult.error) {
      throw new Error(
        `Could not load payment milestone: ${existingResult.error.message}`
      );
    }

    if (!existingResult.data) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Payment milestone not found.",
        },
        {
          status: 404,
        }
      );
    }

    const existing =
      existingResult.data as unknown as PaymentRow;

    const body = await request.json();
    const patch:
      Record<string, unknown> = {};

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "status"
      )
    ) {
      const status =
        cleanText(body.status);

      if (
        !status ||
        !itemStatuses.has(status)
      ) {
        return badRequest(
          "Choose a valid payment status."
        );
      }

      patch.status = status;

      if (status === "paid") {
        patch.amount_paid =
          toNumber(existing.amount);
        patch.paid_at =
          existing.paid_at ??
          new Date().toISOString();
      }

      if (
        status === "not_due" ||
        status === "due" ||
        status === "overdue"
      ) {
        patch.paid_at = null;

        if (
          toNumber(
            existing.amount_paid
          ) >=
          toNumber(existing.amount)
        ) {
          patch.amount_paid = 0;
        }
      }

      if (
        status === "waived" ||
        status === "cancelled"
      ) {
        patch.paid_at = null;
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "amountPaid"
      )
    ) {
      const amountPaid =
        readNonNegativeNumber(
          body.amountPaid
        );

      if (amountPaid === null) {
        return badRequest(
          "Amount paid must be a valid non-negative number."
        );
      }

      const amount =
        toNumber(existing.amount);

      if (amountPaid > amount) {
        return badRequest(
          "Amount paid cannot exceed the scheduled amount."
        );
      }

      patch.amount_paid =
        amountPaid;

      if (amountPaid === 0) {
        patch.paid_at = null;
      } else if (
        amountPaid < amount
      ) {
        patch.status =
          "partially_paid";
        patch.paid_at =
          new Date().toISOString();
      } else {
        patch.status = "paid";
        patch.paid_at =
          existing.paid_at ??
          new Date().toISOString();
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "paymentReference"
      )
    ) {
      patch.payment_reference =
        cleanText(
          body.paymentReference
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "notes"
      )
    ) {
      patch.notes =
        cleanText(body.notes);
    }

    if (
      Object.keys(patch).length === 0
    ) {
      return badRequest(
        "No payment changes were supplied."
      );
    }

    patch.updated_at =
      new Date().toISOString();

    const updateResult = await admin
      .from(
        "charter_payment_schedule"
      )
      .update(patch)
      .eq(
        "company_id",
        workspace.companyId
      )
      .eq("charter_id", charterId)
      .eq("id", paymentId)
      .select(paymentSelect())
      .single();

    if (
      updateResult.error ||
      !updateResult.data
    ) {
      throw new Error(
        `Could not update payment milestone: ${
          updateResult.error?.message ??
          "Unknown error."
        }`
      );
    }

    const aggregate =
      await syncCharterPaymentStatus(
        admin,
        workspace.companyId,
        charterId
      );

    return NextResponse.json(
      {
        success: true,
        payment:
          serializePayment(
            updateResult.data as unknown as PaymentRow
          ),
        paymentStatus: aggregate,
      },
      {
        status: 200,
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not update payment milestone."
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const {
      charterId,
      paymentId,
    } = await readIds(context);

    if (!charterId || !paymentId) {
      return badRequest(
        "Charter ID and payment ID are required."
      );
    }

    const workspace =
      await getCurrentWorkspace();
    const admin = createAdminClient();

    const deleteResult = await admin
      .from(
        "charter_payment_schedule"
      )
      .delete()
      .eq(
        "company_id",
        workspace.companyId
      )
      .eq("charter_id", charterId)
      .eq("id", paymentId)
      .select("id")
      .maybeSingle();

    if (deleteResult.error) {
      throw new Error(
        `Could not delete payment milestone: ${deleteResult.error.message}`
      );
    }

    if (!deleteResult.data) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Payment milestone not found.",
        },
        {
          status: 404,
        }
      );
    }

    const aggregate =
      await syncCharterPaymentStatus(
        admin,
        workspace.companyId,
        charterId
      );

    return NextResponse.json(
      {
        success: true,
        deleted: true,
        paymentStatus: aggregate,
      },
      {
        status: 200,
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not delete payment milestone."
    );
  }
}

async function syncCharterPaymentStatus(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  charterId: string
) {
  const result = await admin
    .from(
      "charter_payment_schedule"
    )
    .select(paymentSelect())
    .eq("company_id", companyId)
    .eq("charter_id", charterId);

  if (result.error) {
    throw new Error(
      `Could not calculate payment status: ${result.error.message}`
    );
  }

  const rows = (
    result.data ?? []
  ) as unknown as PaymentRow[];

  const aggregate =
    deriveAggregatePaymentStatus(rows);

  const updateResult = await admin
    .from("charters")
    .update({
      payment_status: aggregate,
      updated_at:
        new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .eq("id", charterId);

  if (updateResult.error) {
    throw new Error(
      `Could not update charter payment status: ${updateResult.error.message}`
    );
  }

  return aggregate;
}

function deriveAggregatePaymentStatus(
  rows: PaymentRow[]
) {
  const active = rows.filter(
    (row) =>
      row.status !== "cancelled" &&
      row.status !== "waived"
  );

  if (active.length === 0) {
    return "not_started";
  }

  const normalized = active.map(
    normalizePaymentRow
  );

  if (
    normalized.every(
      (row) => row.fullyPaid
    )
  ) {
    return "paid";
  }

  if (
    normalized.some(
      (row) => row.overdue
    )
  ) {
    return "overdue";
  }

  if (
    normalized.some(
      (row) =>
        row.amountPaid > 0 &&
        !row.fullyPaid
    )
  ) {
    return "partially_paid";
  }

  const deposit = normalized.find(
    (row) =>
      row.paymentType === "deposit"
  );

  const balance = normalized.find(
    (row) =>
      row.paymentType === "balance"
  );

  if (
    deposit &&
    !deposit.fullyPaid &&
    deposit.isDue
  ) {
    return "deposit_due";
  }

  if (
    deposit?.fullyPaid &&
    balance &&
    !balance.fullyPaid
  ) {
    return balance.isDue
      ? "balance_due"
      : "deposit_paid";
  }

  if (
    !deposit &&
    balance &&
    !balance.fullyPaid &&
    balance.isDue
  ) {
    return "balance_due";
  }

  if (
    deposit?.fullyPaid &&
    normalized.some(
      (row) => !row.fullyPaid
    )
  ) {
    return "deposit_paid";
  }

  return "not_started";
}

function normalizePaymentRow(
  row: PaymentRow
) {
  const amount =
    toNumber(row.amount);
  const amountPaid =
    toNumber(row.amount_paid);

  const fullyPaid =
    row.status === "paid" ||
    amountPaid >= amount;

  const today =
    todayIsoDate();

  const overdue =
    !fullyPaid &&
    (
      row.status === "overdue" ||
      (
        Boolean(row.due_date) &&
        String(row.due_date) < today
      )
    );

  const isDue =
    !fullyPaid &&
    (
      row.status === "due" ||
      row.status === "overdue" ||
      (
        Boolean(row.due_date) &&
        String(row.due_date) <= today
      )
    );

  return {
    paymentType:
      row.payment_type,
    amount,
    amountPaid,
    fullyPaid,
    overdue,
    isDue,
  };
}

function paymentSelect() {
  return "id, company_id, charter_id, payment_type, label, amount, currency, due_date, status, amount_paid, paid_at, payment_reference, notes, created_by, created_at, updated_at";
}

function serializePayment(
  row: PaymentRow
) {
  return {
    id: row.id,
    paymentType:
      row.payment_type,
    label: row.label,
    amount:
      toNumber(row.amount),
    currency: row.currency,
    dueDate: row.due_date,
    status: row.status,
    amountPaid:
      toNumber(row.amount_paid),
    paidAt: row.paid_at,
    paymentReference:
      row.payment_reference,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
      params.id?.trim() || null,
    paymentId:
      params.paymentId?.trim() || null,
  };
}

function cleanText(
  value: unknown
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned.length > 0
    ? cleaned
    : null;
}

function readNonNegativeNumber(
  value: unknown
) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          value.trim()
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    return null;
  }

  return parsed;
}

function toNumber(
  value: unknown
) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function todayIsoDate() {
  return new Date()
    .toISOString()
    .slice(0, 10);
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
    isAuthenticationRequiredError(error)
  ) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: error.status,
      }
    );
  }

  if (
    isWorkspaceAccessError(error)
  ) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: error.status,
      }
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : fallbackMessage;

  console.error(
    "Charter payment item API error:",
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