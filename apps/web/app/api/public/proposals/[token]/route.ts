import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  hashProposalShareToken,
  isPlausibleProposalShareToken,
} from "@/lib/proposal/share-token";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type ShareLinkRow = {
  id: string;
  company_id: string;
  proposal_id: string;
  is_active: boolean;
  expires_at: string | null;
  revoked_at: string | null;
  last_opened_at: string | null;
  opened_count: number;
};

type InquiryRow = {
  id: string;
  company_id: string;
  reference: string | null;
  client_name: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  currency: string | null;
  created_at: string | null;
};

type ProposalYachtRow = {
  id: string;
  fleet_id: string | null;
  position: number;
  yacht_name: string;
  weekly_rate:
    | number
    | string
    | null;
  estimated_total:
    | number
    | string
    | null;
  currency: string | null;
  availability_status:
    | string
    | null;
  verification_status:
    | string
    | null;
  access_type:
    | string
    | null;
  booking_model:
    | string
    | null;
};

type FleetRow = {
  id: string;
  name: string;
  yacht_type:
    | string
    | null;
  builder:
    | string
    | null;
  model:
    | string
    | null;
  build_year:
    | number
    | null;
  length_meters:
    | number
    | string
    | null;
  guest_capacity:
    | number
    | null;
  sleeping_guests:
    | number
    | null;
  cabin_count:
    | number
    | null;
  home_port:
    | string
    | null;
  cruising_regions:
    | string[]
    | null;
  hero_image_url:
    | string
    | null;
};

type YachtImageRow = {
  fleet_id: string;
  image_url: string;
  is_hero: boolean;
  position: number;
};

