import { NextResponse } from "next/server";

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

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string | null;
  vip_level: string | null;
  preferred_destination: string | null;
  preferred_yacht_type: string | null;
  notes: string | null;
  preferences: Record<string, unknown> | null;
  lifetime_value: number | string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
};

type InquiryRow = {
  id: string;
  reference: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  budget_min: number | string | null;
  budget_max: number | string | null;
  currency: string | null;
  status: string | null;
  proposal_pdf: string | null;
  proposal_status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type DocumentRow = {
  id: string;
  name: string;
  category: string;
  mime_type: string;
  file_size: number | string;
  version: number | null;
  status: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const clientResult = await supabase
      .from("clients")
      .select(
        [
          "id",
          "name",
          "email",
          "phone",
          "status",
          "vip_level",
          "preferred_destination",
          "preferred_yacht_type",
          "notes",
          "preferences",
          "lifetime_value",
          "last_contacted_at",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .eq("id", id)
      .eq("company_id", workspace.companyId)
      .single();

    if (clientResult.error || !clientResult.data) {
      return NextResponse.json(
        {
          success: false,
          error:
            clientResult.error?.message ??
            "Client not found.",
        },
        { status: 404 }
      );
    }

    const [inquiriesResult, documentsResult] =
      await Promise.all([
        supabase
          .from("inquiries")
          .select(
            [
              "id",
              "reference",
              "destination",
              "start_date",
              "end_date",
              "guests",
              "budget_min",
              "budget_max",
              "currency",
              "status",
              "proposal_pdf",
              "proposal_status",
              "created_at",
              "updated_at",
            ].join(",")
          )
          .eq("client_id", id)
          .eq("company_id", workspace.companyId)
          .order("created_at", {
            ascending: false,
          }),

        supabase
          .from("documents")
          .select(
            [
              "id",
              "name",
              "category",
              "mime_type",
              "file_size",
              "version",
              "status",
              "created_at",
              "updated_at",
            ].join(",")
          )
          .eq("client_id", id)
          .eq("company_id", workspace.companyId)
          .order("updated_at", {
            ascending: false,
          }),
      ]);

    if (inquiriesResult.error) {
      throw new Error(
        `Could not load linked inquiries: ${inquiriesResult.error.message}`
      );
    }

    if (documentsResult.error) {
      throw new Error(
        `Could not load linked documents: ${documentsResult.error.message}`
      );
    }

    const client =
      clientResult.data as unknown as ClientRow;

    const inquiries =
      (inquiriesResult.data ??
        []) as unknown as InquiryRow[];

    const documents =
      (documentsResult.data ??
        []) as unknown as DocumentRow[];

    const proposals = inquiries
      .filter(
        (inquiry) =>
          Boolean(inquiry.proposal_pdf) ||
          Boolean(inquiry.proposal_status)
      )
      .map((inquiry) => ({
        inquiryId: inquiry.id,
        reference: inquiry.reference,
        status:
          inquiry.proposal_status ??
          normalizeStatus(inquiry.status),
        pdfPath: inquiry.proposal_pdf,
        createdAt: inquiry.created_at,
        updatedAt: inquiry.updated_at,
      }));

    const timeline = [
      {
        id: `client-${client.id}`,
        type: "client_created",
        title: "Client profile created",
        description: `${client.name} was added to the CRM.`,
        createdAt: client.created_at,
        href: null,
      },
      ...inquiries
        .filter((inquiry) =>
          Boolean(inquiry.created_at)
        )
        .map((inquiry) => ({
          id: `inquiry-${inquiry.id}`,
          type: "inquiry",
          title: "Inquiry linked",
          description: `${
            inquiry.reference ?? "Inquiry"
          } · ${
            inquiry.destination ??
            "No destination"
          }`,
          createdAt:
            inquiry.created_at ??
            client.created_at,
          href: `/workspace/inquiry/${inquiry.id}`,
        })),
      ...documents.map((document) => ({
        id: `document-${document.id}`,
        type: "document",
        title: "Document uploaded",
        description: `${document.name} · ${humanize(
          document.category
        )}`,
        createdAt: document.created_at,
        href: "/documents",
      })),
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    );

    return NextResponse.json(
      {
        success: true,
        client: {
          id: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone,
          status: client.status ?? "active",
          vipLevel:
            client.vip_level ?? "standard",
          preferredDestination:
            client.preferred_destination,
          preferredYachtType:
            client.preferred_yacht_type,
          notes: client.notes,
          preferences: client.preferences ?? {},
          lifetimeValue:
            toFiniteNumber(
              client.lifetime_value
            ) ?? 0,
          lastContactedAt:
            client.last_contacted_at,
          createdAt: client.created_at,
          updatedAt: client.updated_at,
        },
        inquiries: inquiries.map((inquiry) => ({
          id: inquiry.id,
          reference: inquiry.reference,
          destination: inquiry.destination,
          startDate: inquiry.start_date,
          endDate: inquiry.end_date,
          guests: inquiry.guests,
          budgetMin: toFiniteNumber(
            inquiry.budget_min
          ),
          budgetMax: toFiniteNumber(
            inquiry.budget_max
          ),
          currency: inquiry.currency ?? "EUR",
          status: normalizeStatus(
            inquiry.status
          ),
          createdAt: inquiry.created_at,
          updatedAt: inquiry.updated_at,
        })),
        proposals,
        documents: documents.map(
          (document) => ({
            id: document.id,
            name: document.name,
            category: document.category,
            mimeType: document.mime_type,
            fileSize:
              toFiniteNumber(
                document.file_size
              ) ?? 0,
            version: document.version ?? 1,
            status:
              document.status ?? "active",
            createdAt: document.created_at,
            updatedAt: document.updated_at,
          })
        ),
        timeline,
        metrics: {
          inquiryCount: inquiries.length,
          proposalCount: proposals.length,
          documentCount: documents.length,
          wonInquiryCount: inquiries.filter(
            (inquiry) =>
              normalizeStatus(
                inquiry.status
              ) === "won"
          ).length,
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
    if (isWorkspaceAccessError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: error.status }
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Could not load client profile.";

    console.error(
      "Client overview route failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

function normalizeStatus(
  value: string | null
): string {
  return (value ?? "new")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
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

  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}