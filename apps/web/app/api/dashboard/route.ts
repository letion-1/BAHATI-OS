import { NextResponse } from "next/server";

import { isAuthenticationRequiredError } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AvailabilityStatus =
  | "available"
  | "provisional"
  | "option"
  | "booked"
  | "unavailable"
  | "maintenance";

type FleetRow = {
  id: string;
  name: string;
};

type AvailabilityRow = {
  id: string;
  fleet_id: string;
  region?: string | null;
  location?: string | null;
  embarkation_port?: string | null;
  source_id: string | null;
  start_date: string;
  end_date: string;
  status: AvailabilityStatus;
  weekly_rate: number | null;
  currency: string | null;
};

type SourceRow = {
  id: string;
  name: string;
  source_type: string;
  status: string | null;
  configuration: Record<string, unknown> | null;
  updated_at: string | null;
};

type ActivityRow = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
};

type ProposalRow = {
  id: string;
  reference: string | null;
  client_name: string | null;
  yacht_name: string | null;
  start_date: string | null;
  end_date: string | null;
  weekly_rate: number | string | null;
  budget_max: number | string | null;
  currency: string | null;
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required.",
        },
        { status: 401 }
      );
    }

    const today = formatDateKey(new Date());

    const [
      fleetResult,
      availabilityResult,
      sourcesResult,
      activitiesResult,
      clientsCountResult,
      proposalsResult,
    ] = await Promise.all([
      supabase
        .from("fleet")
        .select("id, name")
        .eq("company_id", workspace.companyId)
        .order("name", { ascending: true }),

      supabase
        .from("availability")
        .select(
          [
            "id",
            "fleet_id",
            "source_id",
            "start_date",
            "end_date",
            "status",
            "weekly_rate",
            "currency",
            "region",
            "location",
            "embarkation_port",
          ].join(",")
        )
        .eq("company_id", workspace.companyId)
        .gte("end_date", today)
        .order("start_date", { ascending: true }),

      supabase
        .from("data_sources")
        .select(
          [
            "id",
            "name",
            "source_type",
            "status",
            "configuration",
            "updated_at",
          ].join(",")
        )
        .eq("company_id", workspace.companyId)
        .order("name", { ascending: true }),

      supabase
        .from("activities")
        .select("id, title, description, created_at")
        .eq("company_id", workspace.companyId)
        .order("created_at", { ascending: false })
        .limit(10),

      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("company_id", workspace.companyId),

      supabase
        .from("inquiries")
        .select(
          [
            "id",
            "reference",
            "client_name",
            "yacht_name",
            "start_date",
            "end_date",
            "weekly_rate",
            "budget_max",
            "currency",
            "proposal_status",
            "proposal_pdf",
            "proposal_created_at",
            "proposal_sent_at",
            "created_at",
            "updated_at",
          ].join(",")
        )
        .eq("company_id", workspace.companyId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    assertQuery("fleet", fleetResult.error);
    assertQuery("availability", availabilityResult.error);
    assertQuery("data sources", sourcesResult.error);
    assertQuery("activities", activitiesResult.error);

    const fleet =
      (fleetResult.data ?? []) as unknown as FleetRow[];

    const availability =
      (availabilityResult.data ?? []) as unknown as AvailabilityRow[];

    const sources =
      (sourcesResult.data ?? []) as unknown as SourceRow[];

    const activities =
      (activitiesResult.data ?? []) as unknown as ActivityRow[];

    /*
     * Clients and proposals are newer OS modules. We keep the dashboard alive
     * if either table is temporarily unavailable while those modules are being
     * migrated, but expose zero rather than inventing data.
     */
    const clientCount =
      clientsCountResult.error ? 0 : clientsCountResult.count ?? 0;

    const proposals =
      proposalsResult.error
        ? []
        : ((proposalsResult.data ?? []) as unknown as ProposalRow[]);

    const fleetById = new Map(
      fleet.map((yacht) => [yacht.id, yacht])
    );

    const sourceById = new Map(
      sources.map((source) => [source.id, source])
    );

    const statusCounts: Record<AvailabilityStatus, number> = {
      available: 0,
      provisional: 0,
      option: 0,
      booked: 0,
      unavailable: 0,
      maintenance: 0,
    };

    for (const row of availability) {
      if (row.status in statusCounts) {
        statusCounts[row.status] += 1;
      }
    }

    const availableYachtIds = new Set(
      availability
        .filter((row) => row.status === "available")
        .map((row) => row.fleet_id)
    );

    const bookedYachtIds = new Set(
      availability
        .filter((row) => row.status === "booked")
        .map((row) => row.fleet_id)
    );

    const maintenanceYachtIds = new Set(
      availability
        .filter((row) => row.status === "maintenance")
        .map((row) => row.fleet_id)
    );

    const sourceStats = sources.map((source) => {
      const rowsForSource = availability.filter(
        (row) => row.source_id === source.id
      );

      const yachtIds = new Set(
        rowsForSource.map((row) => row.fleet_id)
      );

      return {
        id: source.id,
        name: source.name,
        type: source.source_type,
        status: source.status ?? "unknown",
        lastSyncedAt: getLastSyncedAt(source),
        yachtCount: yachtIds.size,
        availabilityCount: rowsForSource.length,
        error: getLastSyncError(source),
      };
    });

    const upcomingAvailability = availability
      .filter((row) => row.status === "available")
      .slice(0, 6)
      .map((row) => ({
        id: row.id,
        yachtId: row.fleet_id,
        yachtName:
          fleetById.get(row.fleet_id)?.name ?? "Unknown yacht",
        startDate: row.start_date,
        endDate: row.end_date,
        weeklyRate: row.weekly_rate,
        currency: row.currency ?? "EUR",
        sourceName: row.source_id
          ? sourceById.get(row.source_id)?.name ?? null
          : null,
      }));

    const proposalPipeline = buildProposalPipeline(proposals);
    const proposalCount = proposals.length;
    const documentCount = proposals.filter(
      (proposal) => Boolean(proposal.proposal_pdf)
    ).length;
    const revenuePipeline = proposals.reduce(
      (total, proposal) => {
        const status = normalizeStatus(proposal.proposal_status);

        if (
          status === "rejected" ||
          status === "cancelled" ||
          status === "archived"
        ) {
          return total;
        }

        return (
          total +
          (toFiniteNumber(proposal.budget_max) ??
            toFiniteNumber(proposal.weekly_rate) ??
            0)
        );
      },
      0
    );

    const upcomingEmbarkations = proposals
      .filter(
        (proposal) =>
          proposal.start_date &&
          proposal.start_date >= today
      )
      .sort((left, right) =>
        String(left.start_date).localeCompare(
          String(right.start_date)
        )
      )
      .slice(0, 5)
      .map((proposal) => ({
        id: proposal.id,
        reference:
          proposal.reference ?? `PROP-${proposal.id.slice(0, 8)}`,
        clientName: proposal.client_name ?? "Unnamed client",
        yachtName: proposal.yacht_name ?? "Selected yacht",
        startDate: proposal.start_date,
        endDate: proposal.end_date,
        status: normalizeStatus(
          proposal.proposal_status || "draft"
        ),
      }));

    const latestProposal = proposals
      .filter(
        (proposal) =>
          proposal.proposal_created_at ||
          proposal.created_at
      )
      .sort(
        (left, right) =>
          dateValue(
            right.proposal_created_at ?? right.created_at
          ) -
          dateValue(
            left.proposal_created_at ?? left.created_at
          )
      )[0];

    const sourceErrors = sourceStats.filter(
      (source) =>
        (source.status ?? "unknown").toLowerCase() === "error" ||
        Boolean(source.error)
    ).length;

    const health = buildWorkspaceHealth({
      sourceCount: sources.length,
      healthySourceCount: sources.filter(
        (source) =>
          (source.status ?? "unknown").toLowerCase() === "healthy"
      ).length,
      sourceErrors,
      maintenanceYachtCount: maintenanceYachtIds.size,
      clientCount,
      proposalCount,
      documentCount,
    });

    const aiSuggestions = buildAiSuggestions({
      sourceErrors,
      maintenanceYachtCount: maintenanceYachtIds.size,
      proposalPipeline,
      clientCount,
      proposalCount,
      documentCount,
      upcomingEmbarkationCount: upcomingEmbarkations.length,
    });

    const latestUpdate = getLatestDate([
      ...sources.map((source) => getLastSyncedAt(source)),
      ...activities.map((activity) => activity.created_at),
      ...proposals.map(
        (proposal) =>
          proposal.updated_at ??
          proposal.proposal_created_at ??
          proposal.created_at
      ),
    ]);

    const displayName = getDisplayName(user);

    return NextResponse.json(
      {
        success: true,

        user: {
          id: user.id,
          email: user.email ?? null,
          displayName,
          firstName: getFirstName(displayName),
        },

        workspace: {
          id: workspace.companyId,
        },

        overview: {
          yachtCount: fleet.length,
          availableYachtCount: availableYachtIds.size,
          bookedYachtCount: bookedYachtIds.size,
          maintenanceYachtCount: maintenanceYachtIds.size,
          sourceCount: sources.length,
          healthySourceCount: sources.filter(
            (source) =>
              (source.status ?? "unknown").toLowerCase() === "healthy"
          ).length,
          clientCount,
          proposalCount,
          documentCount,
          revenuePipeline,
          defaultCurrency:
            proposals.find((proposal) => proposal.currency)
              ?.currency ?? "EUR",
          latestUpdate,
          latestProposal: latestProposal
            ? {
                id: latestProposal.id,
                reference:
                  latestProposal.reference ??
                  `PROP-${latestProposal.id.slice(0, 8)}`,
                createdAt:
                  latestProposal.proposal_created_at ??
                  latestProposal.created_at,
              }
            : null,
        },

        availability: statusCounts,
        destinations: summariseDestinations(availability),
        upcomingAvailability,
        upcomingEmbarkations,
        proposalPipeline,
        sources: sourceStats,
        health,
        aiSuggestions,

        activities: activities.map((activity) => ({
          id: activity.id,
          title: activity.title,
          description: activity.description,
          createdAt: activity.created_at,
        })),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    if (isAuthenticationRequiredError(error)) {
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
        : "Could not load dashboard.";

    console.error("Dashboard API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

function assertQuery(
  label: string,
  error: { message: string } | null
) {
  if (error) {
    throw new Error(
      `Could not load ${label}: ${error.message}`
    );
  }
}

function buildProposalPipeline(proposals: ProposalRow[]) {
  const pipeline = {
    draft: 0,
    ready: 0,
    sent: 0,
    viewed: 0,
    accepted: 0,
  };

  for (const proposal of proposals) {
    const status = normalizeStatus(proposal.proposal_status);

    if (status in pipeline) {
      pipeline[status as keyof typeof pipeline] += 1;
      continue;
    }

    if (status === "generated") {
      pipeline.ready += 1;
    }
  }

  return pipeline;
}

function buildWorkspaceHealth(input: {
  sourceCount: number;
  healthySourceCount: number;
  sourceErrors: number;
  maintenanceYachtCount: number;
  clientCount: number;
  proposalCount: number;
  documentCount: number;
}) {
  let score = 100;
  const checks: Array<{
    label: string;
    state: "healthy" | "warning";
  }> = [];

  if (
    input.sourceCount === 0 ||
    input.healthySourceCount < input.sourceCount
  ) {
    score -= input.sourceCount === 0 ? 20 : 10;
    checks.push({
      label:
        input.sourceCount === 0
          ? "No data sources connected"
          : "Some sources need attention",
      state: "warning",
    });
  } else {
    checks.push({
      label: "All connected sources are healthy",
      state: "healthy",
    });
  }

  if (input.sourceErrors > 0) {
    score -= Math.min(20, input.sourceErrors * 8);
    checks.push({
      label: `${input.sourceErrors} source ${
        input.sourceErrors === 1 ? "error" : "errors"
      } detected`,
      state: "warning",
    });
  } else {
    checks.push({
      label: "No source errors detected",
      state: "healthy",
    });
  }

  if (input.maintenanceYachtCount > 0) {
    score -= Math.min(10, input.maintenanceYachtCount * 3);
    checks.push({
      label: `${input.maintenanceYachtCount} ${
        input.maintenanceYachtCount === 1
          ? "yacht is"
          : "yachts are"
      } in maintenance`,
      state: "warning",
    });
  } else {
    checks.push({
      label: "No maintenance blocks",
      state: "healthy",
    });
  }

  if (input.clientCount === 0) {
    score -= 8;
    checks.push({
      label: "Client CRM has no records yet",
      state: "warning",
    });
  } else {
    checks.push({
      label: "Client CRM contains active records",
      state: "healthy",
    });
  }

  if (input.proposalCount > 0 && input.documentCount === 0) {
    score -= 8;
    checks.push({
      label: "No generated proposal documents found",
      state: "warning",
    });
  } else {
    checks.push({
      label: "Proposal document engine is operational",
      state: "healthy",
    });
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    checks,
  };
}

function buildAiSuggestions(input: {
  sourceErrors: number;
  maintenanceYachtCount: number;
  proposalPipeline: {
    draft: number;
    ready: number;
    sent: number;
    viewed: number;
    accepted: number;
  };
  clientCount: number;
  proposalCount: number;
  documentCount: number;
  upcomingEmbarkationCount: number;
}) {
  const suggestions: Array<{
    id: string;
    title: string;
    description: string;
    href: string;
    priority: "high" | "medium" | "low";
  }> = [];

  if (input.sourceErrors > 0) {
    suggestions.push({
      id: "source-errors",
      title: "Resolve source synchronization errors",
      description: `${input.sourceErrors} connected ${
        input.sourceErrors === 1 ? "source requires" : "sources require"
      } attention before the next availability refresh.`,
      href: "/data-sources",
      priority: "high",
    });
  }

  if (input.proposalPipeline.draft > 0) {
    suggestions.push({
      id: "draft-proposals",
      title: "Move draft proposals forward",
      description: `${input.proposalPipeline.draft} draft ${
        input.proposalPipeline.draft === 1
          ? "proposal is"
          : "proposals are"
      } waiting for review or generation.`,
      href: "/proposals",
      priority: "medium",
    });
  }

  if (
    input.proposalCount > 0 &&
    input.documentCount < input.proposalCount
  ) {
    suggestions.push({
      id: "missing-documents",
      title: "Generate missing proposal documents",
      description:
        "Some proposal records do not yet have a stored PDF version.",
      href: "/proposals",
      priority: "medium",
    });
  }

  if (input.clientCount === 0) {
    suggestions.push({
      id: "add-client",
      title: "Create your first client profile",
      description:
        "Add client preferences and contact details to accelerate future proposals.",
      href: "/clients",
      priority: "medium",
    });
  }

  if (input.maintenanceYachtCount > 0) {
    suggestions.push({
      id: "maintenance",
      title: "Review maintenance-blocked yachts",
      description: `${input.maintenanceYachtCount} ${
        input.maintenanceYachtCount === 1 ? "yacht is" : "yachts are"
      } currently affected by maintenance availability.`,
      href: "/availability",
      priority: "low",
    });
  }

  if (input.upcomingEmbarkationCount > 0) {
    suggestions.push({
      id: "embarkations",
      title: "Review upcoming embarkations",
      description:
        "Confirm proposal, document and client details before the next charter start date.",
      href: "/proposals",
      priority: "low",
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: "healthy-workspace",
      title: "Workspace operating normally",
      description:
        "Fleet data, documents and proposal workflows are reporting no immediate issues.",
      href: "/reports",
      priority: "low",
    });
  }

  return suggestions.slice(0, 4);
}

function normalizeStatus(value: string | null): string {
  return (value ?? "draft").trim().toLowerCase();
}

function toFiniteNumber(
  value: number | string | null
): number | null {
  if (value === null || value === "") {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^\d.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: string | null): number {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getDisplayName(user: {
  email?: string;
  user_metadata?: Record<string, unknown>;
}): string {
  const metadata = user.user_metadata ?? {};

  const possibleNames = [
    metadata.full_name,
    metadata.name,
    metadata.display_name,
    metadata.first_name,
  ];

  for (const value of possibleNames) {
    if (
      typeof value === "string" &&
      value.trim().length > 0
    ) {
      return value.trim();
    }
  }

  if (user.email) {
    const emailName = user.email.split("@")[0];

    return emailName
      .split(/[._-]+/)
      .filter(Boolean)
      .map(
        (part) =>
          part.charAt(0).toUpperCase() +
          part.slice(1).toLowerCase()
      )
      .join(" ");
  }

  return "Captain";
}

function getFirstName(displayName: string): string {
  const firstName = displayName.trim().split(/\s+/)[0];
  return firstName || "Captain";
}

function getLastSyncedAt(source: SourceRow): string | null {
  const configuration = source.configuration;

  if (!configuration || typeof configuration !== "object") {
    return source.updated_at;
  }

  const lastSync = configuration.last_sync;

  if (
    !lastSync ||
    typeof lastSync !== "object" ||
    Array.isArray(lastSync)
  ) {
    return source.updated_at;
  }

  const finishedAt = (
    lastSync as Record<string, unknown>
  ).finished_at;

  return typeof finishedAt === "string"
    ? finishedAt
    : source.updated_at;
}

function getLastSyncError(source: SourceRow): string | null {
  const configuration = source.configuration;

  if (!configuration || typeof configuration !== "object") {
    return null;
  }

  const lastSync = configuration.last_sync;

  if (
    !lastSync ||
    typeof lastSync !== "object" ||
    Array.isArray(lastSync)
  ) {
    return null;
  }

  const error = (
    lastSync as Record<string, unknown>
  ).error;

  return typeof error === "string" ? error : null;
}

function getLatestDate(
  values: Array<string | null | undefined>
): string | null {
  const timestamps = values
    .filter(
      (value): value is string =>
        typeof value === "string" && value.length > 0
    )
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(
    2,
    "0"
  );
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Group open availability by cruising region for the dashboard map and the
 * destinations panel.
 *
 * Only rows with status "available" are counted. A booked week is not a
 * destination a broker can offer, and showing it as one is how a client ends
 * up quoted a yacht that is already chartered.
 *
 * Region is preferred over location because operators write location
 * inconsistently ("Split", "Split, Croatia", "SPLIT"), whereas region is
 * normalised by the parsers. Location is the fallback when region is absent.
 */
function summariseDestinations(
  rows: AvailabilityRow[]
): { region: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (row.status !== "available") {
      continue;
    }

    const label =
      cleanRegionLabel(row.region) ??
      cleanRegionLabel(row.location) ??
      cleanRegionLabel(row.embarkation_port);

    if (!label) {
      continue;
    }

    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([region, count]) => ({ region, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 8);
}

function cleanRegionLabel(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  // "Split, Croatia" -> "Croatia". Operators frequently qualify a port with
  // its country, and the country is the useful grouping.
  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  const label = parts.length > 1 ? parts[parts.length - 1] : parts[0];

  return label.charAt(0).toUpperCase() + label.slice(1);
}