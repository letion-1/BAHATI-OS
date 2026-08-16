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

const charterStatuses = new Set([
  "draft",
  "contracting",
  "confirmed",
  "active",
  "completed",
  "cancelled",
]);

const contractStatuses = new Set([
  "not_started",
  "draft",
  "ready",
  "sent",
  "signed",
  "declined",
  "expired",
  "cancelled",
]);

const paymentStatuses = new Set([
  "not_started",
  "deposit_due",
  "deposit_paid",
  "balance_due",
  "partially_paid",
  "paid",
  "overdue",
  "cancelled",
]);

type CharterRow = {
  id: string;
  company_id: string;
  proposal_id: string;
  confirmation_id: string;
  proposal_yacht_id: string | null;
  fleet_id: string | null;
  reference: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  yacht_name: string;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  embarkation_port: string | null;
  disembarkation_port: string | null;
  guests: number | null;
  currency: string;
  charter_fee: number | string | null;
  vat_percent: number | string | null;
  vat_amount: number | string | null;
  apa_percent: number | string | null;
  apa_amount: number | string | null;
  deposit_percent: number | string | null;
  deposit_amount: number | string | null;
  balance_amount: number | string | null;
  total_contract_value: number | string | null;
  charter_status: string;
  contract_status: string;
  payment_status: string;
  contract_sent_at: string | null;
  contract_signed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentRow = {
  id: string;
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
  created_at: string;
  updated_at: string;
};

type DocumentRow = {
  id: string;
  name: string;
  category: string;
  mime_type: string;
  file_size: number | string;
  version: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const charterId =
      await readCharterId(context);

    if (!charterId) {
      return NextResponse.json(
        {
          success: false,
          error: "A charter ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const workspace =
      await getCurrentWorkspace();
    const admin = createAdminClient();

    const charter = await loadCharter(
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

    const [
      paymentResult,
      documentResult,
    ] = await Promise.all([
      admin
        .from(
          "charter_payment_schedule"
        )
        .select(
          "id, payment_type, label, amount, currency, due_date, status, amount_paid, paid_at, payment_reference, notes, created_at, updated_at"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq("charter_id", charterId)
        .order("due_date", {
          ascending: true,
          nullsFirst: false,
        }),
      admin
        .from("documents")
        .select(
          "id, name, category, mime_type, file_size, version, status, created_at, updated_at"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq("charter_id", charterId)
        .order("updated_at", {
          ascending: false,
        }),
    ]);

    if (paymentResult.error) {
      throw new Error(
        `Could not load payment schedule: ${paymentResult.error.message}`
      );
    }

    if (documentResult.error) {
      throw new Error(
        `Could not load charter documents: ${documentResult.error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
        charter:
          serializeCharter(charter),
        payments: (
          paymentResult.data ?? []
        ).map((row) =>
          serializePayment(
            row as unknown as PaymentRow
          )
        ),
        documents: (
          documentResult.data ?? []
        ).map((row) =>
          serializeDocument(
            row as unknown as DocumentRow
          )
        ),
      },
      {
        status: 200,
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not load charter."
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const charterId =
      await readCharterId(context);

    if (!charterId) {
      return NextResponse.json(
        {
          success: false,
          error: "A charter ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const workspace =
      await getCurrentWorkspace();
    const admin = createAdminClient();

    const existing = await loadCharter(
      admin,
      workspace.companyId,
      charterId
    );

    if (!existing) {
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
    const patch:
      Record<string, unknown> = {};

    assignNullableText(
      patch,
      "destination",
      body.destination
    );
    assignNullableText(
      patch,
      "embarkation_port",
      body.embarkationPort
    );
    assignNullableText(
      patch,
      "disembarkation_port",
      body.disembarkationPort
    );

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "guests"
      )
    ) {
      const guests = readNullableInteger(
        body.guests
      );

      if (
        body.guests !== null &&
        body.guests !== "" &&
        guests === null
      ) {
        return badRequest(
          "Guests must be a whole number."
        );
      }

      patch.guests = guests;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "currency"
      )
    ) {
      const currency = readCurrency(
        body.currency
      );

      if (!currency) {
        return badRequest(
          "Currency must be a three-letter code."
        );
      }

      patch.currency = currency;
    }

    const numericFields: Array<{
      bodyKey: string;
      dbKey: string;
      label: string;
    }> = [
      {
        bodyKey: "charterFee",
        dbKey: "charter_fee",
        label: "Charter fee",
      },
      {
        bodyKey: "vatPercent",
        dbKey: "vat_percent",
        label: "VAT percent",
      },
      {
        bodyKey: "vatAmount",
        dbKey: "vat_amount",
        label: "VAT amount",
      },
      {
        bodyKey: "apaPercent",
        dbKey: "apa_percent",
        label: "APA percent",
      },
      {
        bodyKey: "apaAmount",
        dbKey: "apa_amount",
        label: "APA amount",
      },
      {
        bodyKey: "depositPercent",
        dbKey: "deposit_percent",
        label: "Deposit percent",
      },
      {
        bodyKey: "depositAmount",
        dbKey: "deposit_amount",
        label: "Deposit amount",
      },
      {
        bodyKey: "balanceAmount",
        dbKey: "balance_amount",
        label: "Balance amount",
      },
      {
        bodyKey: "totalContractValue",
        dbKey: "total_contract_value",
        label: "Total contract value",
      },
    ];

    for (const field of numericFields) {
      if (
        !Object.prototype.hasOwnProperty.call(
          body,
          field.bodyKey
        )
      ) {
        continue;
      }

      const raw =
        body[field.bodyKey];

      const value =
        readNullableNumber(raw);

      if (
        raw !== null &&
        raw !== "" &&
        value === null
      ) {
        return badRequest(
          `${field.label} must be a valid number.`
        );
      }

      if (
        value !== null &&
        value < 0
      ) {
        return badRequest(
          `${field.label} cannot be negative.`
        );
      }

      patch[field.dbKey] = value;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "charterStatus"
      )
    ) {
      const value =
        cleanText(body.charterStatus);

      if (
        !value ||
        !charterStatuses.has(value)
      ) {
        return badRequest(
          "Choose a valid charter status."
        );
      }

      patch.charter_status = value;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "contractStatus"
      )
    ) {
      const value =
        cleanText(body.contractStatus);

      if (
        !value ||
        !contractStatuses.has(value)
      ) {
        return badRequest(
          "Choose a valid contract status."
        );
      }

      patch.contract_status = value;

      const now =
        new Date().toISOString();

      if (
        value === "sent" &&
        !existing.contract_sent_at
      ) {
        patch.contract_sent_at = now;
      }

      if (
        value === "signed" &&
        !existing.contract_signed_at
      ) {
        patch.contract_signed_at = now;

        if (
          existing.charter_status ===
            "draft" ||
          existing.charter_status ===
            "contracting"
        ) {
          patch.charter_status =
            "confirmed";
        }
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "paymentStatus"
      )
    ) {
      const value =
        cleanText(body.paymentStatus);

      if (
        !value ||
        !paymentStatuses.has(value)
      ) {
        return badRequest(
          "Choose a valid payment status."
        );
      }

      patch.payment_status = value;
    }

    if (
      Object.keys(patch).length === 0
    ) {
      return badRequest(
        "No charter changes were supplied."
      );
    }

    patch.updated_at =
      new Date().toISOString();

    const result = await admin
      .from("charters")
      .update(patch)
      .eq(
        "company_id",
        workspace.companyId
      )
      .eq("id", charterId)
      .select(charterSelect())
      .single();

    if (
      result.error ||
      !result.data
    ) {
      throw new Error(
        `Could not update charter: ${
          result.error?.message ??
          "Unknown error."
        }`
      );
    }

    return NextResponse.json(
      {
        success: true,
        charter:
          serializeCharter(
            result.data as unknown as CharterRow
          ),
      },
      {
        status: 200,
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not update charter."
    );
  }
}

async function loadCharter(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  charterId: string
): Promise<CharterRow | null> {
  const result = await admin
    .from("charters")
    .select(charterSelect())
    .eq("company_id", companyId)
    .eq("id", charterId)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      `Could not load charter: ${result.error.message}`
    );
  }

  return result.data
    ? (result.data as unknown as CharterRow)
    : null;
}

function charterSelect() {
  return "id, company_id, proposal_id, confirmation_id, proposal_yacht_id, fleet_id, reference, client_name, client_email, client_phone, yacht_name, start_date, end_date, destination, embarkation_port, disembarkation_port, guests, currency, charter_fee, vat_percent, vat_amount, apa_percent, apa_amount, deposit_percent, deposit_amount, balance_amount, total_contract_value, charter_status, contract_status, payment_status, contract_sent_at, contract_signed_at, cancelled_at, cancelled_by, cancellation_reason, created_by, created_at, updated_at";
}

function serializeCharter(
  row: CharterRow
) {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    confirmationId:
      row.confirmation_id,
    proposalYachtId:
      row.proposal_yacht_id,
    fleetId: row.fleet_id,
    reference: row.reference,

    client: {
      name: row.client_name,
      email: row.client_email,
      phone: row.client_phone,
    },

    yacht: {
      name: row.yacht_name,
      fleetId: row.fleet_id,
    },

    charter: {
      startDate: row.start_date,
      endDate: row.end_date,
      destination: row.destination,
      embarkationPort:
        row.embarkation_port,
      disembarkationPort:
        row.disembarkation_port,
      guests: row.guests,
    },

    commercial: {
      currency: row.currency,
      charterFee:
        toNullableNumber(
          row.charter_fee
        ),
      vatPercent:
        toNullableNumber(
          row.vat_percent
        ),
      vatAmount:
        toNullableNumber(
          row.vat_amount
        ),
      apaPercent:
        toNullableNumber(
          row.apa_percent
        ),
      apaAmount:
        toNullableNumber(
          row.apa_amount
        ),
      depositPercent:
        toNullableNumber(
          row.deposit_percent
        ),
      depositAmount:
        toNullableNumber(
          row.deposit_amount
        ),
      balanceAmount:
        toNullableNumber(
          row.balance_amount
        ),
      totalContractValue:
        toNullableNumber(
          row.total_contract_value
        ),
    },

    charterStatus:
      row.charter_status,
    contractStatus:
      row.contract_status,
    paymentStatus:
      row.payment_status,

    contractSentAt:
      row.contract_sent_at,
    contractSignedAt:
      row.contract_signed_at,

    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    cancellationReason:
      row.cancellation_reason,

    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializePayment(
  row: PaymentRow
) {
  return {
    id: row.id,
    paymentType: row.payment_type,
    label: row.label,
    amount:
      toNullableNumber(row.amount) ?? 0,
    currency: row.currency,
    dueDate: row.due_date,
    status: row.status,
    amountPaid:
      toNullableNumber(
        row.amount_paid
      ) ?? 0,
    paidAt: row.paid_at,
    paymentReference:
      row.payment_reference,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeDocument(
  row: DocumentRow
) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    mimeType: row.mime_type,
    fileSize:
      toNullableNumber(
        row.file_size
      ) ?? 0,
    version: row.version,
    status: row.status,
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

function assignNullableText(
  target: Record<string, unknown>,
  key: string,
  raw: unknown
) {
  if (
    raw === undefined
  ) {
    return;
  }

  target[key] =
    cleanText(raw);
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

function readNullableNumber(
  value: unknown
): number | null {
  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      Number(value.trim());

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function readNullableInteger(
  value: unknown
): number | null {
  const number =
    readNullableNumber(value);

  if (
    number === null ||
    !Number.isInteger(number)
  ) {
    return null;
  }

  return number;
}

function toNullableNumber(
  value: unknown
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim().length > 0
  ) {
    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function badRequest(message: string) {
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
    "Charter API error:",
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