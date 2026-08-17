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
    | Promise<{ id: string }>
    | { id: string };
};

type CharterRow = {
  id: string;
  fleet_id: string | null;
  reference: string;
  client_name: string;
  yacht_name: string;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  embarkation_port: string | null;
  disembarkation_port: string | null;
  guests: number | null;
  currency: string;
  contract_status: string;
  charter_status: string;
};

type ItineraryRow = {
  id: string;
  company_id: string;
  charter_id: string;
  title: string;
  status: string;
  cruising_speed_knots: number | string | null;
  fuel_burn_lph: number | string | null;
  fuel_price_per_liter: number | string | null;
  fuel_currency: string;
  contingency_percent: number | string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type LegRow = {
  id: string;
  itinerary_id: string;
  charter_id: string;
  position: number;
  charter_date: string | null;
  from_name: string;
  to_name: string;
  from_lat: number | string | null;
  from_lon: number | string | null;
  to_lat: number | string | null;
  to_lon: number | string | null;
  distance_nm: number | string | null;
  distance_source: string;
  departure_time: string | null;
  arrival_time: string | null;
  cruising_speed_knots: number | string | null;
  fuel_burn_lph: number | string | null;
  fuel_price_per_liter: number | string | null;
  guest_visible: boolean;
  notes: string | null;
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
          error: "Charter not found.",
        },
        { status: 404 }
      );
    }

    const itineraryResult =
      await admin
        .from("charter_itineraries")
        .select(itinerarySelect())
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "charter_id",
          charterId
        )
        .maybeSingle();

    if (itineraryResult.error) {
      throw new Error(
        `Could not load itinerary: ${itineraryResult.error.message}`
      );
    }

    const itinerary =
      (itineraryResult.data ??
        null) as ItineraryRow | null;

    if (!itinerary) {
      return NextResponse.json(
        {
          success: true,
          charter:
            serializeCharter(charter),
          itinerary: null,
          legs: [],
          totals:
            emptyTotals(),
        },
        {
          status: 200,
          headers:
            noStoreHeaders(),
        }
      );
    }

    const legsResult =
      await admin
        .from(
          "charter_itinerary_legs"
        )
        .select(legSelect())
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "itinerary_id",
          itinerary.id
        )
        .order("position", {
          ascending: true,
        })
        .order("created_at", {
          ascending: true,
        });

    if (legsResult.error) {
      throw new Error(
        `Could not load itinerary legs: ${legsResult.error.message}`
      );
    }

    const legs =
      (legsResult.data ??
        []) as unknown as LegRow[];

    return NextResponse.json(
      {
        success: true,
        charter:
          serializeCharter(charter),
        itinerary:
          serializeItinerary(
            itinerary
          ),
        legs:
          legs.map((leg) =>
            serializeLeg(
              leg,
              itinerary
            )
          ),
        totals:
          calculateTotals(
            legs,
            itinerary
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
      "Could not load itinerary."
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
          error: "Charter not found.",
        },
        { status: 404 }
      );
    }

    const body =
      await request.json();

    const action =
      cleanText(body.action) ??
      "ensure";

    const itinerary =
      await ensureItinerary({
        admin,
        companyId:
          workspace.companyId,
        userId:
          workspace.userId,
        charter,
      });

    if (action === "ensure") {
      return NextResponse.json(
        {
          success: true,
          itinerary:
            serializeItinerary(
              itinerary
            ),
        },
        {
          status: 201,
          headers:
            noStoreHeaders(),
        }
      );
    }

    if (action !== "add_leg") {
      return badRequest(
        "Choose ensure or add_leg."
      );
    }

    const fromName =
      cleanText(body.fromName);
    const toName =
      cleanText(body.toName);

    if (!fromName || !toName) {
      return badRequest(
        "Origin and destination are required."
      );
    }

    const coordinates =
      readCoordinates(body);

    if (coordinates.error) {
      return badRequest(
        coordinates.error
      );
    }

    const manualDistance =
      readOptionalNumber(
        body.distanceNm,
        {
          min: 0,
          label:
            "Distance",
        }
      );

    if (manualDistance.error) {
      return badRequest(
        manualDistance.error
      );
    }

    const coordinateDistance =
      hasAllCoordinates(
        coordinates.value
      )
        ? haversineNm(
            coordinates.value
              .fromLat!,
            coordinates.value
              .fromLon!,
            coordinates.value
              .toLat!,
            coordinates.value
              .toLon!
          )
        : null;

    const distanceNm =
      coordinateDistance ??
      manualDistance.value;

    if (
      distanceNm === null
    ) {
      return badRequest(
        "Add a manual distance or all four coordinates."
      );
    }

    const positionResult =
      await admin
        .from(
          "charter_itinerary_legs"
        )
        .select("position")
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "itinerary_id",
          itinerary.id
        )
        .order("position", {
          ascending: false,
        })
        .limit(1);

    if (positionResult.error) {
      throw new Error(
        `Could not determine route position: ${positionResult.error.message}`
      );
    }

    const lastPosition =
      Number(
        positionResult
          .data?.[0]
          ?.position ?? 0
      );

    const insertResult =
      await admin
        .from(
          "charter_itinerary_legs"
        )
        .insert({
          company_id:
            workspace.companyId,
          itinerary_id:
            itinerary.id,
          charter_id:
            charterId,
          position:
            lastPosition + 1,
          charter_date:
            cleanDate(
              body.charterDate
            ),
          from_name:
            fromName,
          to_name:
            toName,
          from_lat:
            coordinates.value
              .fromLat,
          from_lon:
            coordinates.value
              .fromLon,
          to_lat:
            coordinates.value
              .toLat,
          to_lon:
            coordinates.value
              .toLon,
          distance_nm:
            round(
              distanceNm,
              3
            ),
          distance_source:
            coordinateDistance !==
            null
              ? "coordinates"
              : "manual",
          departure_time:
            cleanTime(
              body.departureTime
            ),
          arrival_time:
            cleanTime(
              body.arrivalTime
            ),
          cruising_speed_knots:
            nullableNumberOrThrow(
              body.cruisingSpeedKnots,
              {
                minExclusive: 0,
                label:
                  "Leg cruising speed",
              }
            ),
          fuel_burn_lph:
            nullableNumberOrThrow(
              body.fuelBurnLph,
              {
                min: 0,
                label:
                  "Leg fuel burn",
              }
            ),
          fuel_price_per_liter:
            nullableNumberOrThrow(
              body.fuelPricePerLiter,
              {
                min: 0,
                label:
                  "Leg fuel price",
              }
            ),
          guest_visible:
            body.guestVisible !==
            false,
          notes:
            cleanText(
              body.notes
            ),
          created_by:
            workspace.userId,
          created_at:
            new Date()
              .toISOString(),
          updated_at:
            new Date()
              .toISOString(),
        })
        .select(legSelect())
        .single();

    if (
      insertResult.error ||
      !insertResult.data
    ) {
      throw new Error(
        `Could not add itinerary leg: ${
          insertResult.error
            ?.message ??
          "Unknown error."
        }`
      );
    }

    return NextResponse.json(
      {
        success: true,
        leg:
          serializeLeg(
            insertResult.data as unknown as LegRow,
            itinerary
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
      "Could not update itinerary."
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
          error: "Charter not found.",
        },
        { status: 404 }
      );
    }

    const itinerary =
      await ensureItinerary({
        admin,
        companyId:
          workspace.companyId,
        userId:
          workspace.userId,
        charter,
      });

    const body =
      await request.json();

    const patch:
      Record<string, unknown> = {
        updated_at:
          new Date().toISOString(),
      };

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "title"
      )
    ) {
      const title =
        cleanText(body.title);

      if (!title) {
        return badRequest(
          "Itinerary title cannot be blank."
        );
      }

      patch.title = title;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "status"
      )
    ) {
      const status =
        cleanText(body.status);

      if (
        !status ||
        ![
          "draft",
          "planning",
          "ready",
          "shared",
        ].includes(status)
      ) {
        return badRequest(
          "Choose a valid itinerary status."
        );
      }

      patch.status = status;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "cruisingSpeedKnots"
      )
    ) {
      patch.cruising_speed_knots =
        nullableNumberOrThrow(
          body.cruisingSpeedKnots,
          {
            minExclusive: 0,
            label:
              "Cruising speed",
          }
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "fuelBurnLph"
      )
    ) {
      patch.fuel_burn_lph =
        nullableNumberOrThrow(
          body.fuelBurnLph,
          {
            min: 0,
            label:
              "Fuel burn",
          }
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "fuelPricePerLiter"
      )
    ) {
      patch.fuel_price_per_liter =
        nullableNumberOrThrow(
          body.fuelPricePerLiter,
          {
            min: 0,
            label:
              "Fuel price",
          }
        );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "fuelCurrency"
      )
    ) {
      const currency =
        cleanCurrency(
          body.fuelCurrency
        );

      if (!currency) {
        return badRequest(
          "Fuel currency must be a three-letter code."
        );
      }

      patch.fuel_currency =
        currency;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "contingencyPercent"
      )
    ) {
      const value =
        nullableNumberOrThrow(
          body.contingencyPercent,
          {
            min: 0,
            max: 100,
            label:
              "Contingency",
          }
        );

      patch.contingency_percent =
        value ?? 0;
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

    const result =
      await admin
        .from(
          "charter_itineraries"
        )
        .update(patch)
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq(
          "id",
          itinerary.id
        )
        .select(itinerarySelect())
        .single();

    if (
      result.error ||
      !result.data
    ) {
      throw new Error(
        `Could not save itinerary settings: ${
          result.error
            ?.message ??
          "Unknown error."
        }`
      );
    }

    return NextResponse.json(
      {
        success: true,
        itinerary:
          serializeItinerary(
            result.data as unknown as ItineraryRow
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
      "Could not save itinerary."
    );
  }
}

async function ensureItinerary({
  admin,
  companyId,
  userId,
  charter,
}: {
  admin: ReturnType<
    typeof createAdminClient
  >;
  companyId: string;
  userId: string;
  charter: CharterRow;
}) {
  const existing =
    await admin
      .from("charter_itineraries")
      .select(itinerarySelect())
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "charter_id",
        charter.id
      )
      .maybeSingle();

  if (existing.error) {
    throw new Error(
      `Could not load itinerary: ${existing.error.message}`
    );
  }

  if (existing.data) {
    return existing.data as unknown as ItineraryRow;
  }

  const now =
    new Date().toISOString();

  const created =
    await admin
      .from("charter_itineraries")
      .insert({
        company_id:
          companyId,
        charter_id:
          charter.id,
        title:
          `${charter.yacht_name} Charter Itinerary`,
        status:
          "draft",
        fuel_currency:
          charter.currency ||
          "EUR",
        contingency_percent:
          10,
        created_by:
          userId,
        created_at:
          now,
        updated_at:
          now,
      })
      .select(itinerarySelect())
      .single();

  if (
    created.error ||
    !created.data
  ) {
    throw new Error(
      `Could not create itinerary: ${
        created.error
          ?.message ??
        "Unknown error."
      }`
    );
  }

  return created.data as unknown as ItineraryRow;
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
        "id, fleet_id, reference, client_name, yacht_name, start_date, end_date, destination, embarkation_port, disembarkation_port, guests, currency, contract_status, charter_status"
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

  return (
    result.data ??
    null
  ) as CharterRow | null;
}