type SelectionRow = {
  proposal_yacht_id: string;
  yacht_name: string;
  selected_at: string;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { token } =
      await context.params;

    if (
      !isPlausibleProposalShareToken(
        token
      )
    ) {
      return publicError(
        "This proposal link is invalid.",
        404
      );
    }

    const admin =
      createAdminClient();

    const tokenHash =
      hashProposalShareToken(
        token
      );

    const { data: shareData, error: shareError } =
      await admin
        .from(
          "proposal_share_links"
        )
        .select(
          [
            "id",
            "company_id",
            "proposal_id",
            "is_active",
            "expires_at",
            "revoked_at",
            "last_opened_at",
            "opened_count",
          ].join(",")
        )
        .eq(
          "token_hash",
          tokenHash
        )
        .maybeSingle();

    if (
      shareError ||
      !shareData
    ) {
      return publicError(
        "This proposal link is invalid or no longer available.",
        404
      );
    }

    const share =
      shareData as unknown as ShareLinkRow;

    if (
      !share.is_active ||
      share.revoked_at
    ) {
      return publicError(
        "This proposal link has been revoked.",
        410
      );
    }

    if (
      share.expires_at &&
      new Date(
        share.expires_at
      ).getTime() <= Date.now()
    ) {
      return publicError(
        "This proposal link has expired. Please contact your broker for a new link.",
        410
      );
    }

    const { data: inquiryData, error: inquiryError } =
      await admin
        .from("inquiries")
        .select(
          [
            "id",
            "company_id",
            "reference",
            "client_name",
            "destination",
            "start_date",
            "end_date",
            "guests",
            "currency",
            "created_at",
          ].join(",")
        )
        .eq(
          "company_id",
          share.company_id
        )
        .eq(
          "id",
          share.proposal_id
        )
        .single();

    if (
      inquiryError ||
      !inquiryData
    ) {
      return publicError(
        "The proposal could not be loaded.",
        404
      );
    }

    const inquiry =
      inquiryData as unknown as InquiryRow;

    const {
      data: proposalYachtData,
      error: proposalYachtError,
    } = await admin
      .from("proposal_yachts")
      .select(
        [
          "id",
          "fleet_id",
          "position",
          "yacht_name",
          "weekly_rate",
          "estimated_total",
          "currency",
          "availability_status",
          "verification_status",
          "access_type",
          "booking_model",
        ].join(",")
      )
      .eq(
        "company_id",
        share.company_id
      )
      .eq(
        "proposal_id",
        share.proposal_id
      )
      .order(
        "position",
        {
          ascending: true,
        }
      )
      .limit(3);

    if (proposalYachtError) {
      throw new Error(
        `Could not load proposal yachts: ${proposalYachtError.message}`
      );
    }

    const proposalYachts =
      (proposalYachtData ??
        []) as unknown as ProposalYachtRow[];

    if (
      proposalYachts.length === 0
    ) {
      return publicError(
        "This proposal does not contain any yacht options.",
        404
      );
    }

    const fleetIds =
      Array.from(
        new Set(
          proposalYachts
            .map(
              (row) =>
                row.fleet_id
            )
            .filter(
              (
                value
              ): value is string =>
                typeof value ===
                  "string" &&
                value.length > 0
            )
        )
      );

    let fleetRows: FleetRow[] =
      [];

    if (
      fleetIds.length > 0
    ) {
      const {
        data: fleetData,
        error: fleetError,
      } = await admin
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
            "guest_capacity",
            "sleeping_guests",
            "cabin_count",
            "home_port",
            "cruising_regions",
            "hero_image_url",
          ].join(",")
        )
        .eq(
          "company_id",
          share.company_id
        )
        .in(
          "id",
          fleetIds
        );

      if (fleetError) {
        throw new Error(
          `Could not load yacht details: ${fleetError.message}`
        );
      }

      fleetRows =
        (fleetData ??
          []) as unknown as FleetRow[];
    }

    const fleetById =
      new Map(
        fleetRows.map(
          (row) => [
            row.id,
            row,
          ]
        )
      );

    let yachtImageRows: YachtImageRow[] = [];

    if (fleetIds.length > 0) {
      const {
        data: yachtImageData,
        error: yachtImageError,
      } = await admin
        .from("yacht_images")
        .select(
          [
            "fleet_id",
            "image_url",
            "is_hero",
            "position",
          ].join(",")
        )
        .eq(
          "company_id",
          share.company_id
        )
        .in(
          "fleet_id",
          fleetIds
        )
        .order(
          "is_hero",
          {
            ascending: false,
          }
        )
        .order(
          "position",
          {
            ascending: true,
          }
        );

      if (yachtImageError) {
        throw new Error(
          `Could not load yacht gallery images: ${yachtImageError.message}`
        );
      }

      yachtImageRows =
        (yachtImageData ??
          []) as unknown as YachtImageRow[];
    }

    const imagesByFleetId =
      new Map<string, YachtImageRow[]>();

    for (const image of yachtImageRows) {
      const current =
        imagesByFleetId.get(
          image.fleet_id
        ) ?? [];

      current.push(image);
      imagesByFleetId.set(
        image.fleet_id,
        current
      );
    }

    const {
      data: selectionData,
      error: selectionError,
    } = await admin
      .from(
        "proposal_client_selections"
      )
      .select(
        [
          "proposal_yacht_id",
          "yacht_name",
          "selected_at",
        ].join(",")
      )
      .eq(
        "company_id",
        share.company_id
      )
      .eq(
        "proposal_id",
        share.proposal_id
      )
      .maybeSingle();

    if (selectionError) {
      throw new Error(
        `Could not load the client selection: ${selectionError.message}`
      );
    }

    const selection =
      selectionData
        ? (selectionData as unknown as SelectionRow)
        : null;

    const now =
      new Date().toISOString();

    // Record the opening without blocking the proposal if analytics fails.
    await Promise.allSettled([
      admin
        .from(
          "proposal_share_links"
        )
        .update({
          last_opened_at:
            now,
          opened_count:
            Math.max(
              0,
              share.opened_count
            ) + 1,
        })
        .eq(
          "id",
          share.id
        ),

      admin
        .from(
          "proposal_client_events"
        )
        .insert({
          company_id:
            share.company_id,
          proposal_id:
            share.proposal_id,
          share_link_id:
            share.id,
          event_type:
            "opened",
          proposal_yacht_id:
            null,
          fleet_id: null,
          metadata: {},
          created_at: now,
        }),
    ]);

    return NextResponse.json(
      {
        success: true,
        proposal: {
          id:
            inquiry.id,
          reference:
            cleanText(
              inquiry.reference
            ) ??
            `PROP-${inquiry.id
              .slice(0, 8)
              .toUpperCase()}`,
          clientName:
            cleanText(
              inquiry.client_name
            ) ??
            "Charter Client",
          charter: {
            startDate:
              inquiry.start_date,
            endDate:
              inquiry.end_date,
            guests:
              toFiniteNumber(
                inquiry.guests
              ),
            destination:
              cleanText(
                inquiry.destination
              ),
          },
          createdAt:
            inquiry.created_at,
          yachts:
            proposalYachts.map(
              (row) => {
                const fleet =
                  row.fleet_id
                    ? fleetById.get(
                        row.fleet_id
                      ) ?? null
                    : null;

                return {
                  proposalYachtId:
                    row.id,
                  fleetId:
                    row.fleet_id,
                  position:
                    row.position,
                  name:
                    cleanText(
                      row.yacht_name
                    ) ??
                    fleet?.name ??
                    "Yacht",
                  weeklyRate:
                    toFiniteNumber(
                      row.weekly_rate
                    ),
                  estimatedTotal:
                    toFiniteNumber(
                      row.estimated_total
                    ),
                  currency:
                    cleanText(
                      row.currency
                    ) ??
                    cleanText(
                      inquiry.currency
                    ) ??
                    "EUR",
                  availabilityStatus:
                    cleanText(
                      row.availability_status
                    ),
                  verificationStatus:
                    cleanText(
                      row.verification_status
                    ),
                  accessType:
                    cleanText(
                      row.access_type
                    ),
                  bookingModel:
                    cleanText(
                      row.booking_model
                    ),
                  availabilityLabel:
                    buildAvailabilityLabel(
                      row
                    ),
                  selectable:
                    normalize(
                      row.availability_status
                    ) !==
                    "unavailable",
                  imageUrl:
                    cleanText(
                      fleet?.hero_image_url
                    ) ??
                    (
                      row.fleet_id
                        ? cleanText(
                            imagesByFleetId.get(
                              row.fleet_id
                            )?.[0]
                              ?.image_url
                          )
                        : null
                    ),
                  galleryImages:
                    row.fleet_id
                      ? (
                          imagesByFleetId.get(
                            row.fleet_id
                          ) ?? []
                        )
                          .map(
                            (image) =>
                              cleanText(
                                image.image_url
                              )
                          )
                          .filter(
                            (
                              value
                            ): value is string =>
                              Boolean(value)
                          )
                      : [],
                  yachtType:
                    cleanText(
                      fleet?.yacht_type
                    ),
                  builder:
                    cleanText(
                      fleet?.builder
                    ),
                  model:
                    cleanText(
                      fleet?.model
                    ),
                  buildYear:
                    toFiniteNumber(
                      fleet?.build_year
                    ),
                  lengthMeters:
                    toFiniteNumber(
                      fleet?.length_meters
                    ),
                  guestCapacity:
                    toFiniteNumber(
                      fleet?.guest_capacity
                    ),
                  sleepingGuests:
                    toFiniteNumber(
                      fleet?.sleeping_guests
                    ),
                  cabinCount:
                    toFiniteNumber(
                      fleet?.cabin_count
                    ),
                  homePort:
                    cleanText(
                      fleet?.home_port
                    ),
                  cruisingRegions:
                    Array.isArray(
                      fleet?.cruising_regions
                    )
                      ? fleet!.cruising_regions.filter(
                          (
                            value
                          ): value is string =>
                            typeof value ===
                              "string" &&
                            value.trim().length >
                              0
                        )
                      : [],
                };
              }
            ),
          selection: selection
            ? {
                proposalYachtId:
                  selection.proposal_yacht_id,
                yachtName:
                  selection.yacht_name,
                selectedAt:
                  selection.selected_at,
              }
            : null,
        },
      },
      noStore(200)
    );
  } catch (error) {
    console.error(
      "Public proposal API failed:",
      error
    );

    return publicError(
      error instanceof Error
        ? error.message
        : "The proposal could not be loaded.",
      500
    );
  }
}

