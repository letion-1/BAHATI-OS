import { NextResponse } from "next/server";

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

type OperatingModel =
  | "independent_brokerage"
  | "yacht_management"
  | "controlled_fleet"
  | "mixed_operation";

type AccessType =
  | "controlled"
  | "managed"
  | "broker_access"
  | "reference";

type CompanyRow = {
  name: string;
  operating_model: OperatingModel | null;
  primary_market: string | null;
  yacht_access_band: string | null;
};

type AccessRow = {
  fleet_id: string;
  access_type: AccessType;
};

type AvailabilityRow = {
  fleet_id: string;
  status: string;
  end_date: string;
};

type CheckRow = {
  fleet_id: string;
  status: string;
  source: string;
  checked_at: string;
};

type InquiryRow = {
  id: string;
  status: string | null;
  proposal_created_at: string | null;
};

export async function GET() {
  try {
    const workspace = await getCurrentWorkspace();
    const admin = createAdminClient();
    const today = formatDateKey(new Date());

    const [
      companyResult,
      fleetResult,
      accessResult,
      availabilityResult,
      checksResult,
      inquiriesResult,
    ] = await Promise.all([
      admin
        .from("companies")
        .select(
          [
            "name",
            "operating_model",
            "primary_market",
            "yacht_access_band",
          ].join(",")
        )
        .eq("id", workspace.companyId)
        .maybeSingle(),

      admin
        .from("fleet")
        .select("id")
        .eq("company_id", workspace.companyId),

      admin
        .from("yacht_access_profiles")
        .select("fleet_id, access_type")
        .eq("company_id", workspace.companyId),

      admin
        .from("availability")
        .select("fleet_id, status, end_date")
        .eq("company_id", workspace.companyId)
        .gte("end_date", today),

      admin
        .from("availability_checks")
        .select(
          "fleet_id, status, source, checked_at"
        )
        .eq("company_id", workspace.companyId)
        .order("checked_at", {
          ascending: false,
        }),

      admin
        .from("inquiries")
        .select(
          "id, status, proposal_created_at"
        )
        .eq("company_id", workspace.companyId)
        .limit(1000),
    ]);

    assertQuery("company profile", companyResult.error);
    assertQuery("fleet", fleetResult.error);
    assertQuery("yacht access profiles", accessResult.error);
    assertQuery("availability", availabilityResult.error);

    const company =
      companyResult.data as unknown as
        | CompanyRow
        | null;

    if (!company) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The current Bahari OS company profile could not be found.",
        },
        {
          status: 404,
        }
      );
    }

    const fleetIds = new Set(
      (fleetResult.data ?? []).map((row) =>
        String(row.id)
      )
    );

    const accessRows =
      (accessResult.data ?? []) as unknown as AccessRow[];

    const availabilityRows =
      (availabilityResult.data ?? []) as unknown as AvailabilityRow[];

    const checkRows =
      checksResult.error
        ? []
        : ((checksResult.data ?? []) as unknown as CheckRow[]);

    const inquiryRows =
      inquiriesResult.error
        ? []
        : ((inquiriesResult.data ?? []) as unknown as InquiryRow[]);

    const accessByFleet =
      new Map<string, AccessType>();

    for (const row of accessRows) {
      accessByFleet.set(
        row.fleet_id,
        row.access_type
      );
    }

    const accessCounts = {
      controlled: 0,
      managed: 0,
      brokerAccess: 0,
      reference: 0,
    };

    for (const row of accessRows) {
      if (row.access_type === "controlled") {
        accessCounts.controlled += 1;
      } else if (
        row.access_type === "managed"
      ) {
        accessCounts.managed += 1;
      } else if (
        row.access_type === "broker_access"
      ) {
        accessCounts.brokerAccess += 1;
      } else if (
        row.access_type === "reference"
      ) {
        accessCounts.reference += 1;
      }
    }

    const availabilityByAccess = {
      controlledAvailable: new Set<string>(),
      controlledBooked: new Set<string>(),
      managedAvailable: new Set<string>(),
      managedBooked: new Set<string>(),
      brokerSourceAvailable: new Set<string>(),
    };

    for (const row of availabilityRows) {
      const accessType =
        accessByFleet.get(row.fleet_id);

      if (
        accessType === "controlled" &&
        row.status === "available"
      ) {
        availabilityByAccess.controlledAvailable.add(
          row.fleet_id
        );
      }

      if (
        accessType === "controlled" &&
        row.status === "booked"
      ) {
        availabilityByAccess.controlledBooked.add(
          row.fleet_id
        );
      }

      if (
        accessType === "managed" &&
        row.status === "available"
      ) {
        availabilityByAccess.managedAvailable.add(
          row.fleet_id
        );
      }

      if (
        accessType === "managed" &&
        row.status === "booked"
      ) {
        availabilityByAccess.managedBooked.add(
          row.fleet_id
        );
      }

      if (
        accessType === "broker_access" &&
        row.status === "available"
      ) {
        availabilityByAccess.brokerSourceAvailable.add(
          row.fleet_id
        );
      }
    }

    /*
     * Availability checks are historical.
     * The newest check for each yacht is the current verification signal.
     */
    const latestCheckByFleet =
      new Map<string, CheckRow>();

    for (const row of checkRows) {
      if (
        !latestCheckByFleet.has(
          row.fleet_id
        )
      ) {
        latestCheckByFleet.set(
          row.fleet_id,
          row
        );
      }
    }

    let pendingManagerVerification = 0;
    let pendingOwnerApproval = 0;

    for (const [
      fleetId,
      check,
    ] of latestCheckByFleet.entries()) {
      if (check.status !== "pending") {
        continue;
      }

      const accessType =
        accessByFleet.get(fleetId);

      if (accessType === "managed") {
        pendingOwnerApproval += 1;
      } else if (
        accessType === "broker_access"
      ) {
        pendingManagerVerification += 1;
      }
    }

    const inactiveStatuses =
      new Set([
        "closed",
        "cancelled",
        "canceled",
        "archived",
        "rejected",
      ]);

    const activeInquiryCount =
      inquiryRows.filter((row) => {
        const status =
          (row.status ?? "")
            .trim()
            .toLowerCase();

        return !inactiveStatuses.has(status);
      }).length;

    const proposalCount =
      inquiryRows.filter((row) =>
        Boolean(row.proposal_created_at)
      ).length;

    const totalYachts = fleetIds.size;
    const classifiedYachts =
      accessRows.filter((row) =>
        fleetIds.has(row.fleet_id)
      ).length;

    return NextResponse.json(
      {
        success: true,

        workspaceProfile: {
          companyName: company.name,
          operatingModel:
            company.operating_model ??
            "mixed_operation",
          primaryMarket:
            company.primary_market,
          yachtAccessBand:
            company.yacht_access_band,
        },

        accessSummary: {
          totalYachts,
          classifiedYachts,
          unclassifiedYachts: Math.max(
            0,
            totalYachts - classifiedYachts
          ),

          controlled:
            accessCounts.controlled,
          managed:
            accessCounts.managed,
          brokerAccess:
            accessCounts.brokerAccess,
          reference:
            accessCounts.reference,

          controlledAvailable:
            availabilityByAccess
              .controlledAvailable.size,
          controlledBooked:
            availabilityByAccess
              .controlledBooked.size,

          managedAvailable:
            availabilityByAccess
              .managedAvailable.size,
          managedBooked:
            availabilityByAccess
              .managedBooked.size,

          brokerSourceAvailable:
            availabilityByAccess
              .brokerSourceAvailable.size,

          pendingManagerVerification,
          pendingOwnerApproval,
        },

        workSummary: {
          activeInquiryCount,
          proposalCount,
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
    if (
      isAuthenticationRequiredError(error)
    ) {
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
        : "Could not load workspace intelligence.";

    console.error(
      "Workspace intelligence API error:",
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
}

function assertQuery(
  label: string,
  error:
    | {
        message: string;
      }
    | null
) {
  if (error) {
    throw new Error(
      `Could not load ${label}: ${error.message}`
    );
  }
}

function formatDateKey(
  date: Date
): string {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}