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
  reference: string;
  client_name: string;
  yacht_name: string;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  embarkation_port: string | null;
  disembarkation_port: string | null;
  guests: number | null;
};

type ItineraryRow = {
  id: string;
  title: string;
  status: string;
};

type DayRow = {
  id: string;
  itinerary_id: string;
  charter_id: string;
  position: number;
  charter_date: string;
  title: string;
  destination_name: string | null;
  overnight_type: string;
  overnight_name: string | null;
  summary: string | null;
  guest_notes: string | null;
  internal_notes: string | null;
  guest_visible: boolean;
  created_at: string;
  updated_at: string;
};

type ActivityRow = {
  id: string;
  day_id: string;
  position: number;
  activity_type: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  description: string | null;
  status: string;
  guest_visible: boolean;
  created_at: string;
  updated_at: string;
};

type LegRow = {
  id: string;
  position: number;
  charter_date: string | null;
  from_name: string;
  to_name: string;
  distance_nm: number | string | null;
  departure_time: string | null;
  arrival_time: string | null;
  guest_visible: boolean;
  notes: string | null;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const charterId =
      await getCharterId(context);

    if (!charterId) {
      return badRequest(
        "A charter ID is required."
      );
    }

    const workspace =
      await getCurrentWorkspace();

    const bundle =
      await loadBundle(
        workspace.companyId,
        charterId
      );

    if (!bundle.charter) {
      return NextResponse.json(
        {
          success: false,
          error: "Charter not found.",
        },
        { status: 404 }
      );
    }

    if (!bundle.itinerary) {
      return NextResponse.json(
        {
          success: true,
          charter:
            serializeCharter(
              bundle.charter
            ),
          itinerary: null,
          days: [],
          stats: emptyStats(),
        },
        {
          headers:
            noStoreHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        charter:
          serializeCharter(
            bundle.charter
          ),
        itinerary: {
          id:
            bundle.itinerary.id,
          title:
            bundle.itinerary.title,
          status:
            bundle.itinerary.status,
        },
        days:
          bundle.days.map(
            (day) =>
              serializeDay(
                day,
                bundle.activities.filter(
                  (activity) =>
                    activity.day_id ===
                    day.id
                ),
                bundle.legs.filter(
                  (leg) =>
                    leg.charter_date ===
                    day.charter_date
                )
              )
          ),
        stats: {
          days:
            bundle.days.length,
          guestVisibleDays:
            bundle.days.filter(
              (day) =>
                day.guest_visible
            ).length,
          activities:
            bundle.activities.length,
          guestVisibleActivities:
            bundle.activities.filter(
              (activity) =>
                activity.guest_visible
            ).length,
        },
      },
      {
        headers:
          noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleError(
      error,
      "Could not load itinerary experience."
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const charterId =
      await getCharterId(context);

    if (!charterId) {
      return badRequest(
        "A charter ID is required."
      );
    }

    const body =
      (await request.json()) as Record<
        string,
        unknown
      >;

    const action =
      text(body.action);

    if (!action) {
      return badRequest(
        "An action is required."
      );
    }

    const workspace =
      await getCurrentWorkspace();

    const bundle =
      await loadBundle(
        workspace.companyId,
        charterId
      );

    if (!bundle.charter) {
      return NextResponse.json(
        {
          success: false,
          error: "Charter not found.",
        },
        { status: 404 }
      );
    }

    if (!bundle.itinerary) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Create the charter itinerary before adding day-by-day content.",
        },
        { status: 409 }
      );
    }

    if (
      action === "seed_days"
    ) {
      const created =
        await seedDays({
          companyId:
            workspace.companyId,
          userId:
            workspace.userId,
          charter:
            bundle.charter,
          itinerary:
            bundle.itinerary,
        });

      return NextResponse.json(
        {
          success: true,
          created,
        },
        {
          headers:
            noStoreHeaders(),
        }
      );
    }

    if (
      action === "save_day"
    ) {
      const result =
        await saveDay({
          companyId:
            workspace.companyId,
          userId:
            workspace.userId,
          charter:
            bundle.charter,
          itinerary:
            bundle.itinerary,
          body,
        });

      if (result.error) {
        return badRequest(
          result.error
        );
      }

      return NextResponse.json(
        {
          success: true,
          day: result.day,
        },
        {
          headers:
            noStoreHeaders(),
        }
      );
    }

    if (
      action === "delete_day"
    ) {
      const dayId =
        text(body.dayId);

      if (!dayId) {
        return badRequest(
          "A day ID is required."
        );
      }

      const admin =
        createAdminClient();

      const result =
        await admin
          .from(
            "charter_itinerary_days"
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
            "itinerary_id",
            bundle.itinerary.id
          )
          .eq("id", dayId)
          .select("id")
          .maybeSingle();

      if (result.error) {
        throw new Error(
          result.error.message
        );
      }

      return NextResponse.json(
        {
          success: true,
          deleted:
            Boolean(
              result.data
            ),
        },
        {
          headers:
            noStoreHeaders(),
        }
      );
    }

    if (
      action ===
      "save_activity"
    ) {
      const result =
        await saveActivity({
          companyId:
            workspace.companyId,
          userId:
            workspace.userId,
          charterId,
          itineraryId:
            bundle.itinerary.id,
          body,
        });

      if (result.error) {
        return badRequest(
          result.error
        );
      }

      return NextResponse.json(
        {
          success: true,
          activity:
            result.activity,
        },
        {
          headers:
            noStoreHeaders(),
        }
      );
    }

    if (
      action ===
      "delete_activity"
    ) {
      const activityId =
        text(
          body.activityId
        );

      if (!activityId) {
        return badRequest(
          "An activity ID is required."
        );
      }

      const admin =
        createAdminClient();

      const result =
        await admin
          .from(
            "charter_itinerary_activities"
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
            "itinerary_id",
            bundle.itinerary.id
          )
          .eq(
            "id",
            activityId
          )
          .select("id")
          .maybeSingle();

      if (result.error) {
        throw new Error(
          result.error.message
        );
      }

      return NextResponse.json(
        {
          success: true,
          deleted:
            Boolean(
              result.data
            ),
        },
        {
          headers:
            noStoreHeaders(),
        }
      );
    }

    return badRequest(
      "Unsupported itinerary experience action."
    );
  } catch (error) {
    return handleError(
      error,
      "Could not update itinerary experience."
    );
  }
}