function serializeCharter(
  charter: CharterRow
) {
  return {
    id:
      charter.id,
    fleetId:
      charter.fleet_id,
    reference:
      charter.reference,
    clientName:
      charter.client_name,
    yachtName:
      charter.yacht_name,
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
    currency:
      charter.currency,
    contractStatus:
      charter.contract_status,
    charterStatus:
      charter.charter_status,
  };
}

function serializeItinerary(
  row: ItineraryRow
) {
  return {
    id:
      row.id,
    title:
      row.title,
    status:
      row.status,
    cruisingSpeedKnots:
      numberOrNull(
        row.cruising_speed_knots
      ),
    fuelBurnLph:
      numberOrNull(
        row.fuel_burn_lph
      ),
    fuelPricePerLiter:
      numberOrNull(
        row.fuel_price_per_liter
      ),
    fuelCurrency:
      row.fuel_currency,
    contingencyPercent:
      numberOrZero(
        row.contingency_percent
      ),
    notes:
      row.notes,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  };
}

function serializeLeg(
  row: LegRow,
  itinerary: ItineraryRow
) {
  const estimate =
    calculateLeg(
      row,
      itinerary
    );

  return {
    id: row.id,
    position:
      row.position,
    charterDate:
      row.charter_date,
    fromName:
      row.from_name,
    toName:
      row.to_name,
    fromLat:
      numberOrNull(
        row.from_lat
      ),
    fromLon:
      numberOrNull(
        row.from_lon
      ),
    toLat:
      numberOrNull(
        row.to_lat
      ),
    toLon:
      numberOrNull(
        row.to_lon
      ),
    distanceNm:
      numberOrNull(
        row.distance_nm
      ),
    distanceSource:
      row.distance_source,
    departureTime:
      row.departure_time,
    arrivalTime:
      row.arrival_time,
    cruisingSpeedKnots:
      numberOrNull(
        row.cruising_speed_knots
      ),
    fuelBurnLph:
      numberOrNull(
        row.fuel_burn_lph
      ),
    fuelPricePerLiter:
      numberOrNull(
        row.fuel_price_per_liter
      ),
    guestVisible:
      row.guest_visible,
    notes:
      row.notes,
    estimate,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
  };
}

