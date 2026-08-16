import {
  createHash,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params:
    | Promise<{
        token: string;
      }>
    | {
        token: string;
      };
};

type PortalRow = {
  id: string;
  company_id: string;
  charter_id: string;
  status: string;
  expires_at: string | null;
  opened_at: string | null;
  opened_count: number;
  submitted_at: string | null;
  preferences: Record<
    string,
    unknown
  > | null;
};

type CharterRow = {
  id: string;
  reference: string;
  client_name: string;
  yacht_name: string;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  guests: number | null;
};

type GuestPreferencePayload = {
  travel?: {
    transferRequested?: unknown;
    transferType?: unknown;
    flightNumber?: unknown;
    arrivalAirport?: unknown;
    arrivalTime?: unknown;
    pickupLocation?: unknown;
  };
  dining?: {
    restaurantsRequested?: unknown;
    restaurantNotes?: unknown;
  };
  activities?: {
    selected?: unknown;
    notes?: unknown;
  };
  provisioning?: {
    dietaryRequirements?: unknown;
    allergies?: unknown;
    foodPreferences?: unknown;
    drinks?: unknown;
  };
  celebration?: {
    type?: unknown;
    date?: unknown;
    notes?: unknown;
  };
  guestPreferences?: {
    cabinPreferences?: unknown;
    childrenDetails?: unknown;
    musicPreferences?: unknown;
    accessibilityRequirements?: unknown;
  };
  specialRequests?: unknown;
  consent?: unknown;
};

