import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";

import {
  ProposalPdf,
  type ProposalPdfData,
  type ProposalPdfYacht,
} from "@/components/pdf/proposal-pdf";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type InquiryRow = {
  id: string;
  company_id: string;
  reference: string | null;
  client_name: string | null;
  email: string | null;
  phone: string | null;
  destination: string | null;
  yacht_id: string | null;
  yacht_name: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  weekly_rate: number | string | null;
  budget_max: number | string | null;
  currency: string | null;
  preferences: string | null;
  original_inquiry: string | null;
  metadata: Record<string, unknown> | null;
  proposal_pdf: string | null;
  pdf_version: number | null;
  created_at: string | null;
};

type ProposalYachtRow = {
  fleet_id: string | null;
  position: number;
  yacht_name: string;
  weekly_rate: number | string | null;
  estimated_total: number | string | null;
  currency: string | null;
  broker_note: string | null;
  availability_status: string | null;
  verification_status: string | null;
  access_type: string | null;
  booking_model: string | null;
};

type FleetRow = {
  id: string;
  name: string;
  yacht_type: string | null;
  builder: string | null;
  model: string | null;
  build_year: number | null;
  length_meters: number | string | null;
  guest_capacity: number | null;
  sleeping_guests: number | null;
  cabin_count: number | null;
  home_port: string | null;
  cruising_regions: string[] | null;
  hero_image_url: string | null;
};

const BUCKET_NAME = "proposals-pdfs";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function POST(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "Proposal ID is required." },
        { status: 400 }
      );
    }

    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error:
            "You must be signed in to generate a proposal PDF.",
        },
        { status: 401 }
      );
    }

    const { data: inquiryData, error: inquiryError } =
      await supabase
        .from("inquiries")
        .select(
          [
            "id",
            "company_id",
            "reference",
            "client_name",
            "email",
            "phone",
            "destination",
            "yacht_id",
            "yacht_name",
            "start_date",
            "end_date",
            "guests",
            "weekly_rate",
            "budget_max",
            "currency",
            "preferences",
            "original_inquiry",
            "metadata",
            "proposal_pdf",
            "pdf_version",
            "created_at",
          ].join(",")
        )
        .eq("company_id", workspace.companyId)
        .eq("id", id)
        .single();

    if (inquiryError || !inquiryData) {
      return NextResponse.json(
        {
          error:
            inquiryError?.message ??
            "The proposal could not be found or is not accessible.",
        },
        { status: 404 }
      );
    }

    const inquiry =
      inquiryData as unknown as InquiryRow;

    const proposalYachtsResult = await supabase
      .from("proposal_yachts")
      .select(
        [
          "fleet_id",
          "position",
          "yacht_name",
          "weekly_rate",
          "estimated_total",
          "currency",
          "broker_note",
          "availability_status",
          "verification_status",
          "access_type",
          "booking_model",
        ].join(",")
      )
      .eq("company_id", workspace.companyId)
      .eq("proposal_id", id)
      .order("position", {
        ascending: true,
      });

    if (proposalYachtsResult.error) {
      throw new Error(
        `Could not load proposal yacht options: ${proposalYachtsResult.error.message}`
      );
    }

    const proposalYachtRows =
      (proposalYachtsResult.data ??
        []) as unknown as ProposalYachtRow[];

    const fleetIds = Array.from(
      new Set(
        proposalYachtRows
          .map((row) => row.fleet_id)
          .filter(
            (value): value is string =>
              typeof value === "string" &&
              value.length > 0
          )
      )
    );

    let fleetRows: FleetRow[] = [];

    if (fleetIds.length > 0) {
      const fleetResult = await supabase
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
        .eq("company_id", workspace.companyId)
        .in("id", fleetIds);

      if (fleetResult.error) {
        throw new Error(
          `Could not load yacht details for the PDF: ${fleetResult.error.message}`
        );
      }

      fleetRows =
        (fleetResult.data ??
          []) as unknown as FleetRow[];
    }

    const fleetById = new Map(
      fleetRows.map((row) => [row.id, row])
    );

    const yachts =
      buildPdfYachts(
        inquiry,
        proposalYachtRows,
        fleetById
      );

    const nextVersion =
      Math.max(
        inquiry.pdf_version ?? 0,
        0
      ) + 1;

    const proposal: ProposalPdfData = {
      reference:
        cleanText(inquiry.reference) ??
        `PROP-${id.slice(0, 8).toUpperCase()}`,

      createdAt: inquiry.created_at,

      client: {
        name:
          cleanText(inquiry.client_name) ??
          "Prospective Charter Client",
        email: cleanText(inquiry.email),
        phone: cleanText(inquiry.phone),
      },

      charter: {
        startDate: inquiry.start_date,
        endDate: inquiry.end_date,
        guests: toFiniteNumber(
          inquiry.guests
        ),
        destination:
          cleanText(inquiry.destination) ??
          readMetadataDestination(
            inquiry.metadata
          ),
      },

      yachts,

      // Legacy compatibility for any downstream code that still
      // expects option #1 in the old singular shape.
      yacht: {
        name:
          yachts[0]?.name ??
          cleanText(
            inquiry.yacht_name
          ) ??
          "Selected Yacht",
      },

      commercial: {
        weeklyRate:
          yachts[0]?.weeklyRate ??
          toFiniteNumber(
            inquiry.weekly_rate
          ),
        estimatedTotal:
          yachts[0]?.estimatedTotal ??
          toFiniteNumber(
            inquiry.budget_max
          ) ??
          toFiniteNumber(
            inquiry.weekly_rate
          ),
        currency:
          yachts[0]?.currency ??
          cleanText(
            inquiry.currency
          ) ??
          "EUR",
      },

      notes:
        cleanText(inquiry.preferences) ??
        cleanText(
          inquiry.original_inquiry
        ),
    };

    const pdfElement =
      React.createElement(
        ProposalPdf,
        {
          proposal,
          companyName:
            workspace.companyName ||
            "Bahari OS",
        }
      );

    const pdfDocument =
      pdfElement as unknown as Parameters<
        typeof renderToBuffer
      >[0];

    const pdfBuffer =
      await renderToBuffer(
        pdfDocument
      );

    const safeReference =
      sanitizeFileSegment(
        proposal.reference
      );

    const fileName =
      `${safeReference}-v${nextVersion}.pdf`;

    const storagePath =
      `${user.id}/${id}/${fileName}`;

    const { error: uploadError } =
      await supabase.storage
        .from(BUCKET_NAME)
        .upload(
          storagePath,
          pdfBuffer,
          {
            contentType:
              "application/pdf",
            cacheControl: "3600",
            upsert: false,
          }
        );

    if (uploadError) {
      return NextResponse.json(
        {
          error:
            `PDF created, but upload failed: ${uploadError.message}`,
        },
        { status: 500 }
      );
    }

    const generatedAt =
      new Date().toISOString();

    const { error: updateError } =
      await supabase
        .from("inquiries")
        .update({
          proposal_pdf: storagePath,
          pdf_generated_at:
            generatedAt,
          pdf_version:
            nextVersion,
          pdf_status: "Generated",
          proposal_created_at:
            generatedAt,
        })
        .eq(
          "company_id",
          workspace.companyId
        )
        .eq("id", id);

    if (updateError) {
      await supabase.storage
        .from(BUCKET_NAME)
        .remove([storagePath]);

      return NextResponse.json(
        {
          error:
            "PDF upload succeeded, but the proposal record could not be updated: " +
            updateError.message,
        },
        { status: 500 }
      );
    }

    const {
      data: signedUrlData,
      error: signedUrlError,
    } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(
        storagePath,
        SIGNED_URL_TTL_SECONDS
      );

    if (
      signedUrlError ||
      !signedUrlData?.signedUrl
    ) {
      return NextResponse.json(
        {
          success: true,
          proposalId: id,
          storagePath,
          pdfVersion:
            nextVersion,
          generatedAt,
          yachtCount:
            yachts.length,
          warning:
            signedUrlError?.message ??
            "The PDF was generated, but a signed URL could not be created.",
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        proposalId: id,
        pdfUrl:
          signedUrlData.signedUrl,
        storagePath,
        pdfVersion:
          nextVersion,
        generatedAt,
        yachtCount:
          yachts.length,
      },
      { status: 201 }
    );
  } catch (error) {
    if (
      isWorkspaceAccessError(error)
    ) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: error.status,
        }
      );
    }

    console.error(
      "Proposal PDF generation failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected PDF generation error occurred.",
      },
      { status: 500 }
    );
  }
}

