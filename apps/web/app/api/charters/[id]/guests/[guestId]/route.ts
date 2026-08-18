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
        guestId: string;
      }>
    | {
        id: string;
        guestId: string;
      };
};

const guestRoles = new Set([
  "primary_charterer",
  "guest",
  "child",
  "staff",
  "other",
]);

const passportStatuses = new Set([
  "not_requested",
  "requested",
  "received",
  "verified",
  "expired",
  "not_required",
]);

type GuestRow = {
  id: string;
  company_id: string;
  charter_id: string;

  full_name: string;
  guest_role: string;
  is_primary: boolean;

  email: string | null;
  phone: string | null;

  nationality: string | null;
  date_of_birth: string | null;

  passport_status: string;
  passport_country: string | null;
  passport_expiry: string | null;

  dietary_requirements: string | null;
  allergies: string | null;
  accessibility_notes: string | null;

  arrival_airport: string | null;
  arrival_flight: string | null;
  arrival_at: string | null;
  arrival_transfer_notes: string | null;

  departure_airport: string | null;
  departure_flight: string | null;
  departure_at: string | null;
  departure_transfer_notes: string | null;

  cabin_preference: string | null;
  bed_preference: string | null;

  notes: string | null;

  profile_status: string;
  sort_order: number;

  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const identifiers =
      await readIdentifiers(context);

    if (!identifiers) {
      return badRequest(
        "A charter ID and guest ID are required."
      );
    }

    const {
      charterId,
      guestId,
    } = identifiers;

    const workspace =
      await getCurrentWorkspace();

    const admin =
      createAdminClient();

    const existing =
      await loadGuest(
        admin,
        workspace.companyId,
        charterId,
        guestId
      );

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Charter guest not found.",
        },
        {
          status: 404,
        }
      );
    }

    let body:
      Record<string, unknown>;

    try {
      body =
        (await request.json()) as Record<
          string,
          unknown
        >;
    } catch {
      return badRequest(
        "The request body must be valid JSON."
      );
    }

    const patch:
      Record<string, unknown> = {};

    if (
      hasOwn(
        body,
        "fullName"
      )
    ) {
      const fullName =
        cleanText(
          body.fullName
        );

      if (!fullName) {
        return badRequest(
          "Guest name is required."
        );
      }

      patch.full_name =
        fullName;
    }

    if (
      hasOwn(
        body,
        "guestRole"
      )
    ) {
      const guestRole =
        cleanText(
          body.guestRole
        );

      if (
        !guestRole ||
        !guestRoles.has(
          guestRole
        )
      ) {
        return badRequest(
          "Choose a valid guest role."
        );
      }

      patch.guest_role =
        guestRole;
    }

    if (
      hasOwn(
        body,
        "isPrimary"
      )
    ) {
      if (
        typeof body.isPrimary !==
        "boolean"
      ) {
        return badRequest(
          "Primary guest must be true or false."
        );
      }

      patch.is_primary =
        body.isPrimary;
    }

    assignNullableText(
      patch,
      body,
      "email",
      "email"
    );

    assignNullableText(
      patch,
      body,
      "phone",
      "phone"
    );

    assignNullableText(
      patch,
      body,
      "nationality",
      "nationality"
    );

    assignNullableText(
      patch,
      body,
      "passportCountry",
      "passport_country"
    );

    assignNullableText(
      patch,
      body,
      "dietaryRequirements",
      "dietary_requirements"
    );

    assignNullableText(
      patch,
      body,
      "allergies",
      "allergies"
    );

    assignNullableText(
      patch,
      body,
      "accessibilityNotes",
      "accessibility_notes"
    );

    assignNullableText(
      patch,
      body,
      "arrivalAirport",
      "arrival_airport"
    );

    assignNullableText(
      patch,
      body,
      "arrivalFlight",
      "arrival_flight"
    );

    assignNullableText(
      patch,
      body,
      "arrivalTransferNotes",
      "arrival_transfer_notes"
    );

    assignNullableText(
      patch,
      body,
      "departureAirport",
      "departure_airport"
    );

    assignNullableText(
      patch,
      body,
      "departureFlight",
      "departure_flight"
    );

    assignNullableText(
      patch,
      body,
      "departureTransferNotes",
      "departure_transfer_notes"
    );

    assignNullableText(
      patch,
      body,
      "cabinPreference",
      "cabin_preference"
    );

    assignNullableText(
      patch,
      body,
      "bedPreference",
      "bed_preference"
    );

    assignNullableText(
      patch,
      body,
      "notes",
      "notes"
    );

    if (
      hasOwn(
        body,
        "dateOfBirth"
      )
    ) {
      const value =
        readNullableDate(
          body.dateOfBirth
        );

      if (
        body.dateOfBirth !==
          null &&
        body.dateOfBirth !==
          "" &&
        value === null
      ) {
        return badRequest(
          "Date of birth must use YYYY-MM-DD."
        );
      }

      patch.date_of_birth =
        value;
    }

    if (
      hasOwn(
        body,
        "passportExpiry"
      )
    ) {
      const value =
        readNullableDate(
          body.passportExpiry
        );

      if (
        body.passportExpiry !==
          null &&
        body.passportExpiry !==
          "" &&
        value === null
      ) {
        return badRequest(
          "Passport expiry must use YYYY-MM-DD."
        );
      }

      patch.passport_expiry =
        value;
    }

    if (
      hasOwn(
        body,
        "passportStatus"
      )
    ) {
      const passportStatus =
        cleanText(
          body.passportStatus
        );

      if (
        !passportStatus ||
        !passportStatuses.has(
          passportStatus
        )
      ) {
        return badRequest(
          "Choose a valid passport status."
        );
      }

      patch.passport_status =
        passportStatus;
    }

    if (
      hasOwn(
        body,
        "arrivalAt"
      )
    ) {
      const value =
        readNullableDateTime(
          body.arrivalAt
        );

      if (
        body.arrivalAt !==
          null &&
        body.arrivalAt !==
          "" &&
        value === null
      ) {
        return badRequest(
          "Arrival time must be a valid date and time."
        );
      }

      patch.arrival_at =
        value;
    }

    if (
      hasOwn(
        body,
        "departureAt"
      )
    ) {
      const value =
        readNullableDateTime(
          body.departureAt
        );

      if (
        body.departureAt !==
          null &&
        body.departureAt !==
          "" &&
        value === null
      ) {
        return badRequest(
          "Departure time must be a valid date and time."
        );
      }

      patch.departure_at =
        value;
    }

    if (
      hasOwn(
        body,
        "sortOrder"
      )
    ) {
      const value =
        readNonNegativeInteger(
          body.sortOrder
        );

      if (
        value === null
      ) {
        return badRequest(
          "Sort order must be a non-negative whole number."
        );
      }

      patch.sort_order =
        value;
    }

    if (
      Object.keys(patch)
        .length === 0
    ) {
      return badRequest(
        "No guest changes were supplied."
      );
    }

    if (
      patch.is_primary ===
      true
    ) {
      const clearPrimary =
        await admin
          .from(
            "charter_guests"
          )
          .update({
            is_primary:
              false,

            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            "company_id",
            workspace.companyId
          )
          .eq(
            "charter_id",
            charterId
          )
          .eq(
            "is_primary",
            true
          )
          .neq(
            "id",
            guestId
          );

      if (
        clearPrimary.error
      ) {
        throw new Error(
          `Could not update primary guest: ${clearPrimary.error.message}`
        );
      }
    }

    const merged =
      mergeGuest(
        existing,
        patch
      );

    patch.profile_status =
      inferProfileStatus({
        fullName:
          merged.full_name,

        nationality:
          merged.nationality,

        dateOfBirth:
          merged.date_of_birth,

        passportStatus:
          merged.passport_status,

        arrivalAt:
          merged.arrival_at,

        departureAt:
          merged.departure_at,

        dietaryRequirements:
          merged.dietary_requirements,

        allergies:
          merged.allergies,

        cabinPreference:
          merged.cabin_preference,
      });

    patch.updated_at =
      new Date()
        .toISOString();

    const result =
      await admin
        .from(
          "charter_guests"
        )
        .update(patch)
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          charterId
        )
        .eq(
          "id",
          guestId
        )
        .select(
          guestSelect()
        )
        .single();

    if (
      result.error ||
      !result.data
    ) {
      throw new Error(
        `Could not update charter guest: ${
          result.error?.message ??
          "Unknown error."
        }`
      );
    }

    return NextResponse.json(
      {
        success: true,

        guest:
          serializeGuest(
            result.data as unknown as GuestRow
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
      "Could not update charter guest."
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const identifiers =
      await readIdentifiers(
        context
      );

    if (!identifiers) {
      return badRequest(
        "A charter ID and guest ID are required."
      );
    }

    const {
      charterId,
      guestId,
    } = identifiers;

    const workspace =
      await getCurrentWorkspace();

    const admin =
      createAdminClient();

    const existing =
      await loadGuest(
        admin,
        workspace.companyId,
        charterId,
        guestId
      );

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Charter guest not found.",
        },
        {
          status: 404,
        }
      );
    }

    const result =
      await admin
        .from(
          "charter_guests"
        )
        .delete()
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          charterId
        )
        .eq(
          "id",
          guestId
        );

    if (result.error) {
      throw new Error(
        `Could not delete charter guest: ${result.error.message}`
      );
    }

    return NextResponse.json(
      {
        success: true,
        deleted: true,
        guestId,
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
      "Could not delete charter guest."
    );
  }
}

