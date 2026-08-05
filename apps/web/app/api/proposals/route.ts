import { NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProposalStatus =
  | "Draft"
  | "Ready"
  | "Sent"
  | "Accepted"
  | "Declined"
  | "Expired";

type CreateProposalBody = {
  yachtId?: unknown;
  clientName?: unknown;
  clientEmail?: unknown;
  clientPhone?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  guests?: unknown;
  weeklyRate?: unknown;
  currency?: unknown;
  notes?: unknown;
  estimatedTotal?: unknown;
};

type FleetRow = {
  id: string;
  name: string;
};

type ProposalRow = {
  id: string;
  reference: string;
  client_name: string;
  email: string | null;
  phone: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  budget_max: number | null;
  currency: string | null;
  preferences: string | null;
  metadata: Record<string, unknown> | null;
  yacht_id: string | null;
  yacht_name: string | null;
  weekly_rate: number | null;
  proposal_status: string | null;
  proposal_pdf: string | null;
  proposal_created_at: string | null;
  proposal_sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function GET() {
  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const proposalsResult = await supabase
      .from("inquiries")
      .select(
        [
          "id",
          "reference",
          "client_name",
          "email",
          "phone",
          "start_date",
          "end_date",
          "guests",
          "budget_max",
          "currency",
          "preferences",
          "metadata",
          "yacht_id",
          "yacht_name",
          "weekly_rate",
          "proposal_status",
          "proposal_pdf",
          "proposal_created_at",
          "proposal_sent_at",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .eq("company_id", workspace.companyId)
      .not("proposal_created_at", "is", null)
      .order("proposal_created_at", { ascending: false });

    if (proposalsResult.error) {
      throw new Error(
        `Could not load proposals: ${proposalsResult.error.message}`
      );
    }

    const proposals =
      (proposalsResult.data ?? []) as unknown as ProposalRow[];

    const serialized = proposals.map(serializeProposal);

    return NextResponse.json(
      {
        success: true,
        overview: {
          total: serialized.length,
          draft: serialized.filter((item) => item.status === "Draft").length,
          ready: serialized.filter((item) => item.status === "Ready").length,
          sent: serialized.filter((item) => item.status === "Sent").length,
          accepted: serialized.filter((item) => item.status === "Accepted").length,
        },
        proposals: serialized,
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      }
    );
  } catch (error) {
    return handleRouteError(error, "Could not load proposals.");
  }
}

export async function POST(request: Request) {
  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      );
    }

    let rawBody: CreateProposalBody;

    try {
      rawBody = (await request.json()) as CreateProposalBody;
    } catch {
      return NextResponse.json(
        { success: false, error: "The request body must be valid JSON." },
        { status: 400 }
      );
    }

    const validated = validateCreateProposal(rawBody);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: "The proposal contains invalid fields.",
          fieldErrors: validated.errors,
        },
        { status: 400 }
      );
    }

    const input = validated.data;

    const yachtResult = await supabase
      .from("fleet")
      .select("id, name")
      .eq("company_id", workspace.companyId)
      .eq("id", input.yachtId)
      .maybeSingle();

    if (yachtResult.error) {
      throw new Error(`Could not verify yacht: ${yachtResult.error.message}`);
    }

    if (!yachtResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: "The selected yacht does not belong to this workspace.",
        },
        { status: 404 }
      );
    }

    const yacht = yachtResult.data as unknown as FleetRow;
    const now = new Date().toISOString();

    const proposalResult = await supabase
      .from("inquiries")
      .insert({
        reference: generateProposalReference(),
        client_name: input.clientName,
        client_type: "New charter client",
        email: input.clientEmail,
        phone: input.clientPhone,
        destination: null,
        start_date: input.startDate,
        end_date: input.endDate,
        guests: input.guests,
        budget_min: input.estimatedTotal,
        budget_max: input.estimatedTotal,
        currency: input.currency,
        preferences: input.notes,
        original_inquiry: input.notes,
        source: "Proposal Builder",
        status: "Proposal",
        extraction_confidence: null,
        close_probability: 25,
        missing_information: [],
        suggested_question: null,
        company_id: workspace.companyId,
        assigned_to: user.id,
        yacht_id: yacht.id,
        yacht_name: yacht.name,
        weekly_rate: input.weeklyRate,
        proposal_status: "Draft",
        proposal_pdf: null,
        proposal_created_at: now,
        proposal_sent_at: null,
        metadata: {
          record_type: "proposal",
          yacht: { id: yacht.id, name: yacht.name },
          commercial: {
            weekly_rate: input.weeklyRate,
            estimated_total: input.estimatedTotal,
            currency: input.currency,
          },
          charter: {
            start_date: input.startDate,
            end_date: input.endDate,
            guests: input.guests,
          },
          created_by: { user_id: user.id, email: user.email ?? null },
        },
      })
      .select(
        [
          "id",
          "reference",
          "client_name",
          "email",
          "phone",
          "start_date",
          "end_date",
          "guests",
          "budget_max",
          "currency",
          "preferences",
          "metadata",
          "yacht_id",
          "yacht_name",
          "weekly_rate",
          "proposal_status",
          "proposal_pdf",
          "proposal_created_at",
          "proposal_sent_at",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .single();

    if (proposalResult.error) {
      throw new Error(`Could not save proposal: ${proposalResult.error.message}`);
    }

    return NextResponse.json(
      {
        success: true,
        proposal: serializeProposal(
          proposalResult.data as unknown as ProposalRow
        ),
      },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      }
    );
  } catch (error) {
    return handleRouteError(error, "Could not create proposal.");
  }
}

