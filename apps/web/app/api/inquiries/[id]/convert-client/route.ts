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

type InquiryRow = {
  id: string;
  client_name: string;
  email: string | null;
  phone: string | null;
  destination: string | null;
  preferences: string | null;
  client_id: string | null;
  status: string | null;
};

type ExistingClientRow = {
  id: string;
};

export async function POST(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const { data: inquiryData, error: inquiryError } =
      await supabase
        .from("inquiries")
        .select(
          [
            "id",
            "client_name",
            "email",
            "phone",
            "destination",
            "preferences",
            "client_id",
            "status",
          ].join(",")
        )
        .eq("id", id)
        .eq("company_id", workspace.companyId)
        .single();

    if (inquiryError || !inquiryData) {
      throw new Error(
        `Could not load inquiry: ${
          inquiryError?.message ?? "Inquiry not found."
        }`
      );
    }

    const inquiry =
      inquiryData as unknown as InquiryRow;

    if ((inquiry.status ?? "").toLowerCase() !== "won") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Only won inquiries can be converted to clients.",
        },
        { status: 400 }
      );
    }

    if (inquiry.client_id) {
      return NextResponse.json(
        {
          success: true,
          duplicate: true,
          clientId: inquiry.client_id,
          message:
            "This inquiry is already linked to a client.",
        },
        { status: 200 }
      );
    }

    const filters: string[] = [];

    if (inquiry.email) {
      filters.push(`email.eq.${inquiry.email}`);
    }

    if (inquiry.phone) {
      filters.push(`phone.eq.${inquiry.phone}`);
    }

    let duplicate: ExistingClientRow | null = null;

    if (filters.length > 0) {
      const { data: duplicateData, error: duplicateError } =
        await supabase
          .from("clients")
          .select("id")
          .eq("company_id", workspace.companyId)
          .or(filters.join(","))
          .limit(1)
          .maybeSingle();

      if (duplicateError) {
        throw new Error(
          `Could not check client duplicates: ${duplicateError.message}`
        );
      }

      duplicate =
        duplicateData as unknown as ExistingClientRow | null;
    }

    if (duplicate) {
      await linkInquiry({
        supabase,
        companyId: workspace.companyId,
        inquiryId: inquiry.id,
        clientId: duplicate.id,
      });

      return NextResponse.json(
        {
          success: true,
          duplicate: true,
          clientId: duplicate.id,
          message:
            "An existing client matched this inquiry and has been linked.",
        },
        { status: 200 }
      );
    }

    const { data: clientData, error: clientError } =
      await supabase
        .from("clients")
        .insert({
          company_id: workspace.companyId,
          name: inquiry.client_name,
          email: inquiry.email,
          phone: inquiry.phone,
          status: "active",
          vip_level: "standard",
          preferred_destination: inquiry.destination,
          preferred_yacht_type: null,
          notes: inquiry.preferences,
          preferences: {
            source: "inquiry_conversion",
            source_inquiry_id: inquiry.id,
          },
          lifetime_value: 0,
          last_contacted_at: new Date().toISOString(),
        })
        .select("id")
        .single();

    if (clientError || !clientData) {
      throw new Error(
        `Could not create client: ${
          clientError?.message ?? "Unknown error."
        }`
      );
    }

    const createdClient =
      clientData as unknown as ExistingClientRow;

    await linkInquiry({
      supabase,
      companyId: workspace.companyId,
      inquiryId: inquiry.id,
      clientId: createdClient.id,
    });

    return NextResponse.json(
      {
        success: true,
        duplicate: false,
        clientId: createdClient.id,
        message:
          "Client created and linked successfully.",
      },
      { status: 201 }
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
        : "Could not convert inquiry.";

    console.error("Inquiry conversion failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

async function linkInquiry({
  supabase,
  companyId,
  inquiryId,
  clientId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  companyId: string;
  inquiryId: string;
  clientId: string;
}) {
  const { error } = await supabase
    .from("inquiries")
    .update({
      client_id: clientId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inquiryId)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(
      `Client was created, but the inquiry could not be linked: ${error.message}`
    );
  }
}