function buildPdfYachts(
  inquiry: InquiryRow,
  proposalRows: ProposalYachtRow[],
  fleetById: Map<string, FleetRow>
): ProposalPdfYacht[] {
  if (
    proposalRows.length === 0
  ) {
    return [
      {
        id:
          inquiry.yacht_id,
        position: 1,
        name:
          cleanText(
            inquiry.yacht_name
          ) ??
          "Selected Yacht",
        weeklyRate:
          toFiniteNumber(
            inquiry.weekly_rate
          ),
        estimatedTotal:
          toFiniteNumber(
            inquiry.budget_max
          ) ??
          toFiniteNumber(
            inquiry.weekly_rate
          ),
        currency:
          cleanText(
            inquiry.currency
          ) ??
          "EUR",
        availabilityStatus:
          "unverified",
        verificationStatus:
          "not_checked",
        accessType: null,
        bookingModel: null,
        brokerNote: null,
        heroImageUrl: null,
        yachtType: null,
        builder: null,
        model: null,
        buildYear: null,
        lengthMeters: null,
        guestCapacity: null,
        sleepingGuests: null,
        cabinCount: null,
        homePort: null,
        cruisingRegions: [],
      },
    ];
  }

  return [...proposalRows]
    .sort(
      (left, right) =>
        left.position -
        right.position
    )
    .slice(0, 3)
    .map((row) => {
      const fleet =
        row.fleet_id
          ? fleetById.get(
              row.fleet_id
            ) ?? null
          : null;

      return {
        id: row.fleet_id,
        position: row.position,
        name:
          cleanText(
            row.yacht_name
          ) ??
          fleet?.name ??
          "Selected Yacht",
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
        brokerNote:
          cleanText(
            row.broker_note
          ),
        heroImageUrl:
          cleanText(
            fleet?.hero_image_url
          ),
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
    });
}

function readMetadataDestination(
  metadata: Record<string, unknown> | null
): string | null {
  if (
    !metadata ||
    typeof metadata !== "object"
  ) {
    return null;
  }

  const charter =
    metadata.charter;

  if (
    !charter ||
    typeof charter !== "object" ||
    Array.isArray(charter)
  ) {
    return null;
  }

  return cleanText(
    (
      charter as Record<
        string,
        unknown
      >
    ).destination
  );
}

function cleanText(
  value: unknown
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned.length > 0
    ? cleaned
    : null;
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
    typeof value === "number"
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

function sanitizeFileSegment(
  value: string
): string {
  const cleaned = value
    .trim()
    .replace(
      /[^a-zA-Z0-9_-]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .slice(0, 80);

  return cleaned || "proposal";
}