type ConciergeSeed = {
  key: string;
  category:
    | "transfer"
    | "restaurant"
    | "provisioning"
    | "activity"
    | "special_request"
    | "crew_coordination";
  title: string;
  description: string;
  priority:
    | "normal"
    | "high"
    | "urgent";
};

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const token =
      await readToken(context);

    if (!token) {
      return unavailable();
    }

    const admin =
      createAdminClient();

    const portal =
      await loadPortal(
        admin,
        token
      );

    if (!portal) {
      return unavailable();
    }

    const charterResult =
      await admin
        .from("charters")
        .select(
          "id, reference, client_name, yacht_name, start_date, end_date, destination, guests"
        )
        .eq(
          "company_id",
          portal.company_id
        )
        .eq(
          "id",
          portal.charter_id
        )
        .maybeSingle();

    if (
      charterResult.error ||
      !charterResult.data
    ) {
      return unavailable();
    }

    const arrangementsResult =
      await admin
        .from(
          "charter_concierge_items"
        )
        .select(
          "id, category, title, description, status, scheduled_at, location, vendor_name"
        )
        .eq(
          "company_id",
          portal.company_id
        )
        .eq(
          "charter_id",
          portal.charter_id
        )
        .eq(
          "client_visible",
          true
        )
        .in(
          "status",
          [
            "planning",
            "confirmed",
            "completed",
          ]
        )
        .order(
          "scheduled_at",
          {
            ascending: true,
            nullsFirst: false,
          }
        );

    if (
      arrangementsResult.error
    ) {
      throw new Error(
        `Could not load guest arrangements: ${arrangementsResult.error.message}`
      );
    }

    const openedAt =
      new Date().toISOString();

    await admin
      .from("guest_portals")
      .update({
        opened_at:
          openedAt,
        opened_count:
          Math.max(
            0,
            Number(
              portal.opened_count
            ) || 0
          ) + 1,
        updated_at:
          openedAt,
      })
      .eq(
        "id",
        portal.id
      );

    const charter =
      charterResult.data as CharterRow;

    return NextResponse.json(
      {
        success: true,
        portal: {
          status:
            portal.status,
          submittedAt:
            portal.submitted_at,
          expiresAt:
            portal.expires_at,
          preferences:
            portal.preferences ??
            {},
        },
        charter: {
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
          guests:
            charter.guests,
        },
        arrangements:
          arrangementsResult.data ??
          [],
      },
      {
        status: 200,
        headers:
          publicNoStoreHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Public guest portal GET error:",
      error
    );

    return unavailable();
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const token =
      await readToken(context);

    if (!token) {
      return unavailable();
    }

    const admin =
      createAdminClient();

    const portal =
      await loadPortal(
        admin,
        token
      );

    if (!portal) {
      return unavailable();
    }

    let body:
      GuestPreferencePayload;

    try {
      body =
        (await request.json()) as GuestPreferencePayload;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "The preference form is invalid.",
        },
        {
          status: 400,
          headers:
            publicNoStoreHeaders(),
        }
      );
    }

    if (
      body.consent !==
      true
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Please confirm that your preferences may be shared with the broker, yacht team and relevant service providers where necessary to arrange your charter.",
        },
        {
          status: 400,
          headers:
            publicNoStoreHeaders(),
        }
      );
    }

    const preferences =
      normalizePreferences(
        body
      );

    const wasPreviouslySubmitted =
      Boolean(
        portal.submitted_at
      );

    const submittedAt =
      new Date().toISOString();

    const portalUpdate =
      await admin
        .from("guest_portals")
        .update({
          preferences,
          status:
            "submitted",
          submitted_at:
            submittedAt,
          updated_at:
            submittedAt,
        })
        .eq(
          "id",
          portal.id
        );

    if (
      portalUpdate.error
    ) {
      throw new Error(
        `Could not save guest preferences: ${portalUpdate.error.message}`
      );
    }

    const charterResult =
      await admin
        .from("charters")
        .select(
          "id, reference, client_name, yacht_name"
        )
        .eq(
          "company_id",
          portal.company_id
        )
        .eq(
          "id",
          portal.charter_id
        )
        .maybeSingle();

    if (
      charterResult.error ||
      !charterResult.data
    ) {
      throw new Error(
        `Could not load charter for guest preference notification: ${
          charterResult.error?.message ??
          "Charter not found."
        }`
      );
    }

    const charter =
      charterResult.data as unknown as {
        id: string;
        reference: string;
        client_name: string;
        yacht_name: string;
      };

    const seeds =
      buildConciergeSeeds(
        preferences
      );

    for (
      const seed of seeds
    ) {
      const existingResult =
        await admin
          .from(
            "charter_concierge_items"
          )
          .select(
            "id, status"
          )
          .eq(
            "company_id",
            portal.company_id
          )
          .eq(
            "charter_id",
            portal.charter_id
          )
          .eq(
            "guest_portal_id",
            portal.id
          )
          .eq(
            "guest_request_key",
            seed.key
          )
          .maybeSingle();

      if (
        existingResult.error
      ) {
        throw new Error(
          `Could not synchronize guest request: ${existingResult.error.message}`
        );
      }

      if (
        existingResult.data
      ) {
        const updateResult =
          await admin
            .from(
              "charter_concierge_items"
            )
            .update({
              category:
                seed.category,
              title:
                seed.title,
              description:
                seed.description,
              priority:
                seed.priority,
              source:
                "client",
              client_visible:
                true,
              updated_at:
                submittedAt,
            })
            .eq(
              "id",
              existingResult.data
                .id
            )
            .eq(
              "company_id",
              portal.company_id
            );

        if (
          updateResult.error
        ) {
          throw new Error(
            `Could not update guest request: ${updateResult.error.message}`
          );
        }

        continue;
      }

      const insertResult =
        await admin
          .from(
            "charter_concierge_items"
          )
          .insert({
            company_id:
              portal.company_id,
            charter_id:
              portal.charter_id,
            category:
              seed.category,
            title:
              seed.title,
            description:
              seed.description,
            status:
              "pending",
            priority:
              seed.priority,
            currency:
              "EUR",
            source:
              "client",
            client_visible:
              true,
            guest_portal_id:
              portal.id,
            guest_request_key:
              seed.key,
            created_at:
              submittedAt,
            updated_at:
              submittedAt,
          });

      if (
        insertResult.error
      ) {
        throw new Error(
          `Could not create guest request: ${insertResult.error.message}`
        );
      }
    }

    const notificationResult =
      await admin
        .from("notifications")
        .insert({
          company_id:
            portal.company_id,
          user_id:
            null,
          type:
            "guest_preferences",
          title:
            wasPreviouslySubmitted
              ? "Guest preferences updated"
              : "Guest preferences submitted",
          message:
            `${charter.client_name} ${
              wasPreviouslySubmitted
                ? "updated"
                : "submitted"
            } charter preferences for ${charter.yacht_name}. ${
              seeds.length
            } concierge request group${
              seeds.length === 1
                ? ""
                : "s"
            } synchronized.`,
          href:
            `/concierge/${portal.charter_id}`,
          entity_type:
            "guest_portal",
          entity_id:
            portal.id,
          priority:
            "high",
          read_at:
            null,
          created_at:
            submittedAt,
        });

    if (
      notificationResult.error
    ) {
      console.error(
        "Could not create guest preference notification:",
        notificationResult.error
      );
    }

    return NextResponse.json(
      {
        success: true,
        submittedAt,
        requestsCreated:
          seeds.length,
      },
      {
        status: 200,
        headers:
          publicNoStoreHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Public guest portal POST error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Your preferences could not be saved.",
      },
      {
        status: 500,
        headers:
          publicNoStoreHeaders(),
      }
    );
  }
}