async function loadBundle(
  companyId: string,
  charterId: string
) {
  const admin =
    createAdminClient();

  const [
    charterResult,
    itineraryResult,
  ] = await Promise.all([
    admin
      .from("charters")
      .select(
        "id, reference, client_name, yacht_name, start_date, end_date, destination, embarkation_port, disembarkation_port, guests"
      )
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "id",
        charterId
      )
      .maybeSingle(),

    admin
      .from(
        "charter_itineraries"
      )
      .select(
        "id, title, status"
      )
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "charter_id",
        charterId
      )
      .maybeSingle(),
  ]);

  if (charterResult.error) {
    throw new Error(
      charterResult.error.message
    );
  }

  if (itineraryResult.error) {
    throw new Error(
      itineraryResult.error.message
    );
  }

  const charter =
    (charterResult.data ??
      null) as CharterRow | null;

  const itinerary =
    (itineraryResult.data ??
      null) as ItineraryRow | null;

  if (!itinerary) {
    return {
      charter,
      itinerary: null,
      days: [] as DayRow[],
      activities:
        [] as ActivityRow[],
      legs: [] as LegRow[],
    };
  }

  const [
    daysResult,
    activitiesResult,
    legsResult,
  ] = await Promise.all([
    admin
      .from(
        "charter_itinerary_days"
      )
      .select(daySelect())
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "itinerary_id",
        itinerary.id
      )
      .order(
        "charter_date",
        { ascending: true }
      )
      .order(
        "position",
        { ascending: true }
      ),

    admin
      .from(
        "charter_itinerary_activities"
      )
      .select(
        activitySelect()
      )
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "itinerary_id",
        itinerary.id
      )
      .order(
        "position",
        { ascending: true }
      ),

    admin
      .from(
        "charter_itinerary_legs"
      )
      .select(
        "id, position, charter_date, from_name, to_name, distance_nm, departure_time, arrival_time, guest_visible, notes"
      )
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "itinerary_id",
        itinerary.id
      )
      .order(
        "position",
        { ascending: true }
      ),
  ]);

  if (daysResult.error) {
    throw new Error(
      daysResult.error.message
    );
  }

  if (
    activitiesResult.error
  ) {
    throw new Error(
      activitiesResult.error.message
    );
  }

  if (legsResult.error) {
    throw new Error(
      legsResult.error.message
    );
  }

  return {
    charter,
    itinerary,
    days:
      (daysResult.data ??
        []) as unknown as DayRow[],
    activities:
      (activitiesResult.data ??
        []) as unknown as ActivityRow[],
    legs:
      (legsResult.data ??
        []) as unknown as LegRow[],
  };
}

