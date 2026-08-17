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
        legId: string;
      }>
    | {
        id: string;
        legId: string;
      };
};

const editableFields =
  new Set([
    "position",
    "charterDate",
    "fromName",
    "toName",
    "fromLat",
    "fromLon",
    "toLat",
    "toLon",
    "distanceNm",
    "departureTime",
    "arrivalTime",
    "cruisingSpeedKnots",
    "fuelBurnLph",
    "fuelPricePerLiter",
    "guestVisible",
    "notes",
  ]);

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const ids =
      await readIds(context);

    if (
      !ids.charterId ||
      !ids.legId
    ) {
      return badRequest(
        "Charter ID and leg ID are required."
      );
    }

    const workspace =
      await getCurrentWorkspace();
    const admin =
      createAdminClient();
    const body =
      await request.json();

    const supplied =
      Object.keys(body).filter(
        (key) =>
          editableFields.has(key)
      );

    if (
      supplied.length === 0
    ) {
      return badRequest(
        "No leg changes were supplied."
      );
    }

    const existingResult =
      await admin
        .from(
          "charter_itinerary_legs"
        )
        .select(
          "id, position, from_lat, from_lon, to_lat, to_lon, distance_nm, distance_source"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          ids.charterId
        )
        .eq(
          "id",
          ids.legId
        )
        .maybeSingle();

    if (
      existingResult.error
    ) {
      throw new Error(
        `Could not load itinerary leg: ${existingResult.error.message}`
      );
    }

    if (!existingResult.data) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Itinerary leg not found.",
        },
        { status: 404 }
      );
    }

    const patch:
      Record<string, unknown> = {
        updated_at:
          new Date().toISOString(),
      };

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "position"
      )
    ) {
      const position =
        Number(body.position);

      if (
        !Number.isInteger(
          position
        ) ||
        position <= 0
      ) {
        return badRequest(
          "Position must be a positive integer."
        );
      }

      patch.position =
        position;
    }

    for (const [
      camel,
      snake,
    ] of [
      [
        "fromName",
        "from_name",
      ],
      [
        "toName",
        "to_name",
      ],
    ] as const) {
      if (
        Object.prototype.hasOwnProperty.call(
          body,
          camel
        )
      ) {
        const value =
          cleanText(
            body[camel]
          );

        if (!value) {
          return badRequest(
            `${camel ===
            "fromName"
              ? "Origin"
              : "Destination"} cannot be blank.`
          );
        }

        patch[snake] =
          value;
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "charterDate"
      )
    ) {
      patch.charter_date =
        cleanDate(
          body.charterDate
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "departureTime"
      )
    ) {
      patch.departure_time =
        cleanTime(
          body.departureTime
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "arrivalTime"
      )
    ) {
      patch.arrival_time =
        cleanTime(
          body.arrivalTime
        );
    }

    const numericMappings =
      [
        [
          "fromLat",
          "from_lat",
        ],
        [
          "fromLon",
          "from_lon",
        ],
        [
          "toLat",
          "to_lat",
        ],
        [
          "toLon",
          "to_lon",
        ],
        [
          "cruisingSpeedKnots",
          "cruising_speed_knots",
        ],
        [
          "fuelBurnLph",
          "fuel_burn_lph",
        ],
        [
          "fuelPricePerLiter",
          "fuel_price_per_liter",
        ],
      ] as const;

    for (const [
      camel,
      snake,
    ] of numericMappings) {
      if (
        Object.prototype.hasOwnProperty.call(
          body,
          camel
        )
      ) {
        const value =
          nullableNumber(
            body[camel]
          );

        if (
          value ===
          "invalid"
        ) {
          return badRequest(
            `${camel} must be a valid number.`
          );
        }

        patch[snake] =
          value;
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "distanceNm"
      )
    ) {
      const distance =
        nullableNumber(
          body.distanceNm
        );

      if (
        distance ===
          "invalid" ||
        (typeof distance ===
          "number" &&
          distance < 0)
      ) {
        return badRequest(
          "Distance must be a non-negative number."
        );
      }

      patch.distance_nm =
        distance;
      patch.distance_source =
        "manual";
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "guestVisible"
      )
    ) {
      patch.guest_visible =
        body.guestVisible ===
        true;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "notes"
      )
    ) {
      patch.notes =
        cleanText(body.notes);
    }

    const merged = {
      fromLat:
        valueFromPatch(
          patch,
          "from_lat",
          existingResult.data
            .from_lat
        ),
      fromLon:
        valueFromPatch(
          patch,
          "from_lon",
          existingResult.data
            .from_lon
        ),
      toLat:
        valueFromPatch(
          patch,
          "to_lat",
          existingResult.data
            .to_lat
        ),
      toLon:
        valueFromPatch(
          patch,
          "to_lon",
          existingResult.data
            .to_lon
        ),
    };

    if (
      hasAllCoordinates(
        merged
      )
    ) {
      patch.distance_nm =
        round(
          haversineNm(
            merged.fromLat!,
            merged.fromLon!,
            merged.toLat!,
            merged.toLon!
          ),
          3
        );
      patch.distance_source =
        "coordinates";
    }

    const update =
      await admin
        .from(
          "charter_itinerary_legs"
        )
        .update(patch)
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          ids.charterId
        )
        .eq(
          "id",
          ids.legId
        )
        .select("*")
        .single();

    if (
      update.error ||
      !update.data
    ) {
      throw new Error(
        `Could not update itinerary leg: ${
          update.error
            ?.message ??
          "Unknown error."
        }`
      );
    }

    return NextResponse.json(
      {
        success: true,
        updated: true,
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
      "Could not update itinerary leg."
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const ids =
      await readIds(context);

    if (
      !ids.charterId ||
      !ids.legId
    ) {
      return badRequest(
        "Charter ID and leg ID are required."
      );
    }

    const workspace =
      await getCurrentWorkspace();
    const admin =
      createAdminClient();

    const result =
      await admin
        .from(
          "charter_itinerary_legs"
        )
        .delete()
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          ids.charterId
        )
        .eq(
          "id",
          ids.legId
        )
        .select("id")
        .maybeSingle();

    if (result.error) {
      throw new Error(
        `Could not delete itinerary leg: ${result.error.message}`
      );
    }

    if (!result.data) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Itinerary leg not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        deleted: true,
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
      "Could not delete itinerary leg."
    );
  }
}

