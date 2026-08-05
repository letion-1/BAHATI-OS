import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required.",
        },
        { status: 401 }
      );
    }

    const { data: membership } =
      await supabase
        .from("company_members")
        .select(
          `
          company_id,
          role,
          created_at,
          companies (
            id,
            name
          )
        `
        )
        .eq("user_id", user.id)
        .maybeSingle();

    const metadata = isRecord(
      user.user_metadata
    )
      ? user.user_metadata
      : {};

    const company = normalizeCompany(
      membership?.companies
    );

    return NextResponse.json({
      success: true,
      account: {
        id: user.id,
        email: user.email ?? null,
        fullName:
          readMetadataString(
            metadata,
            "full_name"
          ) ??
          readMetadataString(
            metadata,
            "display_name"
          ) ??
          fallbackName(user.email),
        roleTitle:
          readMetadataString(
            metadata,
            "role_title"
          ) ??
          humanizeRole(
            membership?.role ?? null
          ),
        membershipRole:
          membership?.role ?? null,
        companyId:
          membership?.company_id ?? null,
        companyName:
          company?.name ?? null,
        memberSince:
          membership?.created_at ??
          user.created_at,
      },
    });
  } catch (error) {
    console.error(
      "Account API GET error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Could not load account.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest
) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required.",
        },
        { status: 401 }
      );
    }

    const body =
      (await request.json()) as JsonRecord;

    const fullName = readBodyString(
      body,
      "fullName"
    );

    const roleTitle = readBodyString(
      body,
      "roleTitle"
    );

    if (!fullName || fullName.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: "Enter your full name.",
        },
        { status: 400 }
      );
    }

    if (
      !roleTitle ||
      roleTitle.length < 2
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Enter your role.",
        },
        { status: 400 }
      );
    }

    const { error } =
      await supabase.auth.updateUser({
        data: {
          full_name: fullName,
          display_name: fullName,
          role_title: roleTitle,
        },
      });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      account: {
        fullName,
        roleTitle,
      },
    });
  } catch (error) {
    console.error(
      "Account API PATCH error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not update account.",
      },
      { status: 500 }
    );
  }
}

function normalizeCompany(
  value: unknown
): {
  id: string | null;
  name: string | null;
} | null {
  const candidate = Array.isArray(value)
    ? value[0]
    : value;

  if (!isRecord(candidate)) {
    return null;
  }

  return {
    id:
      typeof candidate.id === "string"
        ? candidate.id
        : null,
    name:
      typeof candidate.name === "string"
        ? candidate.name
        : null,
  };
}

function readMetadataString(
  metadata: JsonRecord,
  key: string
) {
  const value = metadata[key];

  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : null;
}

function readBodyString(
  body: JsonRecord,
  key: string
) {
  const value = body[key];

  return typeof value === "string"
    ? value.trim()
    : "";
}

function fallbackName(
  email?: string | null
) {
  if (!email) {
    return "Workspace member";
  }

  return (
    email
      .split("@")[0]
      ?.replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (letter) =>
        letter.toUpperCase()
      ) || "Workspace member"
  );
}

function humanizeRole(
  value: string | null
) {
  if (!value) {
    return "Workspace member";
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function isRecord(
  value: unknown
): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}