async function seedDays({
  companyId,
  userId,
  charter,
  itinerary,
}: {
  companyId: string;
  userId: string;
  charter: CharterRow;
  itinerary: ItineraryRow;
}) {
  if (
    !charter.start_date ||
    !charter.end_date
  ) {
    throw new Error(
      "Set charter start and end dates before generating itinerary days."
    );
  }

  const start =
    new Date(
      `${charter.start_date.slice(
        0,
        10
      )}T00:00:00Z`
    );

  const end =
    new Date(
      `${charter.end_date.slice(
        0,
        10
      )}T00:00:00Z`
    );

  if (
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    )
  ) {
    throw new Error(
      "The charter dates are invalid."
    );
  }

  const rows:
    Array<
      Record<string, unknown>
    > = [];

  const cursor =
    new Date(
      start.getTime()
    );

  let position = 1;

  while (
    cursor.getTime() <=
    end.getTime()
  ) {
    if (position > 31) {
      throw new Error(
        "Automatic day generation is limited to 31 charter days."
      );
    }

    const date =
      cursor
        .toISOString()
        .slice(0, 10);

    rows.push({
      company_id:
        companyId,
      itinerary_id:
        itinerary.id,
      charter_id:
        charter.id,
      position,
      charter_date:
        date,
      title:
        `Day ${position}`,
      destination_name:
        position === 1
          ? charter.embarkation_port ??
            charter.destination
          : date ===
              charter.end_date.slice(
                0,
                10
              )
            ? charter.disembarkation_port ??
              charter.destination
            : charter.destination,
      overnight_type:
        "none",
      guest_visible:
        true,
      created_by:
        userId,
      updated_at:
        new Date()
          .toISOString(),
    });

    cursor.setUTCDate(
      cursor.getUTCDate() +
        1
    );

    position += 1;
  }

  const admin =
    createAdminClient();

  const result =
    await admin
      .from(
        "charter_itinerary_days"
      )
      .upsert(
        rows,
        {
          onConflict:
            "company_id,itinerary_id,charter_date",
          ignoreDuplicates:
            true,
        }
      );

  if (result.error) {
    throw new Error(
      result.error.message
    );
  }

  return rows.length;
}

