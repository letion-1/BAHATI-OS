import { NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AvailabilityStatus =
  | "available"
  | "provisional"
  | "option"
  | "booked"
  | "unavailable"
  | "maintenance";

type FleetRow = {
  id: string;
  name: string;
  yacht_type: string | null;
  builder: string | null;
  model: string | null;
  build_year: number | null;
  length_meters: number | string | null;
  beam_meters: number | string | null;
  draft_meters: number | string | null;
  cruising_speed_knots: number | string | null;
  fuel_consumption_lph: number | string | null;
  flag: string | null;
  guest_capacity: number | null;
  sleeping_guests: number | null;
  cabin_count: number | null;
  crew_count: number | null;
  home_port: string | null;
  cruising_regions: string[] | null;
  hero_image_url: string | null;
  description: string | null;
  low_season_rate: number | string | null;
  high_season_rate: number | string | null;
  standard_rate_currency: string | null;
  default_apa_percent: number | string | null;
  profile_updated_at: string | null;
};

type AvailabilityRow = {
  id: string;
  fleet_id: string;
  source_id: string | null;
  start_date: string;
  end_date: string;
  status: AvailabilityStatus;
  weekly_rate: number | null;
  currency: string | null;
  created_at: string | null;
};

type SourceRow = {
  id: string;
  name: string;
  source_type: string;
  status: string | null;
  configuration: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

type YachtImageRow = {
  id: string;
  storage_path: string;
  image_url: string;
  category: string;
  is_hero: boolean;
  position: number;
  alt_text: string | null;
  created_at: string;
  updated_at: string;
};

type YachtToyRow = {
  id: string;
  name: string;
  position: number;
};

type YachtCabinRow = {
  id: string;
  cabin_type: string;
  cabin_count: number;
  position: number;
};

type RouteContext = {
  params:
    | Promise<{
        id: string;
      }>
    | {
        id: string;
      };
};

type PatchBody = {
  name?: unknown;
  description?: unknown;
  yachtType?: unknown;
  builder?: unknown;
  model?: unknown;
  buildYear?: unknown;
  lengthMeters?: unknown;
  beamMeters?: unknown;
  draftMeters?: unknown;
  cruisingSpeedKnots?: unknown;
  fuelConsumptionLph?: unknown;
  flag?: unknown;
  guestCapacity?: unknown;
  sleepingGuests?: unknown;
  cabinCount?: unknown;
  crewCount?: unknown;
  homePort?: unknown;
  cruisingRegions?: unknown;
  lowSeasonRate?: unknown;
  highSeasonRate?: unknown;
  standardRateCurrency?: unknown;
  defaultApaPercent?: unknown;
  toys?: unknown;
  cabinConfiguration?: unknown;
};

const statusPriority: Record<AvailabilityStatus, number> = {
  booked: 6,
  option: 5,
  provisional: 4,
  maintenance: 3,
  unavailable: 2,
  available: 1,
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const params = await Promise.resolve(context.params);
    const yachtId = params.id?.trim();

    if (!yachtId) {
      return NextResponse.json(
        {
          success: false,
          error: "A yacht ID is required.",
        },
        { status: 400 }
      );
    }

    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const [
      fleetResult,
      availabilityResult,
      imagesResult,
      toysResult,
      cabinsResult,
    ] = await Promise.all([
      supabase
        .from("fleet")
        .select(
          [
            "id",
            "name",
            "yacht_type",
            "builder",
            "model",
            "build_year",
            "length_meters",
            "beam_meters",
            "draft_meters",
            "cruising_speed_knots",
            "fuel_consumption_lph",
            "flag",
            "guest_capacity",
            "sleeping_guests",
            "cabin_count",
            "crew_count",
            "home_port",
            "cruising_regions",
            "hero_image_url",
            "description",
            "low_season_rate",
            "high_season_rate",
            "standard_rate_currency",
            "default_apa_percent",
            "profile_updated_at",
          ].join(",")
        )
        .eq("company_id", workspace.companyId)
        .eq("id", yachtId)
        .maybeSingle(),

      supabase
        .from("availability")
        .select(
          [
            "id",
            "fleet_id",
            "source_id",
            "start_date",
            "end_date",
            "status",
            "weekly_rate",
            "currency",
            "created_at",
          ].join(",")
        )
        .eq("company_id", workspace.companyId)
        .eq("fleet_id", yachtId)
        .order("start_date", { ascending: true }),

      supabase
        .from("yacht_images")
        .select(
          [
            "id",
            "storage_path",
            "image_url",
            "category",
            "is_hero",
            "position",
            "alt_text",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .eq("company_id", workspace.companyId)
        .eq("fleet_id", yachtId)
        .order("is_hero", { ascending: false })
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),

      supabase
        .from("yacht_toys")
        .select("id, name, position")
        .eq("company_id", workspace.companyId)
        .eq("fleet_id", yachtId)
        .order("position", { ascending: true }),

      supabase
        .from("yacht_cabin_configuration")
        .select("id, cabin_type, cabin_count, position")
        .eq("company_id", workspace.companyId)
        .eq("fleet_id", yachtId)
        .order("position", { ascending: true }),
    ]);

    if (fleetResult.error) {
      throw new Error(
        `Could not load yacht: ${fleetResult.error.message}`
      );
    }

    if (availabilityResult.error) {
      throw new Error(
        `Could not load yacht availability: ${availabilityResult.error.message}`
      );
    }

    if (imagesResult.error) {
      throw new Error(
        `Could not load yacht images: ${imagesResult.error.message}`
      );
    }

    if (toysResult.error) {
      throw new Error(
        `Could not load yacht toys: ${toysResult.error.message}`
      );
    }

    if (cabinsResult.error) {
      throw new Error(
        `Could not load yacht cabin configuration: ${cabinsResult.error.message}`
      );
    }

    if (!fleetResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: "Yacht not found.",
        },
        { status: 404 }
      );
    }

    const yacht = fleetResult.data as unknown as FleetRow;
    const availability =
      (availabilityResult.data ?? []) as unknown as AvailabilityRow[];
    const images =
      (imagesResult.data ?? []) as unknown as YachtImageRow[];
    const toys =
      (toysResult.data ?? []) as unknown as YachtToyRow[];
    const cabins =
      (cabinsResult.data ?? []) as unknown as YachtCabinRow[];

    const sourceIds = Array.from(
      new Set(
        availability
          .map((row) => row.source_id)
          .filter(
            (sourceId): sourceId is string =>
              typeof sourceId === "string" &&
              sourceId.length > 0
          )
      )
    );

    let sources: SourceRow[] = [];

    if (sourceIds.length > 0) {
      const sourcesResult = await supabase
        .from("data_sources")
        .select(
          [
            "id",
            "name",
            "source_type",
            "status",
            "configuration",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .eq("company_id", workspace.companyId)
        .in("id", sourceIds)
        .order("name", { ascending: true });

      if (sourcesResult.error) {
        throw new Error(
          `Could not load yacht sources: ${sourcesResult.error.message}`
        );
      }

      sources =
        (sourcesResult.data ?? []) as unknown as SourceRow[];
    }

    const sourceById = new Map(
      sources.map((source) => [source.id, source])
    );

    const today = formatDateKey(new Date());

    const currentWindows = availability.filter(
      (row) =>
        row.start_date <= today &&
        row.end_date >= today
    );

    const futureWindows = availability.filter(
      (row) => row.end_date >= today
    );

    const historicalWindows = availability.filter(
      (row) => row.end_date < today
    );

    const status = getEffectiveStatus(
      currentWindows.length > 0
        ? currentWindows
        : futureWindows
    );

    const nextAvailableWindow =
      futureWindows.find(
        (row) => row.status === "available"
      ) ?? null;

    const nextBookedWindow =
      futureWindows.find(
        (row) => row.status === "booked"
      ) ?? null;

    const pricedWindows = availability.filter(
      (row) =>
        row.weekly_rate !== null &&
        Number.isFinite(row.weekly_rate)
    );

    const lowestWeeklyRate =
      pricedWindows.length > 0
        ? Math.min(
            ...pricedWindows.map(
              (row) => row.weekly_rate as number
            )
          )
        : null;

    const highestWeeklyRate =
      pricedWindows.length > 0
        ? Math.max(
            ...pricedWindows.map(
              (row) => row.weekly_rate as number
            )
          )
        : null;

    const primaryCurrency =
      cleanText(yacht.standard_rate_currency) ??
      pricedWindows.find((row) => row.currency)?.currency ??
      availability.find((row) => row.currency)?.currency ??
      "EUR";

    const statusCounts = countStatuses(availability);

    const serializedSources = sources.map((source) => {
      const sourceWindows = availability.filter(
        (row) => row.source_id === source.id
      );

      return {
        id: source.id,
        name: source.name,
        type: source.source_type,
        status: source.status ?? "unknown",
        lastSyncedAt: getLastSyncedAt(source),
        error: getLastSyncError(source),
        availabilityCount: sourceWindows.length,
      };
    });

    const serializedAvailability = availability.map((row) => {
      const source = row.source_id
        ? sourceById.get(row.source_id) ?? null
        : null;

      return {
        id: row.id,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status,
        weeklyRate: row.weekly_rate,
        currency: row.currency ?? "EUR",
        isCurrent:
          row.start_date <= today &&
          row.end_date >= today,
        isPast: row.end_date < today,
        source: source
          ? {
              id: source.id,
              name: source.name,
              type: source.source_type,
            }
          : null,
      };
    });

    const heroImage =
      images.find((image) => image.is_hero) ?? null;

    return NextResponse.json(
      {
        success: true,
        yacht: {
          id: yacht.id,
          name: yacht.name,
          status,

          overview: {
            availabilityCount: availability.length,
            futureAvailabilityCount: futureWindows.length,
            historicalAvailabilityCount: historicalWindows.length,
            sourceCount: sources.length,
            availableCount: statusCounts.available,
            bookedCount: statusCounts.booked,
            optionCount: statusCounts.option,
            provisionalCount: statusCounts.provisional,
            maintenanceCount: statusCounts.maintenance,
            unavailableCount: statusCounts.unavailable,
          },

          rates: {
            lowestWeeklyRate,
            highestWeeklyRate,
            currency: primaryCurrency,
          },

          nextAvailable: nextAvailableWindow
            ? {
                id: nextAvailableWindow.id,
                startDate: nextAvailableWindow.start_date,
                endDate: nextAvailableWindow.end_date,
                weeklyRate: nextAvailableWindow.weekly_rate,
                currency:
                  nextAvailableWindow.currency ?? primaryCurrency,
              }
            : null,

          nextBooking: nextBookedWindow
            ? {
                id: nextBookedWindow.id,
                startDate: nextBookedWindow.start_date,
                endDate: nextBookedWindow.end_date,
                weeklyRate: nextBookedWindow.weekly_rate,
                currency:
                  nextBookedWindow.currency ?? primaryCurrency,
              }
            : null,

          statusCounts,
          sources: serializedSources,
          availability: serializedAvailability,

          profile: {
            description: cleanText(yacht.description),
            yachtType: cleanText(yacht.yacht_type),
            builder: cleanText(yacht.builder),
            model: cleanText(yacht.model),
            buildYear: toFiniteNumber(yacht.build_year),
            lengthMeters: toFiniteNumber(yacht.length_meters),
            beamMeters: toFiniteNumber(yacht.beam_meters),
            draftMeters: toFiniteNumber(yacht.draft_meters),
            cruisingSpeedKnots: toFiniteNumber(
              yacht.cruising_speed_knots
            ),
            fuelConsumptionLph: toFiniteNumber(
              yacht.fuel_consumption_lph
            ),
            flag: cleanText(yacht.flag),
            guestCapacity: toFiniteNumber(yacht.guest_capacity),
            sleepingGuests: toFiniteNumber(yacht.sleeping_guests),
            cabinCount: toFiniteNumber(yacht.cabin_count),
            crewCount: toFiniteNumber(yacht.crew_count),
            homePort: cleanText(yacht.home_port),
            cruisingRegions: Array.isArray(yacht.cruising_regions)
              ? yacht.cruising_regions.filter(
                  (value): value is string =>
                    typeof value === "string" &&
                    value.trim().length > 0
                )
              : [],
            lowSeasonRate: toFiniteNumber(yacht.low_season_rate),
            highSeasonRate: toFiniteNumber(yacht.high_season_rate),
            standardRateCurrency:
              cleanText(yacht.standard_rate_currency) ??
              primaryCurrency,
            defaultApaPercent: toFiniteNumber(
              yacht.default_apa_percent
            ),
            updatedAt: yacht.profile_updated_at,
          },

          media: {
            heroImageUrl:
              cleanText(yacht.hero_image_url) ??
              heroImage?.image_url ??
              null,
            heroImageId: heroImage?.id ?? null,
            images: images.map((image) => ({
              id: image.id,
              url: image.image_url,
              category: image.category,
              isHero: image.is_hero,
              position: image.position,
              altText: image.alt_text,
              createdAt: image.created_at,
              updatedAt: image.updated_at,
            })),
          },

          toys: toys.map((toy) => ({
            id: toy.id,
            name: toy.name,
            position: toy.position,
          })),

          cabinConfiguration: cabins.map((cabin) => ({
            id: cabin.id,
            type: cabin.cabin_type,
            count: cabin.cabin_count,
            position: cabin.position,
          })),
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not load yacht details."
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext
) {
  try {
    const params = await Promise.resolve(context.params);
    const yachtId = params.id?.trim();

    if (!yachtId) {
      return NextResponse.json(
        {
          success: false,
          error: "A yacht ID is required.",
        },
        { status: 400 }
      );
    }

    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const body = (await request.json()) as PatchBody;

    const { data: existing, error: existingError } =
      await supabase
        .from("fleet")
        .select("id, name")
        .eq("company_id", workspace.companyId)
        .eq("id", yachtId)
        .maybeSingle();

    if (existingError) {
      throw new Error(
        `Could not load yacht: ${existingError.message}`
      );
    }

    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: "Yacht not found.",
        },
        { status: 404 }
      );
    }

    const update: Record<string, unknown> = {};

    if (hasOwn(body, "name")) {
      const name = cleanText(body.name);

      if (!name) {
        return NextResponse.json(
          {
            success: false,
            error: "Yacht name cannot be empty.",
          },
          { status: 400 }
        );
      }

      update.name = name;
    }

    assignOptionalText(update, "description", body, "description");
    assignOptionalText(update, "yacht_type", body, "yachtType");
    assignOptionalText(update, "builder", body, "builder");
    assignOptionalText(update, "model", body, "model");
    assignOptionalText(update, "flag", body, "flag");
    assignOptionalText(update, "home_port", body, "homePort");
    assignOptionalText(
      update,
      "standard_rate_currency",
      body,
      "standardRateCurrency"
    );

    const numberFields: Array<{
      bodyKey: keyof PatchBody;
      dbKey: string;
      integer?: boolean;
      max?: number;
    }> = [
      {
        bodyKey: "buildYear",
        dbKey: "build_year",
        integer: true,
      },
      {
        bodyKey: "lengthMeters",
        dbKey: "length_meters",
      },
      {
        bodyKey: "beamMeters",
        dbKey: "beam_meters",
      },
      {
        bodyKey: "draftMeters",
        dbKey: "draft_meters",
      },
      {
        bodyKey: "cruisingSpeedKnots",
        dbKey: "cruising_speed_knots",
      },
      {
        bodyKey: "fuelConsumptionLph",
        dbKey: "fuel_consumption_lph",
      },
      {
        bodyKey: "guestCapacity",
        dbKey: "guest_capacity",
        integer: true,
      },
      {
        bodyKey: "sleepingGuests",
        dbKey: "sleeping_guests",
        integer: true,
      },
      {
        bodyKey: "cabinCount",
        dbKey: "cabin_count",
        integer: true,
      },
      {
        bodyKey: "crewCount",
        dbKey: "crew_count",
        integer: true,
      },
      {
        bodyKey: "lowSeasonRate",
        dbKey: "low_season_rate",
      },
      {
        bodyKey: "highSeasonRate",
        dbKey: "high_season_rate",
      },
      {
        bodyKey: "defaultApaPercent",
        dbKey: "default_apa_percent",
        max: 100,
      },
    ];

    for (const field of numberFields) {
      if (!hasOwn(body, field.bodyKey)) {
        continue;
      }

      const parsed = parseOptionalNumber(
        body[field.bodyKey],
        {
          integer: field.integer,
          min: 0,
          max: field.max,
        }
      );

      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            error: `${String(field.bodyKey)} ${parsed.error}`,
          },
          { status: 400 }
        );
      }

      update[field.dbKey] = parsed.value;
    }

    if (hasOwn(body, "cruisingRegions")) {
      if (
        body.cruisingRegions !== null &&
        !Array.isArray(body.cruisingRegions)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "cruisingRegions must be an array of strings.",
          },
          { status: 400 }
        );
      }

      update.cruising_regions = Array.isArray(
        body.cruisingRegions
      )
        ? body.cruisingRegions
            .map(cleanText)
            .filter(
              (value): value is string =>
                typeof value === "string"
            )
        : [];
    }

    const now = new Date().toISOString();

    if (Object.keys(update).length > 0) {
      update.profile_updated_at = now;

      const { error: updateError } = await supabase
        .from("fleet")
        .update(update)
        .eq("company_id", workspace.companyId)
        .eq("id", yachtId);

      if (updateError) {
        throw new Error(
          `Could not update yacht profile: ${updateError.message}`
        );
      }
    }

    if (hasOwn(body, "toys")) {
      const parsedToys = parseToys(body.toys);

      if (!parsedToys.success) {
        return NextResponse.json(
          {
            success: false,
            error: parsedToys.error,
          },
          { status: 400 }
        );
      }

      const { error: deleteToysError } = await supabase
        .from("yacht_toys")
        .delete()
        .eq("company_id", workspace.companyId)
        .eq("fleet_id", yachtId);

      if (deleteToysError) {
        throw new Error(
          `Could not replace yacht toys: ${deleteToysError.message}`
        );
      }

      if (parsedToys.items.length > 0) {
        const { error: insertToysError } = await supabase
          .from("yacht_toys")
          .insert(
            parsedToys.items.map((name, index) => ({
              company_id: workspace.companyId,
              fleet_id: yachtId,
              name,
              position: index + 1,
            }))
          );

        if (insertToysError) {
          throw new Error(
            `Could not save yacht toys: ${insertToysError.message}`
          );
        }
      }
    }

    if (hasOwn(body, "cabinConfiguration")) {
      const parsedCabins = parseCabins(
        body.cabinConfiguration
      );

      if (!parsedCabins.success) {
        return NextResponse.json(
          {
            success: false,
            error: parsedCabins.error,
          },
          { status: 400 }
        );
      }

      const { error: deleteCabinsError } = await supabase
        .from("yacht_cabin_configuration")
        .delete()
        .eq("company_id", workspace.companyId)
        .eq("fleet_id", yachtId);

      if (deleteCabinsError) {
        throw new Error(
          `Could not replace cabin configuration: ${deleteCabinsError.message}`
        );
      }

      if (parsedCabins.items.length > 0) {
        const { error: insertCabinsError } = await supabase
          .from("yacht_cabin_configuration")
          .insert(
            parsedCabins.items.map((item, index) => ({
              company_id: workspace.companyId,
              fleet_id: yachtId,
              cabin_type: item.type,
              cabin_count: item.count,
              position: index + 1,
            }))
          );

        if (insertCabinsError) {
          throw new Error(
            `Could not save cabin configuration: ${insertCabinsError.message}`
          );
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        yachtId,
        updatedAt: now,
      },
      { status: 200 }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Could not update yacht profile."
    );
  }
}