function calculateLeg(
  leg: LegRow,
  itinerary: ItineraryRow
) {
  const distance =
    numberOrNull(
      leg.distance_nm
    );

  const speed =
    numberOrNull(
      leg.cruising_speed_knots
    ) ??
    numberOrNull(
      itinerary.cruising_speed_knots
    );

  const burn =
    numberOrNull(
      leg.fuel_burn_lph
    ) ??
    numberOrNull(
      itinerary.fuel_burn_lph
    );

  const price =
    numberOrNull(
      leg.fuel_price_per_liter
    ) ??
    numberOrNull(
      itinerary.fuel_price_per_liter
    );

  const hours =
    distance !== null &&
    speed !== null &&
    speed > 0
      ? distance / speed
      : null;

  const fuelLiters =
    hours !== null &&
    burn !== null
      ? hours * burn
      : null;

  const baseFuelCost =
    fuelLiters !== null &&
    price !== null
      ? fuelLiters * price
      : null;

  const contingency =
    numberOrZero(
      itinerary.contingency_percent
    );

  const fuelCostWithContingency =
    baseFuelCost !== null
      ? baseFuelCost *
        (1 +
          contingency /
            100)
      : null;

  return {
    hours:
      nullableRound(
        hours,
        2
      ),
    fuelLiters:
      nullableRound(
        fuelLiters,
        1
      ),
    baseFuelCost:
      nullableRound(
        baseFuelCost,
        2
      ),
    fuelCostWithContingency:
      nullableRound(
        fuelCostWithContingency,
        2
      ),
  };
}

