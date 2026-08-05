import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";

import {
  ProposalPdf,
  type ProposalPdfData,
} from "@/components/pdf/proposal-pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type InquiryRow = {
  id: string;
  reference: string | null;
  client_name: string | null;
  email: string | null;
  phone: string | null;
  yacht_name: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  weekly_rate: number | string | null;
  budget_max: number | string | null;
  currency: string | null;
  preferences: string | null;
  original_inquiry: string | null;
  proposal_pdf: string | null;
  pdf_version: number | null;
  created_at: string | null;
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

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be signed in to generate a proposal PDF." },
        { status: 401 }
      );
    }

    const { data: inquiryData, error: inquiryError } = await supabase
      .from("inquiries")
      .select(`
        id,
        reference,
        client_name,
        email,
        phone,
        yacht_name,
        start_date,
        end_date,
        guests,
        weekly_rate,
        budget_max,
        currency,
        preferences,
        original_inquiry,
        proposal_pdf,
        pdf_version,
        created_at
      `)
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

    const inquiry = inquiryData as unknown as InquiryRow;
    const nextVersion = Math.max(inquiry.pdf_version ?? 0, 0) + 1;

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

      yacht: {
        name: cleanText(inquiry.yacht_name) ?? "Selected Yacht",
      },

      charter: {
        startDate: inquiry.start_date,
        endDate: inquiry.end_date,
        guests: toFiniteNumber(inquiry.guests),
      },

      commercial: {
        weeklyRate: toFiniteNumber(inquiry.weekly_rate),
        estimatedTotal:
          toFiniteNumber(inquiry.budget_max) ??
          toFiniteNumber(inquiry.weekly_rate),
        currency: cleanText(inquiry.currency) ?? "EUR",
      },

      notes:
        cleanText(inquiry.preferences) ??
        cleanText(inquiry.original_inquiry),
    };

    const pdfElement = React.createElement(ProposalPdf, {
      proposal,
      companyName: "Intrigue Yacht OS",
    });

    const pdfDocument =
      pdfElement as unknown as Parameters<typeof renderToBuffer>[0];

    const pdfBuffer = await renderToBuffer(pdfDocument);

    const safeReference = sanitizeFileSegment(proposal.reference);
    const fileName = `${safeReference}-v${nextVersion}.pdf`;
    const storagePath = `${user.id}/${id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        {
          error: `PDF created, but upload failed: ${uploadError.message}`,
        },
        { status: 500 }
      );
    }

    const generatedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("inquiries")
      .update({
        proposal_pdf: storagePath,
        pdf_generated_at: generatedAt,
        pdf_version: nextVersion,
        pdf_status: "Generated",
        proposal_created_at: generatedAt,
      })
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

    const { data: signedUrlData, error: signedUrlError } =
      await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(
          storagePath,
          SIGNED_URL_TTL_SECONDS
        );

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return NextResponse.json(
        {
          success: true,
          proposalId: id,
          storagePath,
          pdfVersion: nextVersion,
          generatedAt,
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
        pdfUrl: signedUrlData.signedUrl,
        storagePath,
        pdfVersion: nextVersion,
        generatedAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Proposal PDF generation failed:", error);

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

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function toFiniteNumber(value: unknown): number | null {
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
      : Number(String(value).replace(/[^\d.-]/g, ""));

  return Number.isFinite(numberValue)
    ? numberValue
    : null;
}

function sanitizeFileSegment(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return cleaned || "proposal";
}