async function saveDay({
  companyId,
  userId,
  charter,
  itinerary,
  body,
}: {
  companyId: string;
  userId: string;
  charter: CharterRow;
  itinerary: ItineraryRow;
  body:
    Record<string, unknown>;
}) {
  const dayId =
    text(body.dayId);

  const charterDate =
    dateText(
      body.charterDate
    );

  const title =
    text(body.title);

  if (!charterDate) {
    return {
      error:
        "Choose a charter date.",
      day: null,
    };
  }

  if (!title) {
    return {
      error:
        "The day title cannot be blank.",
      day: null,
    };
  }

  if (
    charter.start_date &&
    charter.end_date &&
    (
      charterDate <
        charter.start_date.slice(
          0,
          10
        ) ||
      charterDate >
        charter.end_date.slice(
          0,
          10
        )
    )
  ) {
    return {
      error:
        "The itinerary day must fall within the charter dates.",
      day: null,
    };
  }

  const overnightType =
    text(
      body.overnightType
    ) ?? "none";

  if (
    ![
      "none",
      "marina",
      "anchorage",
      "port",
      "underway",
    ].includes(
      overnightType
    )
  ) {
    return {
      error:
        "Choose a valid overnight type.",
      day: null,
    };
  }

  const now =
    new Date()
      .toISOString();

  const patch = {
    charter_date:
      charterDate,
    title,
    destination_name:
      text(
        body.destinationName
      ),
    overnight_type:
      overnightType,
    overnight_name:
      text(
        body.overnightName
      ),
    summary:
      text(body.summary),
    guest_notes:
      text(
        body.guestNotes
      ),
    internal_notes:
      text(
        body.internalNotes
      ),
    guest_visible:
      body.guestVisible !==
      false,
    updated_at: now,
  };

  const admin =
    createAdminClient();

  if (dayId) {
    const result =
      await admin
        .from(
          "charter_itinerary_days"
        )
        .update(patch)
        .eq(
          "company_id",
          companyId
        )
        .eq(
          "itinerary_id",
          itinerary.id
        )
        .eq("id", dayId)
        .select(daySelect())
        .single();

    return {
      error:
        result.error?.message ??
        null,
      day:
        result.data ??
        null,
    };
  }

  const positionResult =
    await admin
      .from(
        "charter_itinerary_days"
      )
      .select("position")
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "itinerary_id",
        itinerary.id
      )
      .order(
        "position",
        { ascending: false }
      )
      .limit(1);

  if (
    positionResult.error
  ) {
    return {
      error:
        positionResult.error.message,
      day: null,
    };
  }

  const result =
    await admin
      .from(
        "charter_itinerary_days"
      )
      .insert({
        company_id:
          companyId,
        itinerary_id:
          itinerary.id,
        charter_id:
          charter.id,
        position:
          Number(
            positionResult
              .data?.[0]
              ?.position ??
              0
          ) + 1,
        created_by:
          userId,
        created_at: now,
        ...patch,
      })
      .select(daySelect())
      .single();

  return {
    error:
      result.error?.message ??
      null,
    day:
      result.data ??
      null,
  };
}

async function saveActivity({
  companyId,
  userId,
  charterId,
  itineraryId,
  body,
}: {
  companyId: string;
  userId: string;
  charterId: string;
  itineraryId: string;
  body:
    Record<string, unknown>;
}) {
  const activityId =
    text(
      body.activityId
    );
  const dayId =
    text(body.dayId);
  const title =
    text(body.title);
  const activityType =
    text(
      body.activityType
    ) ?? "activity";
  const status =
    text(body.status) ??
    "planning";

  if (!dayId) {
    return {
      error:
        "Choose an itinerary day.",
      activity: null,
    };
  }

  if (!title) {
    return {
      error:
        "The activity title cannot be blank.",
      activity: null,
    };
  }

  const validTypes = [
    "activity",
    "dining",
    "transfer",
    "water_sports",
    "wellness",
    "beach_club",
    "culture",
    "nightlife",
    "shopping",
    "other",
  ];

  const validStatuses = [
    "idea",
    "planning",
    "confirmed",
    "completed",
    "cancelled",
  ];

  if (
    !validTypes.includes(
      activityType
    )
  ) {
    return {
      error:
        "Choose a valid activity type.",
      activity: null,
    };
  }

  if (
    !validStatuses.includes(
      status
    )
  ) {
    return {
      error:
        "Choose a valid activity status.",
      activity: null,
    };
  }

  const admin =
    createAdminClient();

  const dayCheck =
    await admin
      .from(
        "charter_itinerary_days"
      )
      .select("id")
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "itinerary_id",
        itineraryId
      )
      .eq(
        "charter_id",
        charterId
      )
      .eq("id", dayId)
      .maybeSingle();

  if (
    dayCheck.error ||
    !dayCheck.data
  ) {
    return {
      error:
        "The selected itinerary day was not found.",
      activity: null,
    };
  }

  const now =
    new Date()
      .toISOString();

  const patch = {
    day_id: dayId,
    activity_type:
      activityType,
    title,
    start_time:
      timeText(
        body.startTime
      ),
    end_time:
      timeText(
        body.endTime
      ),
    location:
      text(body.location),
    description:
      text(
        body.description
      ),
    status,
    guest_visible:
      body.guestVisible !==
      false,
    updated_at: now,
  };

  if (activityId) {
    const result =
      await admin
        .from(
          "charter_itinerary_activities"
        )
        .update(patch)
        .eq(
          "company_id",
          companyId
        )
        .eq(
          "itinerary_id",
          itineraryId
        )
        .eq(
          "charter_id",
          charterId
        )
        .eq(
          "id",
          activityId
        )
        .select(
          activitySelect()
        )
        .single();

    return {
      error:
        result.error?.message ??
        null,
      activity:
        result.data ??
        null,
    };
  }

  const positionResult =
    await admin
      .from(
        "charter_itinerary_activities"
      )
      .select("position")
      .eq(
        "company_id",
        companyId
      )
      .eq(
        "day_id",
        dayId
      )
      .order(
        "position",
        { ascending: false }
      )
      .limit(1);

  if (
    positionResult.error
  ) {
    return {
      error:
        positionResult.error.message,
      activity: null,
    };
  }

  const result =
    await admin
      .from(
        "charter_itinerary_activities"
      )
      .insert({
        company_id:
          companyId,
        itinerary_id:
          itineraryId,
        charter_id:
          charterId,
        position:
          Number(
            positionResult
              .data?.[0]
              ?.position ??
              0
          ) + 1,
        created_by:
          userId,
        created_at: now,
        ...patch,
      })
      .select(
        activitySelect()
      )
      .single();

  return {
    error:
      result.error?.message ??
      null,
    activity:
      result.data ??
      null,
  };
}