function calculateTotals(
  legs: LegRow[],
  itinerary: ItineraryRow
) {
  let distanceNm = 0;
  let hours = 0;
  let fuelLiters = 0;
  let baseFuelCost = 0;

  let hasHours = false;
  let hasFuel = false;
  let hasCost = false;

  for (const leg of legs) {
    const distance =
      numberOrNull(
        leg.distance_nm
      );

    if (distance !== null) {
      distanceNm += distance;
    }

    const estimate =
      calculateLeg(
        leg,
        itinerary
      );

    if (
      estimate.hours !==
      null
    ) {
      hours +=
        estimate.hours;
      hasHours = true;
    }

    if (
      estimate.fuelLiters !==
      null
    ) {
      fuelLiters +=
        estimate.fuelLiters;
      hasFuel = true;
    }

    if (
      estimate.baseFuelCost !==
      null
    ) {
      baseFuelCost +=
        estimate.baseFuelCost;
      hasCost = true;
    }
  }

  const contingency =
    numberOrZero(
      itinerary.contingency_percent
    );

  return {
    legCount:
      legs.length,
    distanceNm:
      round(
        distanceNm,
        2
      ),
    hours:
      hasHours
        ? round(
            hours,
            2
          )
        : null,
    fuelLiters:
      hasFuel
        ? round(
            fuelLiters,
            1
          )
        : null,
    baseFuelCost:
      hasCost
        ? round(
            baseFuelCost,
            2
          )
        : null,
    fuelCostWithContingency:
      hasCost
        ? round(
            baseFuelCost *
              (1 +
                contingency /
                  100),
            2
          )
        : null,
    contingencyPercent:
      contingency,
    currency:
      itinerary.fuel_currency,
  };
}

function emptyTotals() {
  return {
    legCount: 0,
    distanceNm: 0,
    hours: null,
    fuelLiters: null,
    baseFuelCost: null,
    fuelCostWithContingency:
      null,
    contingencyPercent: 0,
    currency: "EUR",
  };
}

