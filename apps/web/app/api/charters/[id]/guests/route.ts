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

type CharterRow = {
  id: string;
  reference: string;
  client_name: string;
  yacht_name: string;
  guests: number | null;
};

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

export async function GET(
  _request: NextRequest,
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

    const admin =
      createAdminClient();

    const charter =
      await loadCharter(
        admin,
        workspace.companyId,
        charterId
      );

    if (!charter) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Charter not found.",
        },
        {
          status: 404,
        }
      );
    }

    const guestResult =
      await admin
        .from("charter_guests")
        .select(guestSelect())
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          charterId
        )
        .order(
          "is_primary",
          {
            ascending: false,
          }
        )
        .order(
          "sort_order",
          {
            ascending: true,
          }
        )
        .order(
          "created_at",
          {
            ascending: true,
          }
        );

    if (guestResult.error) {
      throw new Error(
        `Could not load charter guests: ${guestResult.error.message}`
      );
    }

    const guests =
      (
        guestResult.data ??
        []
      ).map((row) =>
        serializeGuest(
          row as unknown as GuestRow
        )
      );

    return NextResponse.json(
      {
        success: true,

        charter: {
          id: charter.id,
          reference:
            charter.reference,
          clientName:
            charter.client_name,
          yachtName:
            charter.yacht_name,
          expectedGuests:
            charter.guests,
        },

        summary:
          buildGuestSummary(
            charter.guests,
            guests
          ),

        guests,
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
      "Could not load charter guests."
    );
  }
}

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

    const admin =
      createAdminClient();

    const charter =
      await loadCharter(
        admin,
        workspace.companyId,
        charterId
      );

    if (!charter) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Charter not found.",
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

    const fullName =
      cleanText(
        body.fullName
      );

    if (!fullName) {
      return badRequest(
        "Guest name is required."
      );
    }

    const guestRole =
      cleanText(
        body.guestRole
      ) ?? "guest";

    if (
      !guestRoles.has(
        guestRole
      )
    ) {
      return badRequest(
        "Choose a valid guest role."
      );
    }

    const passportStatus =
      cleanText(
        body.passportStatus
      ) ?? "not_requested";

    if (
      !passportStatuses.has(
        passportStatus
      )
    ) {
      return badRequest(
        "Choose a valid passport status."
      );
    }

    const dateOfBirth =
      readNullableDate(
        body.dateOfBirth
      );

    if (
      body.dateOfBirth !== undefined &&
      body.dateOfBirth !== null &&
      body.dateOfBirth !== "" &&
      dateOfBirth === null
    ) {
      return badRequest(
        "Date of birth must use YYYY-MM-DD."
      );
    }

    const passportExpiry =
      readNullableDate(
        body.passportExpiry
      );

    if (
      body.passportExpiry !== undefined &&
      body.passportExpiry !== null &&
      body.passportExpiry !== "" &&
      passportExpiry === null
    ) {
      return badRequest(
        "Passport expiry must use YYYY-MM-DD."
      );
    }

    const arrivalAt =
      readNullableDateTime(
        body.arrivalAt
      );

    if (
      body.arrivalAt !== undefined &&
      body.arrivalAt !== null &&
      body.arrivalAt !== "" &&
      arrivalAt === null
    ) {
      return badRequest(
        "Arrival time must be a valid date and time."
      );
    }

    const departureAt =
      readNullableDateTime(
        body.departureAt
      );

    if (
      body.departureAt !== undefined &&
      body.departureAt !== null &&
      body.departureAt !== "" &&
      departureAt === null
    ) {
      return badRequest(
        "Departure time must be a valid date and time."
      );
    }

    const isPrimary =
      body.isPrimary === true;

    const sortOrder =
      readNonNegativeInteger(
        body.sortOrder
      );

    if (
      body.sortOrder !== undefined &&
      body.sortOrder !== null &&
      body.sortOrder !== "" &&
      sortOrder === null
    ) {
      return badRequest(
        "Sort order must be a non-negative whole number."
      );
    }

    if (isPrimary) {
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
          );

      if (
        clearPrimary.error
      ) {
        throw new Error(
          `Could not update primary guest: ${clearPrimary.error.message}`
        );
      }
    }

    const nationality =
      cleanText(
        body.nationality
      );

    const dietaryRequirements =
      cleanText(
        body.dietaryRequirements
      );

    const allergies =
      cleanText(
        body.allergies
      );

    const cabinPreference =
      cleanText(
        body.cabinPreference
      );

    const profileStatus =
      inferProfileStatus({
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

    const now =
      new Date()
        .toISOString();

    const result =
      await admin
        .from(
          "charter_guests"
        )
        .insert({
          company_id:
            workspace.companyId,

          charter_id:
            charterId,

          full_name:
            fullName,

          guest_role:
            guestRole,

          is_primary:
            isPrimary,

          email:
            cleanText(
              body.email
            ),

          phone:
            cleanText(
              body.phone
            ),

          nationality,

          date_of_birth:
            dateOfBirth,

          passport_status:
            passportStatus,

          passport_country:
            cleanText(
              body.passportCountry
            ),

          passport_expiry:
            passportExpiry,

          dietary_requirements:
            dietaryRequirements,

          allergies,

          accessibility_notes:
            cleanText(
              body.accessibilityNotes
            ),

          arrival_airport:
            cleanText(
              body.arrivalAirport
            ),

          arrival_flight:
            cleanText(
              body.arrivalFlight
            ),

          arrival_at:
            arrivalAt,

          arrival_transfer_notes:
            cleanText(
              body.arrivalTransferNotes
            ),

          departure_airport:
            cleanText(
              body.departureAirport
            ),

          departure_flight:
            cleanText(
              body.departureFlight
            ),

          departure_at:
            departureAt,

          departure_transfer_notes:
            cleanText(
              body.departureTransferNotes
            ),

          cabin_preference:
            cabinPreference,

          bed_preference:
            cleanText(
              body.bedPreference
            ),

          notes:
            cleanText(
              body.notes
            ),

          profile_status:
            profileStatus,

          sort_order:
            sortOrder ?? 0,

          created_by:
            workspace.userId,

          created_at:
            now,

          updated_at:
            now,
        })
        .select(
          guestSelect()
        )
        .single();

    if (
      result.error ||
      !result.data
    ) {
      throw new Error(
        `Could not add charter guest: ${
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
        status: 201,
        headers:
          noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not add charter guest."
    );
  }
}

async function loadCharter(
  admin: ReturnType<
    typeof createAdminClient
  >,
  companyId: string,
  charterId: string
): Promise<CharterRow | null> {
  const result =
    await admin
      .from("charters")
      .select(
        [
          "id",
          "reference",
          "client_name",
          "yacht_name",
          "guests",
        ].join(",")
      )
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "id",
        charterId
      )
      .maybeSingle();

  if (result.error) {
    throw new Error(
      `Could not load charter: ${result.error.message}`
    );
  }

  return result.data
    ? (
        result.data as unknown as CharterRow
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

function serializeGuest(
  row: GuestRow
) {
  const guest = {
    id: row.id,

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

function buildGuestSummary(
  expectedGuests:
    number | null,
  guests: Array<
    ReturnType<
      typeof serializeGuest
    >
  >
) {
  const actualGuests =
    guests.length;

  const completeGuests =
    guests.filter(
      (guest) =>
        guest.profileStatus ===
        "complete"
    ).length;

  const inProgressGuests =
    guests.filter(
      (guest) =>
        guest.profileStatus ===
        "in_progress"
    ).length;

  const incompleteGuests =
    guests.filter(
      (guest) =>
        guest.profileStatus ===
        "incomplete"
    ).length;

  const averageCompleteness =
    actualGuests === 0
      ? 0
      : Math.round(
          guests.reduce(
            (
              total,
              guest
            ) =>
              total +
              guest.completenessPercent,
            0
          ) /
            actualGuests
        );

  const manifestReady =
    expectedGuests !== null &&
    expectedGuests > 0 &&
    actualGuests ===
      expectedGuests &&
    completeGuests ===
      actualGuests;

  return {
    expectedGuests,
    actualGuests,

    remainingProfiles:
      expectedGuests === null
        ? null
        : Math.max(
            expectedGuests -
              actualGuests,
            0
          ),

    completeGuests,
    inProgressGuests,
    incompleteGuests,
    averageCompleteness,
    manifestReady,
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

async function readCharterId(
  context: RouteContext
) {
  const params =
    await Promise.resolve(
      context.params
    );

  return (
    params.id?.trim() ||
    null
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

  const date =
    new Date(
      value.trim()
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
    value === undefined ||
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
    "Charter Guests API error:",
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