async function loadPortal(
  admin: ReturnType<
    typeof createAdminClient
  >,
  token: string
): Promise<PortalRow | null> {
  const result =
    await admin
      .from("guest_portals")
      .select(
        "id, company_id, charter_id, status, expires_at, opened_at, opened_count, submitted_at, preferences"
      )
      .eq(
        "token_hash",
        hashToken(token)
      )
      .in(
        "status",
        [
          "active",
          "submitted",
        ]
      )
      .maybeSingle();

  if (
    result.error ||
    !result.data
  ) {
    return null;
  }

  const portal =
    result.data as PortalRow;

  if (
    portal.expires_at &&
    new Date(
      portal.expires_at
    ).getTime() <
      Date.now()
  ) {
    return null;
  }

  return portal;
}

function normalizePreferences(
  body:
    GuestPreferencePayload
) {
  const selectedActivities =
    Array.isArray(
      body.activities
        ?.selected
    )
      ? body.activities!
          .selected!.filter(
            (
              value
            ): value is string =>
              typeof value ===
                "string" &&
              value.trim()
                .length > 0
          )
          .map(
            (value) =>
              value.trim()
          )
      : [];

  return {
    travel: {
      transferRequested:
        body.travel
          ?.transferRequested ===
        true,
      transferType:
        cleanText(
          body.travel
            ?.transferType
        ),
      flightNumber:
        cleanText(
          body.travel
            ?.flightNumber
        ),
      arrivalAirport:
        cleanText(
          body.travel
            ?.arrivalAirport
        ),
      arrivalTime:
        cleanText(
          body.travel
            ?.arrivalTime
        ),
      pickupLocation:
        cleanText(
          body.travel
            ?.pickupLocation
        ),
    },
    dining: {
      restaurantsRequested:
        body.dining
          ?.restaurantsRequested ===
        true,
      restaurantNotes:
        cleanText(
          body.dining
            ?.restaurantNotes
        ),
    },
    activities: {
      selected:
        selectedActivities,
      notes:
        cleanText(
          body.activities
            ?.notes
        ),
    },
    provisioning: {
      dietaryRequirements:
        cleanText(
          body.provisioning
            ?.dietaryRequirements
        ),
      allergies:
        cleanText(
          body.provisioning
            ?.allergies
        ),
      foodPreferences:
        cleanText(
          body.provisioning
            ?.foodPreferences
        ),
      drinks:
        cleanText(
          body.provisioning
            ?.drinks
        ),
    },
    celebration: {
      type:
        cleanText(
          body.celebration
            ?.type
        ),
      date:
        cleanText(
          body.celebration
            ?.date
        ),
      notes:
        cleanText(
          body.celebration
            ?.notes
        ),
    },
    guestPreferences: {
      cabinPreferences:
        cleanText(
          body.guestPreferences
            ?.cabinPreferences
        ),
      childrenDetails:
        cleanText(
          body.guestPreferences
            ?.childrenDetails
        ),
      musicPreferences:
        cleanText(
          body.guestPreferences
            ?.musicPreferences
        ),
      accessibilityRequirements:
        cleanText(
          body.guestPreferences
            ?.accessibilityRequirements
        ),
    },
    specialRequests:
      cleanText(
        body.specialRequests
      ),
    consent: true,
  };
}