function parseToys(
  value: unknown
):
  | {
      success: true;
      items: string[];
    }
  | {
      success: false;
      error: string;
    } {
  if (value === null) {
    return {
      success: true,
      items: [],
    };
  }

  if (!Array.isArray(value)) {
    return {
      success: false,
      error: "toys must be an array of strings.",
    };
  }

  const items = value
    .map(cleanText)
    .filter(
      (item): item is string =>
        typeof item === "string"
    )
    .slice(0, 100);

  return {
    success: true,
    items,
  };
}

function parseCabins(
  value: unknown
):
  | {
      success: true;
      items: Array<{
        type: string;
        count: number;
      }>;
    }
  | {
      success: false;
      error: string;
    } {
  if (value === null) {
    return {
      success: true,
      items: [],
    };
  }

  if (!Array.isArray(value)) {
    return {
      success: false,
      error:
        "cabinConfiguration must be an array.",
    };
  }

  const items: Array<{
    type: string;
    count: number;
  }> = [];

  for (const raw of value.slice(0, 30)) {
    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw)
    ) {
      return {
        success: false,
        error:
          "Each cabin configuration item must contain a type and count.",
      };
    }

    const record = raw as Record<string, unknown>;
    const type = cleanText(record.type);
    const countResult = parseOptionalNumber(record.count, {
      integer: true,
      min: 0,
    });

    if (
      !type ||
      !countResult.success ||
      countResult.value === null
    ) {
      return {
        success: false,
        error:
          "Each cabin configuration item must contain a valid type and non-negative count.",
      };
    }

    items.push({
      type,
      count: countResult.value,
    });
  }

  return {
    success: true,
    items,
  };
}

