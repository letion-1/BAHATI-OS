import { type NextRequest, NextResponse } from "next/server";

import {
  isAuthenticationRequiredError,
} from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

type AvailabilityStatus =
  | "available"
  | "provisional"
  | "option"
  | "booked"
  | "unavailable"
  | "maintenance";

type AvailabilityRow = {
  id: string;
  company_id: string;
  fleet_id: string;
  source_id: string | null;
  external_id: string | null;
  start_date: string;
  end_date: string;
  status: AvailabilityStatus;
  location: string | null;
  region: string | null;
  embarkation_port: string | null;
  disembarkation_port: string | null;
  weekly_rate: number | null;
  currency: string;
  notes: string | null;
  last_synced_at: string | null;
  updated_at: string | null;
};

type FleetRow = {
  id: string;
  name: string;
  slug: string | null;
  yacht_type: string | null;
  builder: string | null;
  model: string | null;
  build_year: number | null;
  length_meters: number | null;
  guest_capacity: number | null;
  sleeping_guests: number | null;
  cabin_count: number | null;
  home_port: string | null;
  cruising_regions: string[] | null;
  weekly_rate_low: number | null;
  weekly_rate_high: number | null;
  currency: string;
  hero_image_url: string | null;
  brochure_url: string | null;
  status: string;
  last_synced_at: string | null;
};

