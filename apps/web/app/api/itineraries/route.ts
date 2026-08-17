import {
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

export async function GET() {
  try {
    const workspace =
      await getCurrentWorkspace();
    const admin =
      createAdminClient();

    const [
      chartersResult,
      itinerariesResult,
    ] = await Promise.all([
      admin
        .from("charters")
        .select(
          "id, reference, client_name, yacht_name, start_date, end_date, destination, currency, charter_status, contract_status"
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .neq(
          "charter_status",
          "cancelled"
        )
        .order(
          "start_date",
          {
            ascending: true,
            nullsFirst: false,
          }
        ),

      admin
        .from(
          "charter_itineraries"
        )
        .select(
          "id, charter_id, status, cruising_speed_knots, fuel_burn_lph, fuel_price_per_liter, fuel_currency, contingency_percent, updated_at"
        )
        .eq(
          "company_id",
          workspace.companyId
        ),
    ]);

    if (
      chartersResult.error
    ) {
      throw new Error(
        `Could not load charters: ${chartersResult.error.message}`
      );
    }

    if (
      itinerariesResult.error
    ) {
      throw new Error(
        `Could not load itineraries: ${itinerariesResult.error.message}`
      );
    }

    const charters =
      chartersResult.data ??
      [];

    const itineraries =
      itinerariesResult.data ??
      [];

    const byCharter =
      new Map(
        itineraries.map(
          (item) => [
            String(
              item.charter_id
            ),
            item,
          ]
        )
      );

    const itineraryIds =
      itineraries.map(
        (item) =>
          String(item.id)
      );

    let legs:
      Array<{
        itinerary_id: string;
        distance_nm:
          number | string | null;
      }> = [];

    if (
      itineraryIds.length > 0
    ) {
      const legsResult =
        await admin
          .from(
            "charter_itinerary_legs"
          )
          .select(
            "itinerary_id, distance_nm"
          )
          .eq(
            "company_id",
            workspace.companyId
          )
          .in(
            "itinerary_id",
            itineraryIds
          );

      if (
        legsResult.error
      ) {
        throw new Error(
          `Could not load itinerary legs: ${legsResult.error.message}`
        );
      }

      legs =
        (legsResult.data ??
          []) as typeof legs;
    }

    const legStats =
      new Map<
        string,
        {
          count: number;
          distanceNm: number;
        }
      >();

    for (const leg of legs) {
      const current =
        legStats.get(
          leg.itinerary_id
        ) ?? {
          count: 0,
          distanceNm: 0,
        };

      current.count += 1;
      current.distanceNm +=
        Number(
          leg.distance_nm ??
          0
        ) || 0;

      legStats.set(
        leg.itinerary_id,
        current
      );
    }

    const rows =
      charters.map(
        (charter) => {
          const itinerary =
            byCharter.get(
              String(
                charter.id
              )
            );

          const stats =
            itinerary
              ? legStats.get(
                  String(
                    itinerary.id
                  )
                ) ?? {
                  count: 0,
                  distanceNm: 0,
                }
              : {
                count: 0,
                distanceNm: 0,
              };

          return {
            id:
              charter.id,
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
            charterStatus:
              charter.charter_status,
            contractStatus:
              charter.contract_status,
            itinerary:
              itinerary
                ? {
                    id:
                      itinerary.id,
                    status:
                      itinerary.status,
                    legCount:
                      stats.count,
                    distanceNm:
                      Math.round(
                        stats.distanceNm *
                          100
                      ) / 100,
                    updatedAt:
                      itinerary.updated_at,
                  }
                : null,
          };
        }
      );

    const summary = {
      charters:
        rows.length,
      planned:
        rows.filter(
          (row) =>
            row.itinerary
        ).length,
      ready:
        rows.filter(
          (row) =>
            row.itinerary
              ?.status ===
            "ready"
        ).length,
      shared:
        rows.filter(
          (row) =>
            row.itinerary
              ?.status ===
            "shared"
        ).length,
      totalDistanceNm:
        Math.round(
          rows.reduce(
            (
              total,
              row
            ) =>
              total +
              (row.itinerary
                ?.distanceNm ??
                0),
            0
          ) * 100
        ) / 100,
    };

    return NextResponse.json(
      {
        success: true,
        summary,
        charters: rows,
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
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
      "Itineraries overview API error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not load itineraries.",
      },
      { status: 500 }
    );
  }
}