function buildConciergeSeeds(
  preferences: ReturnType<
    typeof normalizePreferences
  >
): ConciergeSeed[] {
  const seeds:
    ConciergeSeed[] = [];

  if (
    preferences.travel
      .transferRequested ||
    [
      preferences.travel
        .transferType,
      preferences.travel
        .flightNumber,
      preferences.travel
        .arrivalAirport,
      preferences.travel
        .arrivalTime,
      preferences.travel
        .pickupLocation,
    ].some(Boolean)
  ) {
    seeds.push({
      key:
        "guest-travel",
      category:
        "transfer",
      title:
        "Guest arrival & transfer",
      description:
        lines([
          preferences.travel
            .transferType
            ? `Transfer: ${preferences.travel.transferType}`
            : null,
          preferences.travel
            .flightNumber
            ? `Flight: ${preferences.travel.flightNumber}`
            : null,
          preferences.travel
            .arrivalAirport
            ? `Arrival airport: ${preferences.travel.arrivalAirport}`
            : null,
          preferences.travel
            .arrivalTime
            ? `Arrival time: ${preferences.travel.arrivalTime}`
            : null,
          preferences.travel
            .pickupLocation
            ? `Pickup: ${preferences.travel.pickupLocation}`
            : null,
        ]),
      priority:
        "high",
    });
  }

  if (
    preferences.dining
      .restaurantsRequested ||
    preferences.dining
      .restaurantNotes
  ) {
    seeds.push({
      key:
        "guest-dining",
      category:
        "restaurant",
      title:
        "Guest dining requests",
      description:
        preferences.dining
          .restaurantNotes ??
        "Guest requested restaurant planning.",
      priority:
        "normal",
    });
  }

  if (
    preferences.activities
      .selected.length > 0 ||
    preferences.activities
      .notes
  ) {
    seeds.push({
      key:
        "guest-activities",
      category:
        "activity",
      title:
        "Guest activities",
      description:
        lines([
          preferences.activities
            .selected.length >
          0
            ? `Requested: ${preferences.activities.selected.join(
                ", "
              )}`
            : null,
          preferences.activities
            .notes,
        ]),
      priority:
        "normal",
    });
  }

  if (
    [
      preferences.provisioning
        .dietaryRequirements,
      preferences.provisioning
        .allergies,
      preferences.provisioning
        .foodPreferences,
      preferences.provisioning
        .drinks,
    ].some(Boolean)
  ) {
    seeds.push({
      key:
        "guest-provisioning",
      category:
        "provisioning",
      title:
        "Guest provisioning preferences",
      description:
        lines([
          preferences.provisioning
            .dietaryRequirements
            ? `Dietary: ${preferences.provisioning.dietaryRequirements}`
            : null,
          preferences.provisioning
            .allergies
            ? `Allergies: ${preferences.provisioning.allergies}`
            : null,
          preferences.provisioning
            .foodPreferences
            ? `Food: ${preferences.provisioning.foodPreferences}`
            : null,
          preferences.provisioning
            .drinks
            ? `Drinks: ${preferences.provisioning.drinks}`
            : null,
        ]),
      priority:
        preferences.provisioning
          .allergies
          ? "high"
          : "normal",
    });
  }

  if (
    [
      preferences.celebration
        .type,
      preferences.celebration
        .date,
      preferences.celebration
        .notes,
    ].some(Boolean)
  ) {
    seeds.push({
      key:
        "guest-celebration",
      category:
        "special_request",
      title:
        "Celebration request",
      description:
        lines([
          preferences.celebration
            .type
            ? `Occasion: ${preferences.celebration.type}`
            : null,
          preferences.celebration
            .date
            ? `Date: ${preferences.celebration.date}`
            : null,
          preferences.celebration
            .notes,
        ]),
      priority:
        "high",
    });
  }

  if (
    [
      preferences.guestPreferences
        .cabinPreferences,
      preferences.guestPreferences
        .childrenDetails,
      preferences.guestPreferences
        .musicPreferences,
      preferences.guestPreferences
        .accessibilityRequirements,
    ].some(Boolean)
  ) {
    seeds.push({
      key:
        "guest-onboard-preferences",
      category:
        "crew_coordination",
      title:
        "Guest onboard preferences",
      description:
        lines([
          preferences.guestPreferences
            .cabinPreferences
            ? `Cabins: ${preferences.guestPreferences.cabinPreferences}`
            : null,
          preferences.guestPreferences
            .childrenDetails
            ? `Children: ${preferences.guestPreferences.childrenDetails}`
            : null,
          preferences.guestPreferences
            .musicPreferences
            ? `Music: ${preferences.guestPreferences.musicPreferences}`
            : null,
          preferences.guestPreferences
            .accessibilityRequirements
            ? `Accessibility: ${preferences.guestPreferences.accessibilityRequirements}`
            : null,
        ]),
      priority:
        preferences.guestPreferences
          .accessibilityRequirements
          ? "high"
          : "normal",
    });
  }

  if (
    preferences.specialRequests
  ) {
    seeds.push({
      key:
        "guest-special-request",
      category:
        "special_request",
      title:
        "Guest special request",
      description:
        preferences.specialRequests,
      priority:
        "normal",
    });
  }

  return seeds;
}

function lines(
  values:
    Array<
      string | null
    >
) {
  return values
    .filter(
      (
        value
      ): value is string =>
        Boolean(value)
    )
    .join("\n");
}

function hashToken(
  token: string
) {
  return createHash(
    "sha256"
  )
    .update(token)
    .digest("hex");
}

async function readToken(
  context: RouteContext
) {
  const params =
    await Promise.resolve(
      context.params
    );

  return (
    params.token?.trim() ||
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

function unavailable() {
  return NextResponse.json(
    {
      success: false,
      error:
        "This private guest portal is unavailable, expired, or has been replaced.",
    },
    {
      status: 404,
      headers:
        publicNoStoreHeaders(),
    }
  );
}

function publicNoStoreHeaders() {
  return {
    "Cache-Control":
      "no-store, max-age=0",
  };
}