type SourceRow = {
  id: string;
  name: string;
  source_type: string;
  status: string | null;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function GET(request: NextRequest) {
  try {
    const filters = parseFilters(request);

    if ("response" in filters) {
      return filters.response;
    }

    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    let availabilityQuery = supabase
      .from("availability")
      .select(
        [
          "id",
          "company_id",
          "fleet_id",
          "source_id",
          "external_id",
          "start_date",
          "end_date",
          "status",
          "location",
          "region",
          "embarkation_port",
          "disembarkation_port",
          "weekly_rate",
          "currency",
          "notes",
          "last_synced_at",
          "updated_at",
        ].join(",")
      )
      .eq("company_id", workspace.companyId)
      .order("start_date", { ascending: true })
      .limit(filters.limit);

    /*
     * Charter windows use checkout-style boundaries. A record ending on the
     * requested start date merely touches the requested period and therefore
     * does not overlap it.
     */
    if (filters.startDate && filters.endDate) {
      availabilityQuery = availabilityQuery
        .lt("start_date", filters.endDate)
        .gt("end_date", filters.startDate);
    } else if (filters.startDate) {
      availabilityQuery = availabilityQuery.gt(
        "end_date",
        filters.startDate
      );
    } else if (filters.endDate) {
      availabilityQuery = availabilityQuery.lt(
        "start_date",
        filters.endDate
      );
    }

    const {
      data: availabilityData,
      error: availabilityError,
    } = await availabilityQuery;

    if (availabilityError) {
      throw new Error(
        `Could not load availability: ${availabilityError.message}`
      );
    }

    const allRows =
      (availabilityData ?? []) as unknown as AvailabilityRow[];

    const requiresContinuousAvailability =
      Boolean(filters.startDate && filters.endDate) &&
      filters.status === "available";

    let filteredRows = allRows;

    if (
      requiresContinuousAvailability &&
      filters.startDate &&
      filters.endDate
    ) {
      const rowsByYacht = groupRowsByFleetId(allRows);
      const eligibleFleetIds = new Set<string>();

      for (const [fleetId, yachtRows] of rowsByYacht) {
        if (
          isFullyAvailable(
            yachtRows,
            filters.startDate,
            filters.endDate
          )
        ) {
          eligibleFleetIds.add(fleetId);
        }
      }

      filteredRows = allRows.filter(
        (row) =>
          eligibleFleetIds.has(row.fleet_id) &&
          row.status === "available"
      );
    } else if (filters.status) {
      filteredRows = allRows.filter(
        (row) => row.status === filters.status
      );
    }

    const fleetIds = uniqueStrings(
      filteredRows.map((row) => row.fleet_id)
    );

    const sourceIds = uniqueStrings(
      filteredRows.map((row) => row.source_id)
    );

    const [fleetById, sourcesById] = await Promise.all([
      loadFleet({
        supabase,
        companyId: workspace.companyId,
        fleetIds,
      }),
      loadSources({
        supabase,
        companyId: workspace.companyId,
        sourceIds,
      }),
    ]);

    const records = filteredRows
      .map((row) => {
        const yacht = fleetById.get(row.fleet_id) ?? null;
        const source = row.source_id
          ? sourcesById.get(row.source_id) ?? null
          : null;

        return {
          id: row.id,
          externalId: row.external_id,
          startDate: row.start_date,
          endDate: row.end_date,
          status: row.status,
          location: row.location,
          region: row.region,
          embarkationPort: row.embarkation_port,
          disembarkationPort: row.disembarkation_port,
          weeklyRate: row.weekly_rate,
          currency: row.currency,
          notes: row.notes,
          lastSyncedAt: row.last_synced_at ?? row.updated_at,

          yacht: yacht
            ? {
                id: yacht.id,
                name: yacht.name,
                slug: yacht.slug,
                yachtType: yacht.yacht_type,
                builder: yacht.builder,
                model: yacht.model,
                buildYear: yacht.build_year,
                lengthMeters: yacht.length_meters,
                guestCapacity: yacht.guest_capacity,
                sleepingGuests: yacht.sleeping_guests,
                cabinCount: yacht.cabin_count,
                homePort: yacht.home_port,
                cruisingRegions: yacht.cruising_regions ?? [],
                weeklyRateLow: yacht.weekly_rate_low,
                weeklyRateHigh: yacht.weekly_rate_high,
                currency: yacht.currency,
                heroImageUrl: yacht.hero_image_url,
                brochureUrl: yacht.brochure_url,
                status: yacht.status,
                lastSyncedAt: yacht.last_synced_at,
              }
            : null,

          source: source
            ? {
                id: source.id,
                name: source.name,
                type: source.source_type,
                status: source.status,
              }
            : null,
        };
      })
      .filter((record) => {
        if (!filters.search) {
          return true;
        }

        const searchableText = [
          record.yacht?.name,
          record.yacht?.builder,
          record.yacht?.model,
          record.yacht?.homePort,
          ...(record.yacht?.cruisingRegions ?? []),
          record.location,
          record.region,
          record.embarkationPort,
          record.disembarkationPort,
          record.source?.name,
          record.status,
          record.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(filters.search);
      });

    const yachtIds = new Set(
      records
        .map((record) => record.yacht?.id)
        .filter(
          (value): value is string => typeof value === "string"
        )
    );

    const availableYachtIds = new Set(
      records
        .filter((record) => record.status === "available")
        .map((record) => record.yacht?.id)
        .filter(
          (value): value is string => typeof value === "string"
        )
    );

    const recentlyUpdated = records.filter((record) =>
      isToday(record.lastSyncedAt)
    ).length;

    return NextResponse.json(
      {
        success: true,
        workspace: {
          companyId: workspace.companyId,
          companyName: workspace.companyName,
          companySlug: workspace.companySlug,
          defaultCurrency: workspace.defaultCurrency,
          timezone: workspace.timezone,
          role: workspace.role,
        },
        filters: {
          search: filters.search || null,
          startDate: filters.startDate,
          endDate: filters.endDate,
          status: filters.status,
          limit: filters.limit,
          continuousAvailability: requiresContinuousAvailability,
        },
        stats: {
          yachtCount: yachtIds.size,
          availableYachtCount: availableYachtIds.size,
          availabilityWindowCount: records.length,
          recentlyUpdated,
        },
        data: records,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    if (isAuthenticationRequiredError(error)) {
      return NextResponse.json(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        { status: error.status }
      );
    }

    if (isWorkspaceAccessError(error)) {
      return NextResponse.json(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        { status: error.status }
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "An unexpected availability error occurred.";

    console.error("Availability API error:", error);

    return NextResponse.json(
      {
        success: false,
        code: "AVAILABILITY_QUERY_FAILED",
        error: message,
      },
      { status: 500 }
    );
  }
}

function parseFilters(request: NextRequest):
  | {
      search: string;
      startDate: string | null;
      endDate: string | null;
      status: AvailabilityStatus | null;
      limit: number;
    }
  | { response: NextResponse } {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search")?.trim().toLowerCase() ?? "";
  const rawStartDate = searchParams.get("startDate");
  const rawEndDate = searchParams.get("endDate");
  const rawStatus = searchParams.get("status");
  const startDate = normalizeDate(rawStartDate);
  const endDate = normalizeDate(rawEndDate);
  const status = normalizeStatus(rawStatus);
  const limit = normalizeLimit(searchParams.get("limit"));

  if (rawStartDate && !startDate) {
    return {
      response: NextResponse.json(
        {
          success: false,
          code: "INVALID_START_DATE",
          error: "startDate must use YYYY-MM-DD format.",
        },
        { status: 400 }
      ),
    };
  }

  if (rawEndDate && !endDate) {
    return {
      response: NextResponse.json(
        {
          success: false,
          code: "INVALID_END_DATE",
          error: "endDate must use YYYY-MM-DD format.",
        },
        { status: 400 }
      ),
    };
  }

  if (startDate && endDate && startDate > endDate) {
    return {
      response: NextResponse.json(
        {
          success: false,
          code: "INVALID_DATE_RANGE",
          error: "startDate cannot be later than endDate.",
        },
        { status: 400 }
      ),
    };
  }

  if (rawStatus && !status) {
    return {
      response: NextResponse.json(
        {
          success: false,
          code: "INVALID_AVAILABILITY_STATUS",
          error: "The requested availability status is invalid.",
        },
        { status: 400 }
      ),
    };
  }

  return {
    search,
    startDate,
    endDate,
    status,
    limit,
  };
}

function groupRowsByFleetId(
  rows: AvailabilityRow[]
): Map<string, AvailabilityRow[]> {
  const groups = new Map<string, AvailabilityRow[]>();

  for (const row of rows) {
    const existing = groups.get(row.fleet_id);

    if (existing) {
      existing.push(row);
    } else {
      groups.set(row.fleet_id, [row]);
    }
  }

  return groups;
}

function isFullyAvailable(
  rows: AvailabilityRow[],
  requestedStart: string,
  requestedEnd: string
): boolean {
  const requestedStartDate = parseDate(requestedStart);
  const requestedEndDate = parseDate(requestedEnd);

  if (!requestedStartDate || !requestedEndDate) {
    return false;
  }

  const hasBlockingWindow = rows.some(
    (row) =>
      row.status !== "available" &&
      rangesOverlap(
        row.start_date,
        row.end_date,
        requestedStart,
        requestedEnd
      )
  );

  if (hasBlockingWindow) {
    return false;
  }

  const availableIntervals = rows
    .filter(
      (row) =>
        row.status === "available" &&
        rangesOverlap(
          row.start_date,
          row.end_date,
          requestedStart,
          requestedEnd
        )
    )
    .map((row) => ({
      start: parseDate(row.start_date),
      end: parseDate(row.end_date),
    }))
    .filter(
      (
        interval
      ): interval is {
        start: Date;
        end: Date;
      } =>
        interval.start instanceof Date &&
        interval.end instanceof Date
    )
    .sort(
      (first, second) =>
        first.start.getTime() - second.start.getTime()
    );

  if (availableIntervals.length === 0) {
    return false;
  }

  let coverageStart = availableIntervals[0].start;
  let coverageEnd = availableIntervals[0].end;

  for (let index = 1; index < availableIntervals.length; index += 1) {
    const interval = availableIntervals[index];

    if (interval.start <= coverageEnd) {
      if (interval.end > coverageEnd) {
        coverageEnd = interval.end;
      }

      continue;
    }

    if (
      coverageStart <= requestedStartDate &&
      coverageEnd >= requestedEndDate
    ) {
      return true;
    }

    coverageStart = interval.start;
    coverageEnd = interval.end;
  }

  return (
    coverageStart <= requestedStartDate &&
    coverageEnd >= requestedEndDate
  );
}

function rangesOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string
): boolean {
  return firstStart < secondEnd && firstEnd > secondStart;
}

async function loadFleet({
  supabase,
  companyId,
  fleetIds,
}: {
  supabase: SupabaseClient;
  companyId: string;
  fleetIds: string[];
}) {
  const fleetById = new Map<string, FleetRow>();

  if (fleetIds.length === 0) {
    return fleetById;
  }

  const { data, error } = await supabase
    .from("fleet")
    .select(
      [
        "id",
        "name",
        "slug",
        "yacht_type",
        "builder",
        "model",
        "build_year",
        "length_meters",
        "guest_capacity",
        "sleeping_guests",
        "cabin_count",
        "home_port",
        "cruising_regions",
        "weekly_rate_low",
        "weekly_rate_high",
        "currency",
        "hero_image_url",
        "brochure_url",
        "status",
        "last_synced_at",
      ].join(",")
    )
    .eq("company_id", companyId)
    .in("id", fleetIds);

  if (error) {
    throw new Error(`Could not load fleet details: ${error.message}`);
  }

  for (const row of (data ?? []) as unknown as FleetRow[]) {
    fleetById.set(row.id, row);
  }

  return fleetById;
}

async function loadSources({
  supabase,
  companyId,
  sourceIds,
}: {
  supabase: SupabaseClient;
  companyId: string;
  sourceIds: string[];
}) {
  const sourcesById = new Map<string, SourceRow>();

  if (sourceIds.length === 0) {
    return sourcesById;
  }

  const { data, error } = await supabase
    .from("data_sources")
    .select("id, name, source_type, status")
    .eq("company_id", companyId)
    .in("id", sourceIds);

  if (error) {
    throw new Error(`Could not load source details: ${error.message}`);
  }

  for (const row of (data ?? []) as unknown as SourceRow[]) {
    sourcesById.set(row.id, row);
  }

  return sourcesById;
}

function normalizeDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const parsed = parseDate(trimmed);

  return parsed ? trimmed : null;
}

function normalizeStatus(
  value: string | null
): AvailabilityStatus | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const allowed = new Set<AvailabilityStatus>([
    "available",
    "provisional",
    "option",
    "booked",
    "unavailable",
    "maintenance",
  ]);

  return allowed.has(normalized as AvailabilityStatus)
    ? (normalized as AvailabilityStatus)
    : null;
}

function normalizeLimit(value: string | null): number {
  if (!value) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function uniqueStrings(
  values: Array<string | null | undefined>
): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0
      )
    ),
  ];
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function isToday(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}