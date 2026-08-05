import { NextRequest, NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InquiryRow = {
  id: string;
  status: string | null;
  destination: string | null;
  budget_min: number | string | null;
  budget_max: number | string | null;
  proposal_status: string | null;
  created_at: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const workspace = await getCurrentWorkspace();
    const supabase = await createClient();

    const from = request.nextUrl.searchParams.get("from")?.trim() ?? "";
    const to = request.nextUrl.searchParams.get("to")?.trim() ?? "";

    let inquiryQuery = supabase
      .from("inquiries")
      .select(
        "id,status,destination,budget_min,budget_max,proposal_status,created_at"
      )
      .eq("company_id", workspace.companyId)
      .order("created_at", { ascending: true });

    if (from) {
      inquiryQuery = inquiryQuery.gte(
        "created_at",
        `${from}T00:00:00.000Z`
      );
    }

    if (to) {
      inquiryQuery = inquiryQuery.lte(
        "created_at",
        `${to}T23:59:59.999Z`
      );
    }

    const [
      inquiriesResult,
      clientsResult,
      yachtsResult,
      documentsResult,
    ] = await Promise.all([
      inquiryQuery,
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("company_id", workspace.companyId),
      supabase
        .from("yachts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", workspace.companyId),
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("company_id", workspace.companyId),
    ]);

    if (inquiriesResult.error) {
      throw new Error(inquiriesResult.error.message);
    }

    for (const [label, result] of [
      ["clients", clientsResult],
      ["yachts", yachtsResult],
      ["documents", documentsResult],
    ] as const) {
      if (result.error) {
        throw new Error(
          `Could not count ${label}: ${result.error.message}`
        );
      }
    }

    const inquiries =
      (inquiriesResult.data ?? []) as unknown as InquiryRow[];

    const totalInquiries = inquiries.length;
    const wonInquiries = inquiries.filter(
      (item) => normalizeStatus(item.status) === "won"
    ).length;
    const lostInquiries = inquiries.filter(
      (item) => normalizeStatus(item.status) === "lost"
    ).length;
    const proposalCount = inquiries.filter(
      (item) => Boolean(item.proposal_status)
    ).length;
    const openInquiries = inquiries.filter(
      (item) =>
        !["won", "lost"].includes(
          normalizeStatus(item.status)
        )
    ).length;

    const pipelineValue = inquiries
      .filter(
        (item) =>
          !["won", "lost"].includes(
            normalizeStatus(item.status)
          )
      )
      .reduce(
        (sum, item) =>
          sum +
          firstFiniteNumber(
            item.budget_max,
            item.budget_min
          ),
        0
      );

    const wonValue = inquiries
      .filter(
        (item) => normalizeStatus(item.status) === "won"
      )
      .reduce(
        (sum, item) =>
          sum +
          firstFiniteNumber(
            item.budget_max,
            item.budget_min
          ),
        0
      );

    return NextResponse.json({
      success: true,
      metrics: {
        totalInquiries,
        openInquiries,
        wonInquiries,
        lostInquiries,
        proposalCount,
        clientCount: clientsResult.count ?? 0,
        yachtCount: yachtsResult.count ?? 0,
        documentCount: documentsResult.count ?? 0,
        pipelineValue,
        wonValue,
        conversionRate:
          totalInquiries === 0
            ? 0
            : (wonInquiries / totalInquiries) * 100,
        proposalRate:
          totalInquiries === 0
            ? 0
            : (proposalCount / totalInquiries) * 100,
        averageInquiryValue:
          totalInquiries === 0
            ? 0
            : inquiries.reduce(
                (sum, item) =>
                  sum +
                  firstFiniteNumber(
                    item.budget_max,
                    item.budget_min
                  ),
                0
              ) / totalInquiries,
      },
      statusBreakdown: groupCounts(
        inquiries.map((item) =>
          normalizeStatus(item.status)
        )
      ),
      destinationBreakdown: groupCounts(
        inquiries.map(
          (item) =>
            item.destination?.trim() || "Not specified"
        )
      ).slice(0, 10),
      monthlyInquiries: groupMonths(inquiries),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleRouteError(error, "Could not load reports.");
  }
}

function groupCounts(values: string[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function groupMonths(inquiries: InquiryRow[]) {
  const counts = new Map<string, number>();

  for (const inquiry of inquiries) {
    if (!inquiry.created_at) continue;

    const date = new Date(inquiry.created_at);
    if (Number.isNaN(date.getTime())) continue;

    const key = `${date.getUTCFullYear()}-${String(
      date.getUTCMonth() + 1
    ).padStart(2, "0")}`;

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const [year, month] = key.split("-");
      const label = new Intl.DateTimeFormat("en-GB", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(
        new Date(
          Date.UTC(
            Number(year),
            Number(month) - 1,
            1
          )
        )
      );

      return { label, value };
    });
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function normalizeStatus(value: string | null) {
  return (value ?? "new")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function handleRouteError(
  error: unknown,
  fallbackMessage: string
) {
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

  const message =
    error instanceof Error ? error.message : fallbackMessage;

  console.error("Reports API failed:", error);

  return NextResponse.json(
    { success: false, error: message },
    { status: 500 }
  );
}