function readCoordinates(
  body: Record<
    string,
    unknown
  >
):
  | {
      value: {
        fromLat:
          number | null;
        fromLon:
          number | null;
        toLat:
          number | null;
        toLon:
          number | null;
      };
      error: null;
    }
  | {
      value: {
        fromLat: null;
        fromLon: null;
        toLat: null;
        toLon: null;
      };
      error: string;
    } {
  const values = {
    fromLat:
      optionalFiniteNumber(
        body.fromLat
      ),
    fromLon:
      optionalFiniteNumber(
        body.fromLon
      ),
    toLat:
      optionalFiniteNumber(
        body.toLat
      ),
    toLon:
      optionalFiniteNumber(
        body.toLon
      ),
  };

  if (
    values.fromLat !==
      null &&
    (values.fromLat <
      -90 ||
      values.fromLat >
        90)
  ) {
    return {
      value: {
        fromLat: null,
        fromLon: null,
        toLat: null,
        toLon: null,
      },
      error:
        "Origin latitude must be between -90 and 90.",
    };
  }

  if (
    values.toLat !== null &&
    (values.toLat < -90 ||
      values.toLat > 90)
  ) {
    return {
      value: {
        fromLat: null,
        fromLon: null,
        toLat: null,
        toLon: null,
      },
      error:
        "Destination latitude must be between -90 and 90.",
    };
  }

  for (const key of [
    "fromLon",
    "toLon",
  ] as const) {
    const value =
      values[key];

    if (
      value !== null &&
      (value < -180 ||
        value > 180)
    ) {
      return {
        value: {
          fromLat: null,
          fromLon: null,
          toLat: null,
          toLon: null,
        },
        error:
          "Longitude must be between -180 and 180.",
      };
    }
  }

  return {
    value: values,
    error: null,
  };
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

  const toRadians =
    (degrees: number) =>
      (degrees *
        Math.PI) /
      180;

  const phi1 =
    toRadians(lat1);
  const phi2 =
    toRadians(lat2);
  const deltaPhi =
    toRadians(
      lat2 - lat1
    );
  const deltaLambda =
    toRadians(
      lon2 - lon1
    );

  const a =
    Math.sin(
      deltaPhi / 2
    ) ** 2 +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(
        deltaLambda /
          2
      ) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return radiusNm * c;
}

function nullableNumberOrThrow(
  value: unknown,
  options: {
    min?: number;
    minExclusive?: number;
    max?: number;
    label: string;
  }
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    throw new Error(
      `${options.label} must be a valid number.`
    );
  }

  if (
    options.min !==
      undefined &&
    parsed <
      options.min
  ) {
    throw new Error(
      `${options.label} must be at least ${options.min}.`
    );
  }

  if (
    options.minExclusive !==
      undefined &&
    parsed <=
      options.minExclusive
  ) {
    throw new Error(
      `${options.label} must be greater than ${options.minExclusive}.`
    );
  }

  if (
    options.max !==
      undefined &&
    parsed >
      options.max
  ) {
    throw new Error(
      `${options.label} must be no more than ${options.max}.`
    );
  }

  return parsed;
}

function readOptionalNumber(
  value: unknown,
  options: {
    min: number;
    label: string;
  }
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return {
      value: null,
      error: null,
    };
  }

  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed < options.min
  ) {
    return {
      value: null,
      error:
        `${options.label} must be a valid number of at least ${options.min}.`,
    };
  }

  return {
    value: parsed,
    error: null,
  };
}

function optionalFiniteNumber(
  value: unknown
) {
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
    : null;
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

  return cleaned.length > 0
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

function cleanCurrency(
  value: unknown
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const cleaned =
    value
      .trim()
      .toUpperCase();

  return /^[A-Z]{3}$/.test(
    cleaned
  )
    ? cleaned
    : null;
}

function numberOrNull(
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
    value.trim().length >
      0
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

function numberOrZero(
  value: unknown
) {
  return (
    numberOrNull(value) ??
    0
  );
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

function nullableRound(
  value: number | null,
  digits: number
) {
  return value === null
    ? null
    : round(
        value,
        digits
      );
}

function itinerarySelect() {
  return [
    "id",
    "company_id",
    "charter_id",
    "title",
    "status",
    "cruising_speed_knots",
    "fuel_burn_lph",
    "fuel_price_per_liter",
    "fuel_currency",
    "contingency_percent",
    "notes",
    "created_at",
    "updated_at",
  ].join(",");
}

function legSelect() {
  return [
    "id",
    "itinerary_id",
    "charter_id",
    "position",
    "charter_date",
    "from_name",
    "to_name",
    "from_lat",
    "from_lon",
    "to_lat",
    "to_lon",
    "distance_nm",
    "distance_source",
    "departure_time",
    "arrival_time",
    "cruising_speed_knots",
    "fuel_burn_lph",
    "fuel_price_per_liter",
    "guest_visible",
    "notes",
    "created_at",
    "updated_at",
  ].join(",");
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
    "Itinerary API error:",
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