function buildAvailabilityLabel(
  row: ProposalYachtRow
): string {
  const availability =
    normalize(
      row.availability_status
    );
  const bookingModel =
    normalize(
      row.booking_model
    );
  const accessType =
    normalize(
      row.access_type
    );

  if (
    availability ===
      "unavailable"
  ) {
    return "Currently unavailable";
  }

  if (
    availability ===
      "owner_approval_required" ||
    bookingModel ===
      "owner_approval_required"
  ) {
    return "Owner approval required";
  }

  if (
    accessType ===
      "broker_access" ||
    bookingModel ===
      "confirmation_required"
  ) {
    return "Subject to manager confirmation";
  }

  if (
    accessType ===
      "controlled" &&
    availability ===
      "available"
  ) {
    return "Available";
  }

  if (
    availability ===
      "available"
  ) {
    return "Available, subject to final confirmation";
  }

  return "Subject to verification";
}

function normalize(
  value: unknown
): string {
  return (
    cleanText(value)
      ?.toLowerCase()
      .replace(
        /[\s-]+/g,
        "_"
      ) ?? ""
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

  return cleaned ||
    null;
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

  const numberValue =
    typeof value ===
      "number"
      ? value
      : Number(
          String(value).replace(
            /[^\d.-]/g,
            ""
          )
        );

  return Number.isFinite(
    numberValue
  )
    ? numberValue
    : null;
}

function publicError(
  error: string,
  status: number
) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    noStore(status)
  );
}

function noStore(
  status: number
) {
  return {
    status,
    headers: {
      "Cache-Control":
        "private, no-store, max-age=0",
      "X-Robots-Tag":
        "noindex, nofollow, noarchive",
    },
  };
}