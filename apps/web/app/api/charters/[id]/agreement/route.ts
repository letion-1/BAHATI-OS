import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  NextRequest,
  NextResponse,
} from "next/server";
import React from "react";
import {
  renderToBuffer,
} from "@react-pdf/renderer";

import {
  CharterAgreementPdf,
  type CharterAgreementData,
  type CharterAgreementPayment,
} from "@/components/pdf/charter-agreement-pdf";
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

const BUCKET_NAME = "documents";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

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
  company_id: string;
  proposal_id: string;
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
};

type PaymentRow = {
  payment_type: string;
  label: string | null;
  amount: number | string;
  currency: string;
  due_date: string | null;
  status: string;
  amount_paid: number | string;
};


type FleetRow = {
  id: string;
  hero_image_url: string | null;
};

type YachtImageRow = {
  image_url: string;
  is_hero: boolean;
  position: number;
};

type DocumentRow = {
  id: string;
  name: string;
  category: string;
  mime_type: string;
  file_size: number | string;
  version: number;
  status: string;
  charter_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function POST(
  _request: NextRequest,
  context: RouteContext
) {
  let uploadedStoragePath:
    | string
    | null = null;

  try {
    const params =
      await Promise.resolve(
        context.params
      );

    const charterId =
      params.id?.trim();

    if (!charterId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A charter ID is required.",
        },
        {
          status: 400,
        }
      );
    }

    const workspace =
      await getCurrentWorkspace();
    const admin = createAdminClient();

    const charterResult =
      await admin
        .from("charters")
        .select(
          [
            "id",
            "company_id",
            "proposal_id",
            "fleet_id",
            "reference",
            "client_name",
            "client_email",
            "client_phone",
            "yacht_name",
            "start_date",
            "end_date",
            "destination",
            "embarkation_port",
            "disembarkation_port",
            "guests",
            "currency",
            "charter_fee",
            "vat_percent",
            "vat_amount",
            "apa_percent",
            "apa_amount",
            "deposit_percent",
            "deposit_amount",
            "balance_amount",
            "total_contract_value",
            "charter_status",
            "contract_status",
          ].join(",")
        )
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

    const charter =
      charterResult.data as unknown as CharterRow;

    if (
      !charter.start_date ||
      !charter.end_date
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Charter dates are required before generating an agreement.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      toNullableNumber(
        charter.charter_fee
      ) === null
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "A charter fee is required before generating an agreement.",
        },
        {
          status: 409,
        }
      );
    }

    const [
      paymentsResult,
      latestDocumentResult,
      fleetResult,
      yachtImagesResult,
    ] = await Promise.all([
      admin
        .from(
          "charter_payment_schedule"
        )
        .select(
          "payment_type, label, amount, currency, due_date, status, amount_paid"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          charterId
        )
        .order("due_date", {
          ascending: true,
          nullsFirst: false,
        }),

      admin
        .from("documents")
        .select("version")
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          charterId
        )
        .eq(
          "category",
          "charter_agreement"
        )
        .order("version", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle(),

      charter.fleet_id
        ? admin
            .from("fleet")
            .select("id, hero_image_url")
            .eq(
              "company_id",
              workspace.companyId
            )
            .eq("id", charter.fleet_id)
            .maybeSingle()
        : Promise.resolve({
            data: null,
            error: null,
          }),

      charter.fleet_id
        ? admin
            .from("yacht_images")
            .select(
              "image_url, is_hero, position"
            )
            .eq(
              "company_id",
              workspace.companyId
            )
            .eq(
              "fleet_id",
              charter.fleet_id
            )
            .order("is_hero", {
              ascending: false,
            })
            .order("position", {
              ascending: true,
            })
            .limit(1)
        : Promise.resolve({
            data: [],
            error: null,
          }),
    ]);

    if (paymentsResult.error) {
      throw new Error(
        `Could not load payment schedule: ${paymentsResult.error.message}`
      );
    }

    if (
      latestDocumentResult.error
    ) {
      throw new Error(
        `Could not determine agreement version: ${latestDocumentResult.error.message}`
      );
    }

    if (fleetResult.error) {
      throw new Error(
        `Could not load selected yacht profile: ${fleetResult.error.message}`
      );
    }

    if (yachtImagesResult.error) {
      throw new Error(
        `Could not load selected yacht media: ${yachtImagesResult.error.message}`
      );
    }

    const fleet =
      (fleetResult.data ?? null) as FleetRow | null;

    const yachtImages =
      (yachtImagesResult.data ?? []) as YachtImageRow[];

    const uploadedHeroImageUrl =
      cleanText(fleet?.hero_image_url) ??
      cleanText(yachtImages[0]?.image_url);

    const placeholderImageUrl =
      uploadedHeroImageUrl
        ? null
        : await loadBundledYachtPlaceholder();

    const heroImageUrl =
      uploadedHeroImageUrl ??
      placeholderImageUrl;

    const heroImageIsPlaceholder =
      !uploadedHeroImageUrl &&
      Boolean(placeholderImageUrl);

    const nextVersion =
      Math.max(
        Number(
          latestDocumentResult.data
            ?.version ?? 0
        ),
        0
      ) + 1;

    const generatedAt =
      new Date().toISOString();

    const payments: CharterAgreementPayment[] =
      (
        paymentsResult.data ?? []
      ).map((row) => {
        const payment =
          row as unknown as PaymentRow;

        return {
          paymentType:
            payment.payment_type,
          label: payment.label,
          amount:
            toNullableNumber(
              payment.amount
            ) ?? 0,
          currency:
            cleanCurrency(
              payment.currency
            ) ??
            cleanCurrency(
              charter.currency
            ) ??
            "EUR",
          dueDate:
            payment.due_date,
          status:
            payment.status,
          amountPaid:
            toNullableNumber(
              payment.amount_paid
            ) ?? 0,
        };
      });

    const agreement: CharterAgreementData = {
      reference:
        charter.reference,
      version: nextVersion,
      generatedAt,
      companyName:
        workspace.companyName ||
        "Intrigue Yacht OS",

      client: {
        name:
          charter.client_name,
        email:
          charter.client_email,
        phone:
          charter.client_phone,
      },

      yacht: {
        name:
          charter.yacht_name,
        heroImageUrl,
        heroImageIsPlaceholder,
      },

      charter: {
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
      },

      commercial: {
        currency:
          cleanCurrency(
            charter.currency
          ) ?? "EUR",
        charterFee:
          toNullableNumber(
            charter.charter_fee
          ),
        vatPercent:
          toNullableNumber(
            charter.vat_percent
          ),
        vatAmount:
          toNullableNumber(
            charter.vat_amount
          ),
        apaPercent:
          toNullableNumber(
            charter.apa_percent
          ),
        apaAmount:
          toNullableNumber(
            charter.apa_amount
          ),
        depositPercent:
          toNullableNumber(
            charter.deposit_percent
          ),
        depositAmount:
          toNullableNumber(
            charter.deposit_amount
          ),
        balanceAmount:
          toNullableNumber(
            charter.balance_amount
          ),
        totalContractValue:
          toNullableNumber(
            charter.total_contract_value
          ),
      },

      payments,
    };

    const pdfElement =
      React.createElement(
        CharterAgreementPdf,
        {
          agreement,
        }
      );

    const pdfDocument =
      pdfElement as unknown as Parameters<
        typeof renderToBuffer
      >[0];

    const pdfBuffer =
      await renderToBuffer(
        pdfDocument
      );

    const safeReference =
      sanitizeFileSegment(
        charter.reference
      );

    const fileName =
      `${safeReference}-Charter-Agreement-v${nextVersion}.pdf`;

    const storagePath =
      `${workspace.companyId}/charters/${charterId}/agreements/${fileName}`;

    uploadedStoragePath =
      storagePath;

    const uploadResult =
      await admin.storage
        .from(BUCKET_NAME)
        .upload(
          storagePath,
          pdfBuffer,
          {
            contentType:
              "application/pdf",
            cacheControl: "3600",
            upsert: false,
          }
        );

    if (uploadResult.error) {
      throw new Error(
        `PDF created, but storage upload failed: ${uploadResult.error.message}`
      );
    }

    const insertResult =
      await admin
        .from("documents")
        .insert({
          company_id:
            workspace.companyId,
          name: fileName,
          category:
            "charter_agreement",
          storage_path:
            storagePath,
          mime_type:
            "application/pdf",
          file_size:
            pdfBuffer.length,
          version:
            nextVersion,
          status: "active",
          client_id: null,
          inquiry_id: null,
          proposal_id:
            charter.proposal_id,
          charter_id:
            charterId,
          created_at:
            generatedAt,
          updated_at:
            generatedAt,
        })
        .select(
          "id, name, category, mime_type, file_size, version, status, charter_id, created_at, updated_at"
        )
        .single();

    if (
      insertResult.error ||
      !insertResult.data
    ) {
      await admin.storage
        .from(BUCKET_NAME)
        .remove([
          storagePath,
        ]);

      uploadedStoragePath =
        null;

      throw new Error(
        `PDF upload succeeded, but the document record could not be created: ${
          insertResult.error
            ?.message ??
          "Unknown error."
        }`
      );
    }

    const charterPatch:
      Record<string, unknown> = {
        updated_at:
          generatedAt,
      };

    if (
      charter.contract_status ===
      "not_started"
    ) {
      charterPatch.contract_status =
        "draft";

      if (
        charter.charter_status ===
        "draft"
      ) {
        charterPatch.charter_status =
          "contracting";
      }
    }

    const charterUpdate =
      await admin
        .from("charters")
        .update(charterPatch)
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq("id", charterId);

    if (charterUpdate.error) {
      console.error(
        "Agreement was generated but charter workflow status could not be updated:",
        charterUpdate.error
      );
    }

    const signedUrlResult =
      await admin.storage
        .from(BUCKET_NAME)
        .createSignedUrl(
          storagePath,
          SIGNED_URL_TTL_SECONDS
        );

    const document =
      insertResult.data as unknown as DocumentRow;

    return NextResponse.json(
      {
        success: true,
        document:
          serializeDocument(
            document
          ),
        pdfUrl:
          signedUrlResult.data
            ?.signedUrl ?? null,
        warning:
          signedUrlResult.error
            ?.message ?? null,
        generatedAt,
        version:
          nextVersion,
      },
      {
        status: 201,
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    if (uploadedStoragePath) {
      try {
        const admin =
          createAdminClient();

        await admin.storage
          .from(BUCKET_NAME)
          .remove([
            uploadedStoragePath,
          ]);
      } catch (
        cleanupError
      ) {
        console.error(
          "Generated agreement cleanup failed:",
          cleanupError
        );
      }
    }

    return handleRouteError(
      error,
      "Could not generate charter agreement."
    );
  }
}

function serializeDocument(
  row: DocumentRow
) {
  return {
    id: row.id,
    name: row.name,
    category:
      row.category,
    mimeType:
      row.mime_type,
    fileSize:
      toNullableNumber(
        row.file_size
      ) ?? 0,
    version:
      row.version,
    status:
      row.status,
    charterId:
      row.charter_id,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  };
}

function sanitizeFileSegment(
  value: string
) {
  const cleaned = value
    .trim()
    .replace(
      /[^a-zA-Z0-9._-]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .slice(0, 100);

  return cleaned || "charter";
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

function cleanCurrency(
  value: unknown
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim().toUpperCase();

  return /^[A-Z]{3}$/.test(
    cleaned
  )
    ? cleaned
    : null;
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

async function loadBundledYachtPlaceholder(): Promise<string | null> {
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "proposal-yacht",
      "hero-exterior.png"
    );

    const buffer =
      await readFile(filePath);

    return `data:image/png;base64,${buffer.toString(
      "base64"
    )}`;
  } catch (error) {
    console.error(
      "Could not load bundled yacht placeholder image:",
      error
    );

    return null;
  }
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
    "Charter agreement generation failed:",
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