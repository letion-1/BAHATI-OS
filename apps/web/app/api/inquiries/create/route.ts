import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

type InquiryPayload = {
  client_name?: string | null;
  client_type?: string | null;
  email?: string | null;
  phone?: string | null;
  destination?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  guests?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
  currency?: string | null;
  preferences?: string | null;
  source?: string | null;
  extraction_confidence?: number | null;
};

function normalizeConfidence(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  const percentage = value <= 1 ? value * 100 : value;

  return Math.round(Math.min(100, Math.max(0, percentage)));
}

function cleanOptionalText(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

export async function POST(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();
    const body = (await request.json()) as {
      inquiry?: InquiryPayload;
      original_inquiry?: string;
    };

    const inquiry = body.inquiry;

    if (!inquiry) {
      return NextResponse.json(
        { error: "Inquiry data is required." },
        { status: 400 }
      );
    }

    const clientName = cleanOptionalText(inquiry.client_name);
    const destination = cleanOptionalText(inquiry.destination);

    if (!clientName) {
      return NextResponse.json(
        { error: "Client name is required." },
        { status: 400 }
      );
    }

    if (!destination) {
      return NextResponse.json(
        { error: "Destination is required." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const reference = `INQ-${Date.now().toString().slice(-8)}`;

    const { data, error } = await supabase
      .from("inquiries")
      .insert({
        company_id: workspace.companyId,
        reference,
        client_name: clientName,
        client_type:
          cleanOptionalText(inquiry.client_type) ??
          "New charter client",
        email: cleanOptionalText(inquiry.email),
        phone: cleanOptionalText(inquiry.phone),
        destination,
        start_date: inquiry.start_date || null,
        end_date: inquiry.end_date || null,
        guests: inquiry.guests ?? null,
        budget_min: inquiry.budget_min ?? null,
        budget_max: inquiry.budget_max ?? null,
        currency:
          cleanOptionalText(inquiry.currency)?.toUpperCase() ?? "EUR",
        preferences: cleanOptionalText(inquiry.preferences),
        original_inquiry: cleanOptionalText(body.original_inquiry),
        source: cleanOptionalText(inquiry.source) ?? "AI import",
        status: "new",
        extraction_confidence: normalizeConfidence(
          inquiry.extraction_confidence
        ),
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Could not save inquiry.");
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Create inquiry route failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create inquiry.",
      },
      { status: 500 }
    );
  }
}