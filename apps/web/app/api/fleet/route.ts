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
  created_at?: string | null;
};

type SourceRow = {
  id: string;
  name: string;
  source_type: string;
  status: string | null;
  updated_at: string | null;
};

const statusPriority: Record<AvailabilityStatus, number> = {
  booked: 6,
  option: 5,
  provisional: 4,
  maintenance: 3,
  unavailable: 2,
  available: 1,
};

export async function GET() {
  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const today = formatDateKey(new Date());

    const [fleetResult, availabilityResult, sourcesResult] =
      await Promise.all([
        supabase
          .from("fleet")
          .select("id, name")
          .eq("company_id", workspace.companyId)
          .order("name", {
            ascending: true,
          }),

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
            ].join(",")
          )
          .eq("company_id", workspace.companyId)
          .gte("end_date", today)
          .order("start_date", {
            ascending: true,
          }),

        supabase
          .from("data_sources")
          .select(
            [
              "id",
              "name",
              "source_type",
              "status",
              "updated_at",
            ].join(",")
          )
          .eq("company_id", workspace.companyId)
          .order("name", {
            ascending: true,
          }),
      ]);

    if (fleetResult.error) {
      throw new Error(
        `Could not load fleet: ${fleetResult.error.message}`
      );
    }

    if (availabilityResult.error) {
      throw new Error(
        `Could not load availability: ${availabilityResult.error.message}`
      );
    }

    if (sourcesResult.error) {
      throw new Error(
        `Could not load data sources: ${sourcesResult.error.message}`
      );
    }

    const fleet =
      (fleetResult.data ?? []) as unknown as FleetRow[];

    const availability =
      (availabilityResult.data ??
        []) as unknown as AvailabilityRow[];

    const sources =
      (sourcesResult.data ?? []) as unknown as SourceRow[];

    const sourceById = new Map(
      sources.map((source) => [source.id, source])
    );

    /*
     * One query for every profile, rather than one per yacht. A hundred-hull
     * fleet would otherwise mean a hundred round trips to render one page.
     */
    const accessResult = await supabase
      .from("yacht_access_profiles")
      .select("fleet_id, access_type, client_proposal_permission, is_overridden")
      .eq("company_id", workspace.companyId);

    if (accessResult.error) {
      throw new Error(
        `Could not load yacht access profiles: ${accessResult.error.message}`
      );
    }

    const accessByFleetId = new Map(
      (accessResult.data ?? []).map((row) => [row.fleet_id as string, row])
    );

    const yachts = fleet.map((yacht) => {
      const yachtAvailability = availability
        .filter((row) => row.fleet_id === yacht.id)
        .sort((left, right) =>
          left.start_date.localeCompare(right.start_date)
        );

      const effectiveStatus =
        getEffectiveStatus(yachtAvailability);

      const nextAvailable = yachtAvailability.find(
        (row) => row.status === "available"
      );

      const pricedWindow = yachtAvailability.find(
        (row) =>
          row.weekly_rate !== null &&
          Number.isFinite(row.weekly_rate)
      );

      const sourceId =
        yachtAvailability.find((row) => row.source_id)
          ?.source_id ?? null;

      const source = sourceId
        ? sourceById.get(sourceId) ?? null
        : null;

      const access = accessByFleetId.get(yacht.id) ?? null;

      return {
        id: yacht.id,
        name: yacht.name,

        /*
         * Included so the fleet list can show which yachts cannot be offered
         * to a client and let a broker fix it in place. Without it the only
         * way to discover an unclassified yacht is to build a proposal and
         * have it refused.
         */
        access: {
          accessType: access?.access_type ?? null,
          clientProposalPermission:
            access?.client_proposal_permission ?? false,
          isOverridden: access?.is_overridden ?? false,
        },

        status: effectiveStatus,

        weeklyRate: pricedWindow?.weekly_rate ?? null,
        currency: pricedWindow?.currency ?? "EUR",

        nextAvailable: nextAvailable
          ? {
              startDate: nextAvailable.start_date,
              endDate: nextAvailable.end_date,
            }
          : null,

        source: source
          ? {
              id: source.id,
              name: source.name,
              type: source.source_type,
              status: source.status ?? "unknown",
              updatedAt: source.updated_at,
            }
          : null,

        availabilityCount: yachtAvailability.length,

        statusCounts: countStatuses(yachtAvailability),
      };
    });

    const overview = {
      yachtCount: yachts.length,

      availableCount: yachts.filter(
        (yacht) => yacht.status === "available"
      ).length,

      bookedCount: yachts.filter(
        (yacht) => yacht.status === "booked"
      ).length,

      optionCount: yachts.filter(
        (yacht) => yacht.status === "option"
      ).length,

      maintenanceCount: yachts.filter(
        (yacht) => yacht.status === "maintenance"
      ).length,

      sourceCount: sources.length,
    };

    return NextResponse.json(
      {
        success: true,
        overview,
        yachts,
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
        : "Could not load fleet.";

    console.error("Fleet API error:", error);

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

  const activeToday = availability.filter((row) => {
    const today = formatDateKey(new Date());

    return row.start_date <= today && row.end_date >= today;
  });

  const rowsToCheck =
    activeToday.length > 0 ? activeToday : availability;

  const highestPriority = [...rowsToCheck].sort(
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

function formatDateKey(date: Date): string {
  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}