async function loadGuest(
  admin: ReturnType<
    typeof createAdminClient
  >,
  companyId: string,
  charterId: string,
  guestId: string
): Promise<GuestRow | null> {
  const result =
    await admin
      .from(
        "charter_guests"
      )
      .select(
        guestSelect()
      )
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "charter_id",
        charterId
      )
      .eq(
        "id",
        guestId
      )
      .maybeSingle();

  if (result.error) {
    throw new Error(
      `Could not load charter guest: ${result.error.message}`
    );
  }

  return result.data
    ? (
        result.data as unknown as GuestRow
      )
    : null;
}

function guestSelect() {
  return [
    "id",
    "company_id",
    "charter_id",
    "full_name",
    "guest_role",
    "is_primary",
    "email",
    "phone",
    "nationality",
    "date_of_birth",
    "passport_status",
    "passport_country",
    "passport_expiry",
    "dietary_requirements",
    "allergies",
    "accessibility_notes",
    "arrival_airport",
    "arrival_flight",
    "arrival_at",
    "arrival_transfer_notes",
    "departure_airport",
    "departure_flight",
    "departure_at",
    "departure_transfer_notes",
    "cabin_preference",
    "bed_preference",
    "notes",
    "profile_status",
    "sort_order",
    "created_by",
    "created_at",
    "updated_at",
  ].join(",");
}

