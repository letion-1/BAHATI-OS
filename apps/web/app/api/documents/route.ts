import { NextRequest, NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET_NAME = "documents";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const allowedCategories = new Set([
  "proposal",
  "charter_agreement",
  "invoice",
  "apa",
  "passport",
  "manifest",
  "preference_form",
  "insurance",
  "crew_document",
  "payment_receipt",
  "other",
]);

type DocumentRow = {
  id: string;
  name: string;
  category: string;
  mime_type: string;
  file_size: number;
  version: number;
  status: string;
  client_id: string | null;
  inquiry_id: string | null;
  proposal_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("documents")
      .select(
        [
          "id",
          "name",
          "category",
          "mime_type",
          "file_size",
          "version",
          "status",
          "client_id",
          "inquiry_id",
          "proposal_id",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .eq("company_id", workspace.companyId)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(
        `Could not load documents: ${error.message}`
      );
    }

    const rows =
      (data ?? []) as unknown as DocumentRow[];

    return NextResponse.json(
      {
        success: true,
        documents: rows.map(serializeDocument),
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
    return handleRouteError(
      error,
      "Could not load documents."
    );
  }
}

export async function POST(request: NextRequest) {
  let uploadedStoragePath: string | null = null;

  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();
    const formData = await request.formData();

    const file = formData.get("file");
    const category = cleanText(
      formData.get("category")
    );

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "Choose a file to upload.",
        },
        { status: 400 }
      );
    }

    if (!category || !allowedCategories.has(category)) {
      return NextResponse.json(
        {
          success: false,
          error: "Choose a valid document category.",
        },
        { status: 400 }
      );
    }

    if (!allowedMimeTypes.has(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Only PDF, PNG, JPG and WEBP files are supported.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "The file exceeds the 20 MB limit.",
        },
        { status: 400 }
      );
    }

    const clientId = parseOptionalUuid(
      formData.get("clientId"),
      "Client ID"
    );

    const inquiryId = parseOptionalUuid(
      formData.get("inquiryId"),
      "Inquiry ID"
    );

    const proposalId = parseOptionalUuid(
      formData.get("proposalId"),
      "Proposal ID"
    );

    if (!clientId.success) {
      return NextResponse.json(
        {
          success: false,
          error: clientId.error,
        },
        { status: 400 }
      );
    }

    if (!inquiryId.success) {
      return NextResponse.json(
        {
          success: false,
          error: inquiryId.error,
        },
        { status: 400 }
      );
    }

    if (!proposalId.success) {
      return NextResponse.json(
        {
          success: false,
          error: proposalId.error,
        },
        { status: 400 }
      );
    }

    const storagePath = `${
      workspace.companyId
    }/${crypto.randomUUID()}-${sanitizeFileName(
      file.name
    )}`;

    uploadedStoragePath = storagePath;

    const buffer = Buffer.from(
      await file.arrayBuffer()
    );

    const { error: uploadError } =
      await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, buffer, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false,
        });

    if (uploadError) {
      throw new Error(
        `Could not upload file: ${uploadError.message}`
      );
    }

    const { data, error: insertError } =
      await supabase
        .from("documents")
        .insert({
          company_id: workspace.companyId,
          name: file.name,
          category,
          storage_path: storagePath,
          mime_type: file.type,
          file_size: file.size,
          version: 1,
          status: "active",
          client_id: clientId.value,
          inquiry_id: inquiryId.value,
          proposal_id: proposalId.value,
        })
        .select("*")
        .single();

    if (insertError || !data) {
      await supabase.storage
        .from(BUCKET_NAME)
        .remove([storagePath]);

      uploadedStoragePath = null;

      throw new Error(
        `Could not save document metadata: ${
          insertError?.message ?? "Unknown error."
        }`
      );
    }

    return NextResponse.json(
      {
        success: true,
        document: serializeDocument(
          data as unknown as DocumentRow
        ),
      },
      { status: 201 }
    );
  } catch (error) {
    if (uploadedStoragePath) {
      try {
        const supabase = await createClient();

        await supabase.storage
          .from(BUCKET_NAME)
          .remove([uploadedStoragePath]);
      } catch (cleanupError) {
        console.error(
          "Document cleanup failed:",
          cleanupError
        );
      }
    }

    return handleRouteError(
      error,
      "Could not upload document."
    );
  }
}

function serializeDocument(row: DocumentRow) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size) || 0,
    version: row.version,
    status: row.status,
    clientId: row.client_id,
    inquiryId: row.inquiry_id,
    proposalId: row.proposal_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseOptionalUuid(
  value: FormDataEntryValue | null,
  label: string
):
  | {
      success: true;
      value: string | null;
    }
  | {
      success: false;
      error: string;
    } {
  const cleaned = cleanText(value);

  if (!cleaned) {
    return {
      success: true,
      value: null,
    };
  }

  if (!isUuid(cleaned)) {
    return {
      success: false,
      error: `${label} must be a valid UUID. Leave it blank when the document is not linked to a record.`,
    };
  }

  return {
    success: true,
    value: cleaned,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function cleanText(
  value: FormDataEntryValue | null
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  return cleaned.length > 0 ? cleaned : null;
}

function sanitizeFileName(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);

  return cleaned || "document";
}

function handleRouteError(
  error: unknown,
  fallbackMessage: string
) {
  if (isAuthenticationRequiredError(error)) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: error.status }
    );
  }

  if (isWorkspaceAccessError(error)) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: error.status }
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : fallbackMessage;

  console.error("Documents API error:", error);

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 500 }
  );
}