import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET_NAME = "documents";
const SIGNED_URL_TTL_SECONDS = 60 * 15;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type DocumentRow = {
  storage_path: string;
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("documents")
      .select("storage_path")
      .eq("id", id)
      .eq("company_id", workspace.companyId)
      .single();

    if (error || !data) {
      throw new Error(
        `Could not load document: ${
          error?.message ?? "Document not found."
        }`
      );
    }

    const document = data as unknown as DocumentRow;

    const {
      data: signedUrlData,
      error: signedUrlError,
    } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(
        document.storage_path,
        SIGNED_URL_TTL_SECONDS
      );

    if (
      signedUrlError ||
      !signedUrlData?.signedUrl
    ) {
      throw new Error(
        `Could not create document link: ${
          signedUrlError?.message ?? "Unknown error."
        }`
      );
    }

    return NextResponse.json(
      {
        success: true,
        url: signedUrlData.signedUrl,
      },
      { status: 200 }
    );
  } catch (error) {
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
        : "Could not open document.";

    console.error(
      "Document download route error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}