function valueFromPatch(
  patch: Record<
    string,
    unknown
  >,
  key: string,
  fallback: unknown
) {
  const source =
    Object.prototype.hasOwnProperty.call(
      patch,
      key
    )
      ? patch[key]
      : fallback;

  return finiteNumber(
    source
  );
}

function finiteNumber(
  value: unknown
) {
  if (
    typeof value ===
      "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value ===
      "string" &&
    value.trim()
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

function nullableNumber(
  value: unknown
):
  | number
  | null
  | "invalid" {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : "invalid";
}

function hasAllCoordinates(
  value: {
    fromLat: number | null;
    fromLon: number | null;
    toLat: number | null;
    toLon: number | null;
  }
) {
  return (
    value.fromLat !==
      null &&
    value.fromLon !==
      null &&
    value.toLat !==
      null &&
    value.toLon !==
      null
  );
}

function haversineNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const radiusNm =
    3440.065;

  const rad =
    (degrees: number) =>
      (degrees *
        Math.PI) /
      180;

  const p1 =
    rad(lat1);
  const p2 =
    rad(lat2);
  const dp =
    rad(lat2 - lat1);
  const dl =
    rad(lon2 - lon1);

  const a =
    Math.sin(dp / 2) **
      2 +
    Math.cos(p1) *
      Math.cos(p2) *
      Math.sin(dl / 2) **
        2;

  return (
    radiusNm *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

function cleanText(
  value: unknown
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned
    ? cleaned
    : null;
}

function cleanDate(
  value: unknown
) {
  const text =
    cleanText(value);

  return text &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
    ? text
    : null;
}

function cleanTime(
  value: unknown
) {
  const text =
    cleanText(value);

  return text &&
    /^\d{2}:\d{2}(:\d{2})?$/.test(
      text
    )
    ? text
    : null;
}

function round(
  value: number,
  digits: number
) {
  const factor =
    10 ** digits;

  return (
    Math.round(
      value * factor
    ) / factor
  );
}

async function readIds(
  context: RouteContext
) {
  const params =
    await Promise.resolve(
      context.params
    );

  return {
    charterId:
      params.id?.trim() ||
      null,
    legId:
      params.legId?.trim() ||
      null,
  };
}

function badRequest(
  message: string
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 400 }
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
    "Itinerary leg API error:",
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