function serializeProposal(proposal: ProposalRow) {
  const metadata = readRecord(proposal.metadata);
  const commercial = readRecord(metadata.commercial);

  return {
    id: proposal.id,
    reference: proposal.reference,
    client: {
      name: proposal.client_name,
      email: proposal.email,
      phone: proposal.phone,
    },
    yacht: {
      id: proposal.yacht_id,
      name: proposal.yacht_name,
    },
    charter: {
      startDate: proposal.start_date,
      endDate: proposal.end_date,
      guests: proposal.guests,
    },
    commercial: {
      weeklyRate: proposal.weekly_rate,
      estimatedTotal:
        readNullableNumber(commercial.estimated_total) ?? proposal.budget_max,
      currency: proposal.currency ?? "EUR",
    },
    notes: proposal.preferences,
    status: normalizeProposalStatus(proposal.proposal_status),
    pdfUrl: proposal.proposal_pdf,
    createdAt: proposal.proposal_created_at ?? proposal.created_at,
    sentAt: proposal.proposal_sent_at,
    updatedAt: proposal.updated_at,
  };
}

function validateCreateProposal(body: CreateProposalBody):
  | {
      success: true;
      data: {
        yachtId: string;
        clientName: string;
        clientEmail: string;
        clientPhone: string | null;
        startDate: string;
        endDate: string;
        guests: number;
        weeklyRate: number | null;
        estimatedTotal: number | null;
        currency: string;
        notes: string | null;
      };
    }
  | { success: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const yachtId = readRequiredString(body.yachtId);
  const clientName = readRequiredString(body.clientName);
  const clientEmail = readRequiredString(body.clientEmail).toLowerCase();
  const clientPhone = readOptionalString(body.clientPhone);
  const startDate = readRequiredString(body.startDate);
  const endDate = readRequiredString(body.endDate);
  const guests = readNumber(body.guests);
  const weeklyRate = readNullableNumber(body.weeklyRate);
  const estimatedTotal = readNullableNumber(body.estimatedTotal);
  const currency = readRequiredString(body.currency).toUpperCase();
  const notes = readOptionalString(body.notes);

  if (!yachtId) errors.yachtId = "Select a yacht.";
  if (!clientName) errors.clientName = "Enter the client's name.";
  if (!clientEmail) {
    errors.clientEmail = "Enter the client's email address.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    errors.clientEmail = "Enter a valid email address.";
  }
  if (!isDateKey(startDate)) errors.startDate = "Enter a valid start date.";
  if (!isDateKey(endDate)) errors.endDate = "Enter a valid end date.";
  if (isDateKey(startDate) && isDateKey(endDate) && endDate <= startDate) {
    errors.endDate = "The end date must be after the start date.";
  }
  if (guests === null || !Number.isInteger(guests) || guests < 1) {
    errors.guests = "Guests must be a whole number above zero.";
  }
  if (weeklyRate !== null && weeklyRate < 0) {
    errors.weeklyRate = "The weekly rate cannot be negative.";
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    errors.currency = "Currency must use a three-letter code.";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      yachtId,
      clientName,
      clientEmail,
      clientPhone,
      startDate,
      endDate,
      guests: guests as number,
      weeklyRate,
      estimatedTotal,
      currency,
      notes,
    },
  };
}

function normalizeProposalStatus(value: string | null): ProposalStatus {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "ready") return "Ready";
  if (normalized === "sent") return "Sent";
  if (normalized === "accepted") return "Accepted";
  if (normalized === "declined") return "Declined";
  if (normalized === "expired") return "Expired";
  return "Draft";
}

function generateProposalReference(): string {
  const date = new Date();
  const stamp = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `PROP-${stamp}-${random}`;
}

function readRequiredString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return readNumber(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function handleRouteError(error: unknown, fallbackMessage: string) {
  if (isAuthenticationRequiredError(error)) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }

  if (isWorkspaceAccessError(error)) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: error.status }
    );
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  console.error("Proposal API error:", error);

  return NextResponse.json(
    { success: false, error: message },
    { status: 500 }
  );
}