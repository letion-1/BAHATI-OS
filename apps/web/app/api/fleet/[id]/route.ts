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

type RouteContext = {
  params:
    | Promise<{
        id: string;
      }>
    | {
        id: string;
      };
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
        {
          status: 400,
        }
      );
    }

    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const [fleetResult, availabilityResult] =
      await Promise.all([
        supabase
          .from("fleet")
          .select("id, name")
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
          .order("start_date", {
            ascending: true,
          }),
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

    if (!fleetResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: "Yacht not found.",
        },
        {
          status: 404,
        }
      );
    }

    const yacht =
      fleetResult.data as unknown as FleetRow;

    const availability =
      (availabilityResult.data ??
        []) as unknown as AvailabilityRow[];

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
        .order("name", {
          ascending: true,
        });

      if (sourcesResult.error) {
        throw new Error(
          `Could not load yacht sources: ${sourcesResult.error.message}`
        );
      }

      sources =
        (sourcesResult.data ??
          []) as unknown as SourceRow[];
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

    const serializedAvailability = availability.map(
      (row) => {
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
      }
    );

    return NextResponse.json(
      {
        success: true,

        yacht: {
          id: yacht.id,
          name: yacht.name,
          status,

          overview: {
            availabilityCount: availability.length,
            futureAvailabilityCount:
              futureWindows.length,
            historicalAvailabilityCount:
              historicalWindows.length,
            sourceCount: sources.length,
            availableCount:
              statusCounts.available,
            bookedCount:
              statusCounts.booked,
            optionCount:
              statusCounts.option,
            provisionalCount:
              statusCounts.provisional,
            maintenanceCount:
              statusCounts.maintenance,
            unavailableCount:
              statusCounts.unavailable,
          },

          rates: {
            lowestWeeklyRate,
            highestWeeklyRate,
            currency: primaryCurrency,
          },

          nextAvailable: nextAvailableWindow
            ? {
                id: nextAvailableWindow.id,
                startDate:
                  nextAvailableWindow.start_date,
                endDate:
                  nextAvailableWindow.end_date,
                weeklyRate:
                  nextAvailableWindow.weekly_rate,
                currency:
                  nextAvailableWindow.currency ??
                  primaryCurrency,
              }
            : null,

          nextBooking: nextBookedWindow
            ? {
                id: nextBookedWindow.id,
                startDate:
                  nextBookedWindow.start_date,
                endDate:
                  nextBookedWindow.end_date,
                weeklyRate:
                  nextBookedWindow.weekly_rate,
                currency:
                  nextBookedWindow.currency ??
                  primaryCurrency,
              }
            : null,

          statusCounts,
          sources: serializedSources,
          availability: serializedAvailability,
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
    if (isAuthenticationRequiredError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        {
          status: error.status,
        }
      );
    }

    if (isWorkspaceAccessError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        {
          status: error.status,
        }
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Could not load yacht details.";

    console.error("Yacht detail API error:", error);

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

  const day = String(date.getDate()).padStart(
    2,
    "0"
  );

  return `${year}-${month}-${day}`;
}