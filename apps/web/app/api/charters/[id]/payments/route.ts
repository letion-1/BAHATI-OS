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

const paymentTypes = new Set([
  "deposit",
  "balance",
  "apa",
  "vat",
  "other",
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
    const admin = createAdminClient();

    const charterResult = await admin
      .from("charters")
      .select("id, currency")
      .eq(
        "company_id",
        workspace.companyId
      )
      .eq("id", charterId)
      .maybeSingle();

    if (charterResult.error) {
      throw new Error(
        `Could not load charter: ${charterResult.error.message}`
      );
    }

    if (!charterResult.data) {
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

    const body = await request.json();

    const paymentType =
      cleanText(body.paymentType);

    if (
      !paymentType ||
      !paymentTypes.has(paymentType)
    ) {
      return badRequest(
        "Choose a valid payment type."
      );
    }

    const amount =
      readRequiredNonNegativeNumber(
        body.amount
      );

    if (amount === null) {
      return badRequest(
        "Payment amount must be a valid non-negative number."
      );
    }

    const currency =
      readCurrency(body.currency) ??
      readCurrency(
        charterResult.data.currency
      ) ??
      "EUR";

    const dueDate =
      readDate(body.dueDate);

    if (
      body.dueDate &&
      !dueDate
    ) {
      return badRequest(
        "Due date must use YYYY-MM-DD."
      );
    }

    const now =
      new Date().toISOString();

    const insertResult = await admin
      .from("charter_payment_schedule")
      .insert({
        company_id:
          workspace.companyId,
        charter_id: charterId,
        payment_type: paymentType,
        label:
          cleanText(body.label),
        amount,
        currency,
        due_date: dueDate,
        status:
          deriveInitialItemStatus(
            dueDate
          ),
        amount_paid: 0,
        paid_at: null,
        payment_reference: null,
        notes:
          cleanText(body.notes),
        created_by: workspace.userId,
        created_at: now,
        updated_at: now,
      })
      .select(paymentSelect())
      .single();

    if (
      insertResult.error ||
      !insertResult.data
    ) {
      throw new Error(
        `Could not create payment milestone: ${
          insertResult.error?.message ??
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
            insertResult.data as unknown as PaymentRow
          ),
        paymentStatus: aggregate,
      },
      {
        status: 201,
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not create payment milestone."
    );
  }
}

async function syncCharterPaymentStatus(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  charterId: string
) {
  const result = await admin
    .from("charter_payment_schedule")
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

function deriveInitialItemStatus(
  dueDate: string | null
) {
  if (!dueDate) {
    return "not_due";
  }

  const today =
    todayIsoDate();

  if (dueDate < today) {
    return "overdue";
  }

  if (dueDate === today) {
    return "due";
  }

  return "not_due";
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

async function readCharterId(
  context: RouteContext
) {
  const params =
    await Promise.resolve(
      context.params
    );

  return params.id?.trim() || null;
}

function cleanText(
  value: unknown
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const cleaned = value.trim();

  return cleaned.length > 0
    ? cleaned
    : null;
}

function readCurrency(
  value: unknown
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim().toUpperCase();

  return /^[A-Z]{3}$/.test(cleaned)
    ? cleaned
    : null;
}

function readDate(
  value: unknown
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const cleaned = value.trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(
    cleaned
  )
    ? cleaned
    : null;
}

function readRequiredNonNegativeNumber(
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
    "Charter payments API error:",
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