function mergeGuest(
  existing: GuestRow,
  patch:
    Record<string, unknown>
): GuestRow {
  return {
    ...existing,
    ...patch,
  } as GuestRow;
}

function serializeGuest(
  row: GuestRow
) {
  const guest = {
    id:
      row.id,

    charterId:
      row.charter_id,

    fullName:
      row.full_name,

    guestRole:
      row.guest_role,

    isPrimary:
      row.is_primary,

    email:
      row.email,

    phone:
      row.phone,

    nationality:
      row.nationality,

    dateOfBirth:
      row.date_of_birth,

    passportStatus:
      row.passport_status,

    passportCountry:
      row.passport_country,

    passportExpiry:
      row.passport_expiry,

    dietaryRequirements:
      row.dietary_requirements,

    allergies:
      row.allergies,

    accessibilityNotes:
      row.accessibility_notes,

    arrivalAirport:
      row.arrival_airport,

    arrivalFlight:
      row.arrival_flight,

    arrivalAt:
      row.arrival_at,

    arrivalTransferNotes:
      row.arrival_transfer_notes,

    departureAirport:
      row.departure_airport,

    departureFlight:
      row.departure_flight,

    departureAt:
      row.departure_at,

    departureTransferNotes:
      row.departure_transfer_notes,

    cabinPreference:
      row.cabin_preference,

    bedPreference:
      row.bed_preference,

    notes:
      row.notes,

    profileStatus:
      row.profile_status,

    sortOrder:
      row.sort_order,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };

  return {
    ...guest,

    completenessPercent:
      calculateCompleteness(
        guest
      ),
  };
}

