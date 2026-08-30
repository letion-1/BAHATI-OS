import { NextRequest, NextResponse } from "next/server";

import {
  isAuthenticationRequiredError,
} from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

type SourceType =
  | "google_sheets"
  | "dropbox_excel"
  | "website"
  | "pdf";

type CreateDataSourceBody = {
  /** How this brokerage may work the yachts in the feed. Optional. */
  accessType?: string;
  name?: string;
  sourceType?: SourceType;
  sourceUrl?: string;
  syncFrequencyMinutes?: number;
};

/** Matches the constraint in migration 0016 and the enums in /api/yacht-access. */
const SOURCE_ACCESS_TYPES = [
  "controlled",
  "managed",
  "broker_access",
  "reference",
];

const ALLOWED_SOURCE_TYPES: SourceType[] = [
  "google_sheets",
  "dropbox_excel",
  "website",
  "pdf",
];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("data_sources")
      .select("*")
      .eq("company_id", workspace.companyId)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Failed to load data sources:",
        error
      );

      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      data: data ?? [],
    });
  } catch (error) {
    const accessResponse =
      createAccessErrorResponse(error);

    if (accessResponse) {
      return accessResponse;
    }

    console.error(
      "Unexpected GET data sources error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      (await request.json()) as CreateDataSourceBody;

    const name = body.name?.trim();
    const sourceType = body.sourceType;
    const sourceUrl =
      body.sourceUrl?.trim();

    /*
     * Optional on create, and deliberately not defaulted to something
     * convenient. An unclassified source imports its yachts as reference-only,
     * which is visible and correctable; a source guessed as broker_access
     * would silently make every hull in it sellable.
     */
    const accessType =
      typeof body.accessType === "string" &&
      SOURCE_ACCESS_TYPES.includes(body.accessType)
        ? body.accessType
        : null;

    const syncFrequencyMinutes =
      typeof body.syncFrequencyMinutes ===
      "number"
        ? body.syncFrequencyMinutes
        : 15;

    if (!name) {
      return NextResponse.json(
        {
          error:
            "Source name is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !sourceType ||
      !ALLOWED_SOURCE_TYPES.includes(
        sourceType
      )
    ) {
      return NextResponse.json(
        {
          error:
            "A valid source type is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (!sourceUrl) {
      return NextResponse.json(
        {
          error:
            "Source URL is required.",
        },
        {
          status: 400,
        }
      );
    }

    const validation =
      validateSourceUrl(
        sourceType,
        sourceUrl
      );

    if (!validation.valid) {
      return NextResponse.json(
        {
          error:
            validation.error ??
            "The source URL is invalid.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isInteger(
        syncFrequencyMinutes
      ) ||
      syncFrequencyMinutes < 5 ||
      syncFrequencyMinutes > 1440
    ) {
      return NextResponse.json(
        {
          error:
            "Sync frequency must be between 5 and 1,440 minutes.",
        },
        {
          status: 400,
        }
      );
    }

    const workspace =
      await getCurrentWorkspace();

    const supabase =
      await createClient();

    const externalReference =
      getExternalReference(
        sourceType,
        sourceUrl
      );

    const {
      data: existingSource,
      error: duplicateError,
    } = await supabase
      .from("data_sources")
      .select("id, name")
      .eq("company_id", workspace.companyId)
      .eq(
        "source_type",
        sourceType
      )
      .eq(
        "external_reference",
        externalReference
      )
      .maybeSingle();

    if (duplicateError) {
      console.error(
        "Failed to check duplicate source:",
        duplicateError
      );

      return NextResponse.json(
        {
          error:
            duplicateError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (existingSource) {
      return NextResponse.json(
        {
          error:
            `This source is already connected as "${existingSource.name}".`,
        },
        {
          status: 409,
        }
      );
    }

    const now =
      new Date().toISOString();

    const {
      data: source,
      error: insertError,
    } = await supabase
      .from("data_sources")
      .insert({
        company_id:
          workspace.companyId,

        name,

        source_type:
          sourceType,

        source_url:
          sourceUrl,

        access_type: accessType,

        external_reference:
          externalReference,

        status:
          "pending",

        sync_frequency_minutes:
          syncFrequencyMinutes,

        next_sync_at:
          now,

        is_active:
          true,

        configuration:
          buildConfiguration(
            sourceType,
            sourceUrl
          ),
      })
      .select("*")
      .single();

    if (insertError) {
      console.error(
        "Failed to create data source:",
        insertError
      );

      return NextResponse.json(
        {
          error:
            insertError.message,
        },
        {
          status: 500,
        }
      );
    }

    const {
      error: activityError,
    } = await supabase
      .from("activities")
      .insert({
        company_id:
          workspace.companyId,

        actor_user_id:
          workspace.userId,

        source_id:
          source.id,

        activity_type:
          "data_source_created",

        title:
          `${formatSourceType(sourceType)} source added`,

        description:
          `${name} was added and is waiting for its first sync.`,

        metadata: {
          source_type:
            sourceType,

          external_reference:
            externalReference,
        },
      });

    if (activityError) {
      console.error(
        "Failed to save source creation activity:",
        activityError
      );
    }

    return NextResponse.json(
      {
        data: source,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    const accessResponse =
      createAccessErrorResponse(error);

    if (accessResponse) {
      return accessResponse;
    }

    console.error(
      "Unexpected POST data source error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
      {
        status: 500,
      }
    );
  }
}

function createAccessErrorResponse(
  error: unknown
): NextResponse | null {
  if (
    isAuthenticationRequiredError(
      error
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        code: error.code,
        error: error.message,
      },
      {
        status: error.status,
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
        code: error.code,
        error: error.message,
      },
      {
        status: error.status,
      }
    );
  }

  return null;
}

function validateSourceUrl(
  sourceType: SourceType,
  sourceUrl: string
): {
  valid: boolean;
  error?: string;
} {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return {
      valid: false,
      error:
        "Please enter a valid URL.",
    };
  }

  if (
    !["http:", "https:"].includes(
      url.protocol
    )
  ) {
    return {
      valid: false,
      error:
        "The source must use HTTP or HTTPS.",
    };
  }

  if (
    sourceType ===
    "google_sheets"
  ) {
    const validGoogleSheet =
      url.hostname ===
        "docs.google.com" &&
      url.pathname.startsWith(
        "/spreadsheets/d/"
      );

    if (!validGoogleSheet) {
      return {
        valid: false,
        error:
          "Please enter a valid Google Sheets sharing URL.",
      };
    }
  }

  if (
    sourceType ===
    "dropbox_excel"
  ) {
    const validDropbox =
      url.hostname ===
        "dropbox.com" ||
      url.hostname.endsWith(
        ".dropbox.com"
      );

    if (!validDropbox) {
      return {
        valid: false,
        error:
          "Please enter a valid Dropbox sharing URL.",
      };
    }
  }

  return {
    valid: true,
  };
}

function getExternalReference(
  sourceType: SourceType,
  sourceUrl: string
): string {
  if (
    sourceType ===
    "google_sheets"
  ) {
    const match =
      sourceUrl.match(
        /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
      );

    return (
      match?.[1] ??
      sourceUrl
    );
  }

  return normalizeUrl(
    sourceUrl
  );
}

function normalizeUrl(
  value: string
): string {
  const url =
    new URL(value);

  url.hash = "";

  if (
    url.pathname !== "/"
  ) {
    url.pathname =
      url.pathname.replace(
        /\/+$/,
        ""
      );
  }

  return url.toString();
}

function buildConfiguration(
  sourceType: SourceType,
  sourceUrl: string
) {
  if (
    sourceType ===
    "google_sheets"
  ) {
    return {
      spreadsheet_id:
        getExternalReference(
          sourceType,
          sourceUrl
        ),

      access_mode:
        "public_link",

      import_format:
        "xlsx",
    };
  }

  if (
    sourceType ===
    "dropbox_excel"
  ) {
    return {
      access_mode:
        "shared_link",

      import_format:
        "xlsx",
    };
  }

  return {
    access_mode:
      "public_page",

    crawl_mode:
      "single_page",
  };
}

function formatSourceType(
  sourceType: SourceType
): string {
  const labels: Record<
    SourceType,
    string
  > = {
    google_sheets:
      "Google Sheets",

    dropbox_excel:
      "Dropbox Excel",

    website:
      "Website",

    pdf: "PDF",
  };

  return labels[sourceType];
}