function assignOptionalText(
  update: Record<string, unknown>,
  dbKey: string,
  body: PatchBody,
  bodyKey: keyof PatchBody
) {
  if (!hasOwn(body, bodyKey)) {
    return;
  }

  update[dbKey] = cleanText(body[bodyKey]);
}

function hasOwn(
  value: object,
  key: PropertyKey
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function parseOptionalNumber(
  value: unknown,
  options: {
    integer?: boolean;
    min?: number;
    max?: number;
  } = {}
):
  | {
      success: true;
      value: number | null;
    }
  | {
      success: false;
      error: string;
    } {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return {
      success: true,
      value: null,
    };
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(
          String(value).replace(
            /[^\d.-]/g,
            ""
          )
        );

  if (!Number.isFinite(parsed)) {
    return {
      success: false,
      error: "must be a valid number.",
    };
  }

  if (
    options.integer &&
    !Number.isInteger(parsed)
  ) {
    return {
      success: false,
      error: "must be a whole number.",
    };
  }

  if (
    options.min !== undefined &&
    parsed < options.min
  ) {
    return {
      success: false,
      error: `must be at least ${options.min}.`,
    };
  }

  if (
    options.max !== undefined &&
    parsed > options.max
  ) {
    return {
      success: false,
      error: `must be no more than ${options.max}.`,
    };
  }

  return {
    success: true,
    value: parsed,
  };
}

function getEffectiveStatus(
  availability: AvailabilityRow[]
): AvailabilityStatus | "no_availability" {
  if (availability.length === 0) {
    return "no_availability";
  }

  const highestPriority = [...availability].sort(
    (left, right) =>
      statusPriority[right.status] -
      statusPriority[left.status]
  )[0];

  return highestPriority?.status ?? "no_availability";
}

function countStatuses(
  availability: AvailabilityRow[]
): Record<AvailabilityStatus, number> {
  const counts: Record<AvailabilityStatus, number> = {
    available: 0,
    provisional: 0,
    option: 0,
    booked: 0,
    unavailable: 0,
    maintenance: 0,
  };

  for (const row of availability) {
    if (row.status in counts) {
      counts[row.status] += 1;
    }
  }

  return counts;
}

function getLastSyncedAt(
  source: SourceRow
): string | null {
  const configuration = source.configuration;

  if (
    !configuration ||
    typeof configuration !== "object"
  ) {
    return source.updated_at;
  }

  const lastSync = configuration.last_sync;

  if (
    !lastSync ||
    typeof lastSync !== "object" ||
    Array.isArray(lastSync)
  ) {
    return source.updated_at;
  }

  const finishedAt = (
    lastSync as Record<string, unknown>
  ).finished_at;

  return typeof finishedAt === "string"
    ? finishedAt
    : source.updated_at;
}

function getLastSyncError(
  source: SourceRow
): string | null {
  const configuration = source.configuration;

  if (
    !configuration ||
    typeof configuration !== "object"
  ) {
    return null;
  }

  const lastSync = configuration.last_sync;

  if (
    !lastSync ||
    typeof lastSync !== "object" ||
    Array.isArray(lastSync)
  ) {
    return null;
  }

  const syncError = (
    lastSync as Record<string, unknown>
  ).error;

  return typeof syncError === "string"
    ? syncError
    : null;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function cleanText(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  return cleaned || null;
}

function toFiniteNumber(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function handleRouteError(
  error: unknown,
  fallbackMessage: string
) {
  if (isAuthenticationRequiredError(error)) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: error.status }
    );
  }

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

  console.error("Yacht detail API error:", error);

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 500 }
  );
}