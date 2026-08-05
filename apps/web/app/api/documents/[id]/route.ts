import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET_NAME = "documents";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type DocumentRow = {
  id: string;
  storage_path: string;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();
    const body = (await request.json()) as {
      name?: unknown;
    };

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: "Document name is required.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("documents")
      .update({
        name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", workspace.companyId)
      .select("id, name")
      .single();

    if (error || !data) {
      throw new Error(
        `Could not rename document: ${
          error?.message ?? "Document not found."
        }`
      );
    }

    return NextResponse.json(
      {
        success: true,
        document: data,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not rename document."
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const { data, error: loadError } = await supabase
      .from("documents")
      .select("id, storage_path")
      .eq("id", id)
      .eq("company_id", workspace.companyId)
      .single();

    if (loadError || !data) {
      throw new Error(
        `Could not load document: ${
          loadError?.message ?? "Document not found."
        }`
      );
    }

    const document = data as unknown as DocumentRow;

    const { error: storageError } =
      await supabase.storage
        .from(BUCKET_NAME)
        .remove([document.storage_path]);

    if (storageError) {
      throw new Error(
        `Could not delete stored file: ${storageError.message}`
      );
    }

    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("id", id)
      .eq("company_id", workspace.companyId);

    if (deleteError) {
      throw new Error(
        `Could not delete document record: ${deleteError.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not delete document."
    );
  }
}

function handleRouteError(
  error: unknown,
  fallbackMessage: string
) {
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

  console.error("Document API error:", error);

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 500 }
  );
}