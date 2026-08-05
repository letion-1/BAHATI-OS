import { NextRequest, NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CopilotRequest = {
  message?: unknown;
};

type CopilotResult = {
  type:
    | "client"
    | "inquiry"
    | "proposal"
    | "yacht";
  title: string;
  subtitle: string;
  href: string;
};

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  status: string | null;
  vip_level: string | null;
  preferred_destination: string | null;
  lifetime_value: number | string | null;
};

type InquiryRow = {
  id: string;
  reference: string | null;
  client_name: string | null;
  destination: string | null;
  status: string | null;
  budget_min: number | string | null;
  budget_max: number | string | null;
  currency: string | null;
  proposal_status: string | null;
  proposal_pdf: string | null;
};

type YachtRow = {
  id: string;
  name: string | null;
  location: string | null;
  status: string | null;
  weekly_rate: number | string | null;
  currency: string | null;
  guests: number | null;
  cabins: number | null;
};

export async function POST(
  request: NextRequest
) {
  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const body =
      (await request.json()) as CopilotRequest;

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (message.length < 3) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Enter a question for the Copilot.",
        },
        { status: 400 }
      );
    }

    const normalizedMessage =
      message.toLowerCase();

    const intent =
      detectIntent(normalizedMessage);

    if (intent === "clients") {
      const destination =
        extractDestination(normalizedMessage);

      let query = supabase
        .from("clients")
        .select(
          [
            "id",
            "name",
            "email",
            "status",
            "vip_level",
            "preferred_destination",
            "lifetime_value",
          ].join(",")
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .order("updated_at", {
          ascending: false,
        })
        .limit(20);

      if (destination) {
        query = query.ilike(
          "preferred_destination",
          `%${destination}%`
        );
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(
          `Could not search clients: ${error.message}`
        );
      }

      const clients =
        (data ?? []) as unknown as ClientRow[];

      const results: CopilotResult[] =
        clients.map((client) => ({
          type: "client",
          title: client.name,
          subtitle: [
            client.email,
            client.preferred_destination,
            humanize(client.status ?? "active"),
          ]
            .filter(Boolean)
            .join(" · "),
          href: `/clients/${client.id}`,
        }));

      return NextResponse.json({
        success: true,
        intent,
        answer:
          results.length === 0
            ? "I found no matching clients in this workspace."
            : `I found ${results.length} matching client${
                results.length === 1 ? "" : "s"
              }.`,
        results,
      });
    }

    if (intent === "proposals") {
      let query = supabase
        .from("inquiries")
        .select(
          [
            "id",
            "reference",
            "client_name",
            "destination",
            "status",
            "budget_min",
            "budget_max",
            "currency",
            "proposal_status",
            "proposal_pdf",
          ].join(",")
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .order("updated_at", {
          ascending: false,
        })
        .limit(30);

      const { data, error } = await query;

      if (error) {
        throw new Error(
          `Could not search proposals: ${error.message}`
        );
      }

      const inquiries =
        (data ?? []) as unknown as InquiryRow[];

      const filtered =
        normalizedMessage.includes("draft")
          ? inquiries.filter((inquiry) =>
              normalizeStatus(
                inquiry.proposal_status ??
                  inquiry.status
              ).includes("draft")
            )
          : inquiries.filter(
              (inquiry) =>
                Boolean(inquiry.proposal_pdf) ||
                Boolean(
                  inquiry.proposal_status
                )
            );

      const results: CopilotResult[] =
        filtered.map((inquiry) => ({
          type: "proposal",
          title:
            inquiry.reference ??
            "Charter proposal",
          subtitle: [
            inquiry.client_name,
            inquiry.destination,
            humanize(
              inquiry.proposal_status ??
                inquiry.status ??
                "unknown"
            ),
          ]
            .filter(Boolean)
            .join(" · "),
          href: `/proposals/${inquiry.id}`,
        }));

      return NextResponse.json({
        success: true,
        intent,
        answer:
          results.length === 0
            ? "I found no matching proposals."
            : `I found ${results.length} matching proposal${
                results.length === 1
                  ? ""
                  : "s"
              }.`,
        results,
      });
    }

    if (intent === "yachts") {
      const destination =
        extractDestination(normalizedMessage);

      const maximumRate =
        extractMaximumRate(
          normalizedMessage
        );

      const guestCount =
        extractGuestCount(
          normalizedMessage
        );

      let query = supabase
        .from("yachts")
        .select(
          [
            "id",
            "name",
            "location",
            "status",
            "weekly_rate",
            "currency",
            "guests",
            "cabins",
          ].join(",")
        )
        .eq(
          "company_id",
          workspace.companyId
        )
        .limit(30);

      if (destination) {
        query = query.ilike(
          "location",
          `%${destination}%`
        );
      }

      if (maximumRate !== null) {
        query = query.lte(
          "weekly_rate",
          maximumRate
        );
      }

      if (guestCount !== null) {
        query = query.gte(
          "guests",
          guestCount
        );
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(
          `Could not search yachts: ${error.message}`
        );
      }

      const yachts =
        (data ?? []) as unknown as YachtRow[];

      const results: CopilotResult[] =
        yachts.map((yacht) => ({
          type: "yacht",
          title:
            yacht.name ?? "Unnamed yacht",
          subtitle: [
            yacht.location,
            formatRate(
              yacht.weekly_rate,
              yacht.currency
            ),
            yacht.guests
              ? `${yacht.guests} guests`
              : null,
            humanize(
              yacht.status ?? "unknown"
            ),
          ]
            .filter(Boolean)
            .join(" · "),
          href: `/fleet/${yacht.id}`,
        }));

      return NextResponse.json({
        success: true,
        intent,
        answer:
          results.length === 0
            ? "I found no matching yachts."
            : `I found ${results.length} matching yacht${
                results.length === 1
                  ? ""
                  : "s"
              }.`,
        results,
      });
    }

    const status =
      extractInquiryStatus(
        normalizedMessage
      );

    let query = supabase
      .from("inquiries")
      .select(
        [
          "id",
          "reference",
          "client_name",
          "destination",
          "status",
          "budget_min",
          "budget_max",
          "currency",
          "proposal_status",
          "proposal_pdf",
        ].join(",")
      )
      .eq(
        "company_id",
        workspace.companyId
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(25);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(
        `Could not search inquiries: ${error.message}`
      );
    }

    const inquiries =
      (data ?? []) as unknown as InquiryRow[];

    const results: CopilotResult[] =
      inquiries.map((inquiry) => ({
        type: "inquiry",
        title:
          inquiry.reference ?? "Inquiry",
        subtitle: [
          inquiry.client_name,
          inquiry.destination,
          humanize(
            inquiry.status ?? "new"
          ),
          formatBudget(inquiry),
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/workspace/inquiry/${inquiry.id}`,
      }));

    return NextResponse.json({
      success: true,
      intent: "inquiries",
      answer:
        results.length === 0
          ? "I found no matching inquiries."
          : `I found ${results.length} matching inquiry${
              results.length === 1
                ? ""
                : "ies"
            }.`,
      results,
    });
  } catch (error) {
    return handleRouteError(
      error,
      "Copilot request failed."
    );
  }
}

function detectIntent(
  message: string
):
  | "clients"
  | "proposals"
  | "yachts"
  | "inquiries" {
  if (
    message.includes("client") ||
    message.includes("customer") ||
    message.includes("vip")
  ) {
    return "clients";
  }

  if (
    message.includes("proposal") ||
    message.includes("draft pdf") ||
    message.includes("pdf")
  ) {
    return "proposals";
  }

  if (
    message.includes("yacht") ||
    message.includes("fleet") ||
    message.includes("boat") ||
    message.includes("available")
  ) {
    return "yachts";
  }

  return "inquiries";
}

function extractDestination(
  message: string
): string | null {
  const destinations = [
    "greece",
    "croatia",
    "italy",
    "france",
    "spain",
    "turkey",
    "monaco",
    "bahamas",
    "caribbean",
    "maldives",
    "dubai",
    "montenegro",
  ];

  return (
    destinations.find((destination) =>
      message.includes(destination)
    ) ?? null
  );
}

function extractMaximumRate(
  message: string
): number | null {
  const match = message.match(
    /(?:under|below|maximum|max|up to)\s*(?:€|eur)?\s*([\d.,]+)/i
  );

  if (!match) {
    return null;
  }

  const parsed = Number(
    match[1].replace(
      /[.,](?=\d{3}\b)/g,
      ""
    )
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function extractGuestCount(
  message: string
): number | null {
  const match = message.match(
    /(\d+)\s*(?:guests?|people|persons?)/i
  );

  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function extractInquiryStatus(
  message: string
): string | null {
  const statuses = [
    "new",
    "qualified",
    "proposal_sent",
    "negotiating",
    "won",
    "lost",
  ];

  return (
    statuses.find((status) =>
      message.includes(
        status.replace("_", " ")
      )
    ) ?? null
  );
}

function formatRate(
  value: number | string | null,
  currency: string | null
): string | null {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return new Intl.NumberFormat(
    "en-GB",
    {
      style: "currency",
      currency: currency ?? "EUR",
      maximumFractionDigits: 0,
    }
  ).format(amount);
}

function formatBudget(
  inquiry: InquiryRow
): string | null {
  const amount = Number(
    inquiry.budget_max ??
      inquiry.budget_min
  );

  if (!Number.isFinite(amount)) {
    return null;
  }

  return new Intl.NumberFormat(
    "en-GB",
    {
      style: "currency",
      currency:
        inquiry.currency ?? "EUR",
      maximumFractionDigits: 0,
    }
  ).format(amount);
}

function normalizeStatus(
  value: string | null
): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function humanize(
  value: string
): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}

function handleRouteError(
  error: unknown,
  fallbackMessage: string
) {
  if (
    isAuthenticationRequiredError(error)
  ) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: error.status }
    );
  }

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
      : fallbackMessage;

  console.error(
    "AI Copilot route failed:",
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