function calculateCompleteness(
  guest: {
    fullName: string;

    nationality:
      string | null;

    dateOfBirth:
      string | null;

    passportStatus:
      string;

    arrivalAt:
      string | null;

    departureAt:
      string | null;

    dietaryRequirements:
      string | null;

    allergies:
      string | null;

    cabinPreference:
      string | null;
  }
) {
  const checks = [
    Boolean(
      guest.fullName
    ),

    Boolean(
      guest.nationality
    ),

    Boolean(
      guest.dateOfBirth
    ),

    [
      "received",
      "verified",
      "not_required",
    ].includes(
      guest.passportStatus
    ),

    Boolean(
      guest.arrivalAt
    ),

    Boolean(
      guest.departureAt
    ),

    Boolean(
      guest.dietaryRequirements ||
        guest.allergies
    ),

    Boolean(
      guest.cabinPreference
    ),
  ];

  const complete =
    checks.filter(
      Boolean
    ).length;

  return Math.round(
    (
      complete /
      checks.length
    ) * 100
  );
}

function inferProfileStatus({
  fullName,
  nationality,
  dateOfBirth,
  passportStatus,
  arrivalAt,
  departureAt,
  dietaryRequirements,
  allergies,
  cabinPreference,
}: {
  fullName: string;

  nationality:
    string | null;

  dateOfBirth:
    string | null;

  passportStatus:
    string;

  arrivalAt:
    string | null;

  departureAt:
    string | null;

  dietaryRequirements:
    string | null;

  allergies:
    string | null;

  cabinPreference:
    string | null;
}) {
  const completeness =
    calculateCompleteness({
      fullName,
      nationality,
      dateOfBirth,
      passportStatus,
      arrivalAt,
      departureAt,
      dietaryRequirements,
      allergies,
      cabinPreference,
    });

  if (
    completeness >= 85
  ) {
    return "complete";
  }

  if (
    completeness >= 25
  ) {
    return "in_progress";
  }

  return "incomplete";
}

async function readIdentifiers(
  context: RouteContext
) {
  const params =
    await Promise.resolve(
      context.params
    );

  const charterId =
    params.id?.trim();

  const guestId =
    params.guestId?.trim();

  if (
    !charterId ||
    !guestId
  ) {
    return null;
  }

  return {
    charterId,
    guestId,
  };
}

function assignNullableText(
  target:
    Record<string, unknown>,

  body:
    Record<string, unknown>,

  bodyKey:
    string,

  dbKey:
    string
) {
  if (
    !hasOwn(
      body,
      bodyKey
    )
  ) {
    return;
  }

  target[dbKey] =
    cleanText(
      body[bodyKey]
    );
}

function hasOwn(
  target:
    Record<string, unknown>,

  key:
    string
) {
  return Object.prototype
    .hasOwnProperty.call(
      target,
      key
    );
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

function readNullableDate(
  value: unknown
): string | null {
  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      cleaned
    )
  ) {
    return null;
  }

  const date =
    new Date(
      `${cleaned}T12:00:00Z`
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : cleaned;
}

function readNullableDateTime(
  value: unknown
): string | null {
  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  if (!cleaned) {
    return null;
  }

  const date =
    new Date(
      cleaned
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date.toISOString();
}

function readNonNegativeInteger(
  value: unknown
): number | null {
  if (
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    typeof value ===
      "number"
      ? value
      : typeof value ===
          "string"
        ? Number(
            value.trim()
          )
        : Number.NaN;

  return Number.isInteger(
    parsed
  ) &&
    parsed >= 0
    ? parsed
    : null;
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
        error:
          error.message,
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
        error:
          error.message,
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
    "Charter Guest API error:",
    error
  );

  return NextResponse.json(
    {
      success: false,
      error:
        message,
    },
    {
      status: 500,
    }
  );
}