function serializeDay(
  day: DayRow,
  activities: ActivityRow[],
  legs: LegRow[]
) {
  return {
    id: day.id,
    position:
      day.position,
    charterDate:
      day.charter_date,
    title: day.title,
    destinationName:
      day.destination_name,
    overnightType:
      day.overnight_type,
    overnightName:
      day.overnight_name,
    summary: day.summary,
    guestNotes:
      day.guest_notes,
    internalNotes:
      day.internal_notes,
    guestVisible:
      day.guest_visible,
    activities:
      activities.map(
        (activity) => ({
          id:
            activity.id,
          position:
            activity.position,
          activityType:
            activity.activity_type,
          title:
            activity.title,
          startTime:
            activity.start_time,
          endTime:
            activity.end_time,
          location:
            activity.location,
          description:
            activity.description,
          status:
            activity.status,
          guestVisible:
            activity.guest_visible,
        })
      ),
    routeLegs:
      legs.map(
        (leg) => ({
          id: leg.id,
          position:
            leg.position,
          fromName:
            leg.from_name,
          toName:
            leg.to_name,
          distanceNm:
            toNumber(
              leg.distance_nm
            ),
          departureTime:
            leg.departure_time,
          arrivalTime:
            leg.arrival_time,
          guestVisible:
            leg.guest_visible,
          notes: leg.notes,
        })
      ),
  };
}

function serializeCharter(
  charter: CharterRow
) {
  return {
    id: charter.id,
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
  };
}

function emptyStats() {
  return {
    days: 0,
    guestVisibleDays: 0,
    activities: 0,
    guestVisibleActivities: 0,
  };
}

function text(
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

function dateText(
  value: unknown
) {
  const cleaned =
    text(value);

  return cleaned &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      cleaned
    )
    ? cleaned
    : null;
}

function timeText(
  value: unknown
) {
  const cleaned =
    text(value);

  return cleaned &&
    /^\d{2}:\d{2}(:\d{2})?$/.test(
      cleaned
    )
    ? cleaned
    : null;
}

function toNumber(
  value: unknown
) {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : null;
}

function daySelect() {
  return [
    "id",
    "itinerary_id",
    "charter_id",
    "position",
    "charter_date",
    "title",
    "destination_name",
    "overnight_type",
    "overnight_name",
    "summary",
    "guest_notes",
    "internal_notes",
    "guest_visible",
    "created_at",
    "updated_at",
  ].join(",");
}

function activitySelect() {
  return [
    "id",
    "day_id",
    "position",
    "activity_type",
    "title",
    "start_time",
    "end_time",
    "location",
    "description",
    "status",
    "guest_visible",
    "created_at",
    "updated_at",
  ].join(",");
}

async function getCharterId(
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

function noStoreHeaders() {
  return {
    "Cache-Control":
      "private, no-store, max-age=0",
  };
}

function badRequest(
  error: string
) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status: 400 }
  );
}

function handleError(
  error: unknown,
  fallback: string
) {
  if (
    isAuthenticationRequiredError(
      error
    ) ||
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

  console.error(
    "Itinerary experience API error:",
    error
  );

  return NextResponse.json(
    {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : fallback,
    },
    { status: 500 }
  );
}