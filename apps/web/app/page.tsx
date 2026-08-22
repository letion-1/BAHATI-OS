"use client";

import Link from "next/link";
import {
  Anchor,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileText,
  Mail,
  RefreshCw,
  Ship,
  Users,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { HeroCard } from "@/components/ui/hero-card";
import {
  AvailabilityOverview,
  TopDestinations,
} from "@/components/dashboard/availability-overview";
import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";

type OperatingModel =
  | "independent_brokerage"
  | "yacht_management"
  | "controlled_fleet"
  | "mixed_operation";

type AvailabilityStatus =
  | "available"
  | "provisional"
  | "option"
  | "booked"
  | "unavailable"
  | "maintenance";

type DashboardResponse = {
  success: boolean;

  user: {
    id: string;
    email: string | null;
    displayName: string;
    firstName: string;
  };

  workspace: {
    id: string;
  };

  overview: {
    yachtCount: number;
    availableYachtCount: number;
    bookedYachtCount: number;
    maintenanceYachtCount: number;
    sourceCount: number;
    healthySourceCount: number;
    latestUpdate: string | null;
  };

  availability: Record<
    AvailabilityStatus,
    number
  >;

  destinations: Array<{
    region: string;
    count: number;
  }>;

  upcomingAvailability: Array<{
    id: string;
    yachtId: string;
    yachtName: string;
    startDate: string;
    endDate: string;
    weeklyRate: number | null;
    currency: string;
    sourceName: string | null;
  }>;

  sources: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    lastSyncedAt: string | null;
    yachtCount: number;
    availabilityCount: number;
    error: string | null;
  }>;

  activities: Array<{
    id: string;
    title: string;
    description: string | null;
    createdAt: string;
  }>;

  error?: string;
};

type WorkspaceIntelligenceResponse = {
  success: boolean;

  workspaceProfile: {
    companyName: string;
    operatingModel: OperatingModel;
    primaryMarket: string | null;
    yachtAccessBand: string | null;
  };

  accessSummary: {
    totalYachts: number;
    classifiedYachts: number;
    unclassifiedYachts: number;

    controlled: number;
    managed: number;
    brokerAccess: number;
    reference: number;

    controlledAvailable: number;
    controlledBooked: number;

    managedAvailable: number;
    managedBooked: number;

    brokerSourceAvailable: number;

    pendingManagerVerification: number;
    pendingOwnerApproval: number;
  };

  workSummary: {
    activeInquiryCount: number;
    proposalCount: number;
  };

  error?: string;
};

type ActionCard = {
  title: string;
  description: string;
  href: string;
  icon: typeof Ship;
};

type StatDefinition = {
  label: string;
  value: number | string;
  subtitle: string;
  tone:
    | "cyan"
    | "emerald"
    | "violet"
    | "amber";
  icon: ReactNode;
};

const modelLabels: Record<
  OperatingModel,
  string
> = {
  independent_brokerage:
    "Independent Charter Brokerage",
  yacht_management:
    "Yacht Management / Clearing House",
  controlled_fleet:
    "Controlled Charter Fleet",
  mixed_operation:
    "Mixed Operation",
};

const modelDescriptions: Record<
  OperatingModel,
  string
> = {
  independent_brokerage:
    "Your cockpit prioritizes client inquiries, external yacht access, availability verification and proposals before anything is offered.",
  yacht_management:
    "Your cockpit prioritizes managed yachts, owner or Charter Manager approvals, charter requests and operational availability.",
  controlled_fleet:
    "Your cockpit prioritizes the yachts whose calendars your company controls, including open inventory, bookings and direct charter workflow.",
  mixed_operation:
    "Your cockpit blends controlled fleet operations, managed yachts and external brokerage access in one operating view.",
};

export default function MissionControlPage() {
  const [dashboard, setDashboard] =
    useState<DashboardResponse | null>(
      null
    );

  const [
    intelligence,
    setIntelligence,
  ] =
    useState<WorkspaceIntelligenceResponse | null>(
      null
    );

  const [isLoading, setIsLoading] =
    useState(true);

  const [isRefreshing, setIsRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const loadMissionControl =
    useCallback(
      async (refreshing = false) => {
        try {
          refreshing
            ? setIsRefreshing(true)
            : setIsLoading(true);

          setError(null);

          const [
            dashboardResponse,
            intelligenceResponse,
          ] = await Promise.all([
            fetch("/api/dashboard", {
              method: "GET",
              cache: "no-store",
            }),
            fetch(
              "/api/workspace-intelligence",
              {
                method: "GET",
                cache: "no-store",
              }
            ),
          ]);

          const dashboardPayload =
            (await dashboardResponse.json()) as DashboardResponse;

          const intelligencePayload =
            (await intelligenceResponse.json()) as WorkspaceIntelligenceResponse;

          if (
            !dashboardResponse.ok ||
            !dashboardPayload.success
          ) {
            throw new Error(
              dashboardPayload.error ??
                "Could not load Mission Control."
            );
          }

          if (
            !intelligenceResponse.ok ||
            !intelligencePayload.success
          ) {
            throw new Error(
              intelligencePayload.error ??
                "Could not load the company operating model."
            );
          }

          setDashboard(
            dashboardPayload
          );

          setIntelligence(
            intelligencePayload
          );
        } catch (caughtError) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not load Mission Control."
          );
        } finally {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      },
      []
    );

  useEffect(() => {
    void loadMissionControl(false);
  }, [loadMissionControl]);

  const cockpit = useMemo(() => {
    if (!intelligence) {
      return null;
    }

    return buildCockpit(
      intelligence.workspaceProfile
        .operatingModel,
      intelligence
    );
  }, [
    intelligence,
    dashboard,
  ]);

  if (isLoading) {
    return <MissionControlSkeleton />;
  }

  if (
    !dashboard ||
    !intelligence ||
    !cockpit
  ) {
    return (
      <PageContainer>
        <HeroCard
          eyebrow="Mission Control"
          title="Dashboard unavailable"
          description="Bahari OS could not load the company-aware operating view."
        />

        <div className="mt-7 rounded-[24px] border border-red-500/25 bg-red-500/10 p-5 text-sm text-red-700 dark:text-red-200">
          {error ??
            "Could not load Mission Control."}

          <button
            type="button"
            onClick={() =>
              void loadMissionControl(false)
            }
            className="ui-primary-button mt-5 inline-flex min-h-10 items-center justify-center gap-2 px-4 text-xs font-semibold"
          >
            <RefreshCw className="size-4" />
            Try again
          </button>
        </div>
      </PageContainer>
    );
  }

  const greeting =
    getGreeting();

  return (
    <PageContainer contentClassName="space-y-7">
      <HeroCard
        eyebrow={`${modelLabels[intelligence.workspaceProfile.operatingModel]} · Mission Control`}
        title={`${greeting}, ${dashboard.user.firstName}.`}
        description={
          cockpit.description
        }
        footer={
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>
              <strong className="font-medium text-[var(--hero-foreground)]">
                {
                  intelligence
                    .workspaceProfile
                    .companyName
                }
              </strong>
            </span>

            {intelligence.workspaceProfile
              .primaryMarket ? (
              <>
                <span className="hidden size-1 rounded-full bg-current/30 sm:block" />
                <span>
                  Primary market:{" "}
                  <strong className="font-medium text-[var(--hero-foreground)]">
                    {
                      intelligence
                        .workspaceProfile
                        .primaryMarket
                    }
                  </strong>
                </span>
              </>
            ) : null}

            <span className="hidden size-1 rounded-full bg-current/30 sm:block" />

            <span>
              Last update:{" "}
              <strong className="font-medium text-[var(--hero-foreground)]">
                {formatDateTime(
                  dashboard.overview
                    .latestUpdate
                )}
              </strong>
            </span>
          </div>
        }
        actions={
          <button
            type="button"
            onClick={() =>
              void loadMissionControl(true)
            }
            disabled={isRefreshing}
            className="ui-primary-button apple-transition inline-flex min-h-12 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`size-4 ${
                isRefreshing
                  ? "animate-spin"
                  : ""
              }`}
            />
            {isRefreshing
              ? "Refreshing"
              : "Refresh"}
          </button>
        }
      />

      {error ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-4 text-sm text-amber-800 dark:text-amber-100">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cockpit.stats.map(
          (stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              subtitle={stat.subtitle}
              tone={stat.tone}
              icon={stat.icon}
            />
          )
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <DashboardPanel
          eyebrow="Operating model"
          title={
            modelLabels[
              intelligence
                .workspaceProfile
                .operatingModel
            ]
          }
          description={
            cockpit.modelExplanation
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ModelSignal
              label="Default workflow"
              value={
                cockpit.defaultWorkflow
              }
            />

            <ModelSignal
              label="Booking authority"
              value={
                cockpit.bookingAuthority
              }
            />

            <ModelSignal
              label="Verification posture"
              value={
                cockpit.verificationPosture
              }
            />

            <ModelSignal
              label="Yacht access"
              value={
                formatAccessBand(
                  intelligence
                    .workspaceProfile
                    .yachtAccessBand
                )
              }
            />
          </div>

          <p className="mt-5 text-xs leading-5 text-muted-foreground">
            This company setting controls the default cockpit. Individual yachts still follow their own Controlled, Managed, Broker Access or Reference classification.
          </p>
        </DashboardPanel>

        <DashboardPanel
          eyebrow="Yacht relationships"
          title="Access mix"
          description="How this workspace is allowed to work with its yacht catalogue"
        >
          <div className="grid grid-cols-2 gap-3">
            <AccessMetric
              label="Controlled"
              value={
                intelligence.accessSummary
                  .controlled
              }
              detail="Your calendar authority"
            />

            <AccessMetric
              label="Managed"
              value={
                intelligence.accessSummary
                  .managed
              }
              detail="Owner approval model"
            />

            <AccessMetric
              label="Broker access"
              value={
                intelligence.accessSummary
                  .brokerAccess
              }
              detail="Verification workflow"
            />

            <AccessMetric
              label="Reference"
              value={
                intelligence.accessSummary
                  .reference
              }
              detail="Internal discovery only"
            />
          </div>

          {intelligence.accessSummary
            .unclassifiedYachts > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.08] px-4 py-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
              {
                intelligence
                  .accessSummary
                  .unclassifiedYachts
              }{" "}
              yacht
              {intelligence
                .accessSummary
                .unclassifiedYachts === 1
                ? ""
                : "s"}{" "}
              still need an access classification.
            </div>
          ) : null}
        </DashboardPanel>
      </section>

      <DashboardPanel
        eyebrow="Priority desk"
        title={cockpit.priorityTitle}
        description={cockpit.priorityDescription}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cockpit.actions.map(
            (action) => (
              <QuickAction
                key={action.title}
                {...action}
              />
            )
          )}
        </div>
      </DashboardPanel>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardPanel
          eyebrow="Availability"
          title={cockpit.availabilityTitle}
          description={
            cockpit.availabilityDescription
          }
          action={
            <Link
              href="/availability"
              className="text-xs font-semibold text-foreground underline-offset-4 hover:underline"
            >
              Open availability
            </Link>
          }
        >
          {dashboard.upcomingAvailability
            .length === 0 ? (
            <EmptyState
              title="No upcoming availability"
              description="Available charter windows will appear after connected sources synchronize."
            />
          ) : (
            <div className="divide-y divide-border">
              {dashboard.upcomingAvailability
                .slice(0, 5)
                .map((item) => (
                  <Link
                    key={item.id}
                    href={`/availability?startDate=${item.startDate}`}
                    className="group flex items-start justify-between gap-5 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground group-hover:underline">
                        {item.yachtName}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateRange(
                          item.startDate,
                          item.endDate
                        )}
                      </p>

                      <p className="mt-1 truncate text-[11px] text-muted-foreground/75">
                        Source:{" "}
                        {item.sourceName ??
                          "Unknown source"}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold text-foreground">
                        {formatRate(
                          item.weeklyRate,
                          item.currency
                        )}
                      </p>
                    </div>
                  </Link>
                ))}
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel
          eyebrow="Data layer"
          title="Source health"
          description="The synchronization layer supporting this workspace"
          action={
            <Link
              href="/data-sources"
              className="text-xs font-semibold text-foreground underline-offset-4 hover:underline"
            >
              Manage sources
            </Link>
          }
        >
          {dashboard.sources.length ===
          0 ? (
            <EmptyState
              title="No connected sources"
              description="Connect the first yacht or supplier source to begin building the catalogue."
            />
          ) : (
            <div className="space-y-3">
              {dashboard.sources
                .slice(0, 4)
                .map((source) => (
                  <div
                    key={source.id}
                    className="ui-panel-soft rounded-2xl p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {source.name}
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatSourceType(
                            source.type
                          )}
                        </p>
                      </div>

                      <SourceStatusBadge
                        status={
                          source.status
                        }
                      />
                    </div>

                    <div className="mt-4 flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span>
                        {source.yachtCount} yachts
                      </span>
                      <span>
                        {
                          source.availabilityCount
                        }{" "}
                        windows
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </DashboardPanel>
      </section>

      {/*
        Availability overview and destinations, side by side on wide screens
        and stacked below. The map is two thirds of the width because it is
        the orienting element; the ranked list reads fine narrow.
      */}
      <section className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AvailabilityOverview
            destinations={dashboard.destinations ?? []}
          />
        </div>

        <TopDestinations
          destinations={dashboard.destinations ?? []}
        />
      </section>

      <DashboardPanel
        eyebrow="Workspace activity"
        title="Recent activity"
        description="Latest operational events across this company"
      >
        {dashboard.activities.length ===
        0 ? (
          <EmptyState
            title="No recent activity"
            description="Imports, proposals and other Bahari OS events will appear here."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {dashboard.activities
              .slice(0, 6)
              .map((activity) => (
                <div
                  key={activity.id}
                  className="ui-panel-soft flex gap-3 rounded-2xl p-4"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="size-4" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {activity.title}
                    </p>

                    {activity.description ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {
                          activity.description
                        }
                      </p>
                    ) : null}

                    <p className="mt-2 text-[10px] text-muted-foreground/70">
                      {formatRelativeTime(
                        activity.createdAt
                      )}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        )}
      </DashboardPanel>
    </PageContainer>
  );
}

function buildCockpit(
  operatingModel: OperatingModel,
  intelligence: WorkspaceIntelligenceResponse
) {
  const access =
    intelligence.accessSummary;

  const work =
    intelligence.workSummary;

  if (
    operatingModel ===
    "independent_brokerage"
  ) {
    return {
      description:
        modelDescriptions[operatingModel],
      modelExplanation:
        "Bahari OS assumes most charter inventory is not controlled by your company. Matching therefore emphasizes source intelligence, Yachtfolio or network checks and fresh Charter Manager confirmation.",
      defaultWorkflow:
        "Inquiry → Match → Verify → Proposal",
      bookingAuthority:
        "External owner / Charter Manager",
      verificationPosture:
        "Verification before offer",
      priorityTitle:
        "Broker desk",
      priorityDescription:
        "Move client requests from inquiry to verified shortlist and proposal",
      availabilityTitle:
        "Source availability intelligence",
      availabilityDescription:
        "Treat connected availability as a shortlist signal until the relevant authority confirms the dates",
      stats: [
        {
          label: "Active inquiries",
          value: work.activeInquiryCount,
          subtitle:
            "Client requests in the workspace",
          tone: "cyan" as const,
          icon: (
            <Users className="size-4" />
          ),
        },
        {
          label: "Broker-access yachts",
          value: access.brokerAccess,
          subtitle:
            "External inventory classified for brokerage",
          tone: "violet" as const,
          icon: (
            <Ship className="size-4" />
          ),
        },
        {
          label: "Verification pending",
          value:
            access.pendingManagerVerification,
          subtitle:
            "Latest manager signal is pending",
          tone: "amber" as const,
          icon: (
            <ClipboardCheck className="size-4" />
          ),
        },
        {
          label: "Proposals",
          value: work.proposalCount,
          subtitle:
            "Proposal records created",
          tone: "emerald" as const,
          icon: (
            <FileText className="size-4" />
          ),
        },
      ] satisfies StatDefinition[],
      actions: [
        {
          title: "Open inquiries",
          description:
            "Start with the client request",
          href: "/inquiries",
          icon: Users,
        },
        {
          title: "Match yachts",
          description:
            "Open an inquiry and build a shortlist",
          href: "/inquiries",
          icon: Ship,
        },
        {
          title: "Verification email",
          description:
            "Review manager confirmation drafts",
          href: "/email",
          icon: Mail,
        },
        {
          title: "Proposals",
          description:
            "Turn a verified yacht into an offer",
          href: "/proposals",
          icon: FileText,
        },
      ] satisfies ActionCard[],
    };
  }

  if (
    operatingModel ===
    "yacht_management"
  ) {
    return {
      description:
        modelDescriptions[operatingModel],
      modelExplanation:
        "Bahari OS assumes your company manages charter yachts for owners. Internal calendar intelligence matters, but an owner or Charter Manager approval step can still control whether a charter proceeds.",
      defaultWorkflow:
        "Request → Calendar → Owner approval → Contract",
      bookingAuthority:
        "Owner / delegated Charter Manager",
      verificationPosture:
        "Approval driven",
      priorityTitle:
        "Management desk",
      priorityDescription:
        "Keep managed inventory, charter requests and owner approvals moving",
      availabilityTitle:
        "Managed yacht availability",
      availabilityDescription:
        "Availability helps qualify the request, while owner or delegated approval remains visible as a separate authority",
      stats: [
        {
          label: "Managed yachts",
          value: access.managed,
          subtitle:
            "Yachts classified under management",
          tone: "cyan" as const,
          icon: (
            <Building2 className="size-4" />
          ),
        },
        {
          label: "Owner approvals",
          value:
            access.pendingOwnerApproval,
          subtitle:
            "Latest approval signal is pending",
          tone: "amber" as const,
          icon: (
            <ClipboardCheck className="size-4" />
          ),
        },
        {
          label: "Managed available",
          value:
            access.managedAvailable,
          subtitle:
            "Managed yachts with future source availability",
          tone: "emerald" as const,
          icon: (
            <CalendarDays className="size-4" />
          ),
        },
        {
          label: "Active requests",
          value: work.activeInquiryCount,
          subtitle:
            "Current charter inquiries",
          tone: "violet" as const,
          icon: (
            <Users className="size-4" />
          ),
        },
      ] satisfies StatDefinition[],
      actions: [
        {
          title: "Charter requests",
          description:
            "Review incoming inquiry requirements",
          href: "/inquiries",
          icon: Users,
        },
        {
          title: "Managed yachts",
          description:
            "Review yacht relationships and access",
          href: "/fleet",
          icon: Ship,
        },
        {
          title: "Owner approvals",
          description:
            "Review verification communications",
          href: "/email",
          icon: ClipboardCheck,
        },
        {
          title: "Availability",
          description:
            "Inspect managed charter windows",
          href: "/availability",
          icon: CalendarDays,
        },
      ] satisfies ActionCard[],
    };
  }

  if (
    operatingModel ===
    "controlled_fleet"
  ) {
    return {
      description:
        modelDescriptions[operatingModel],
      modelExplanation:
        "Bahari OS assumes your company controls the primary booking calendar for its charter fleet. Controlled yachts can therefore use internal availability as the authoritative operating signal.",
      defaultWorkflow:
        "Inquiry → Controlled availability → Proposal / booking",
      bookingAuthority:
        "Your company",
      verificationPosture:
        "Internal calendar authority",
      priorityTitle:
        "Fleet operations desk",
      priorityDescription:
        "Focus on controlled inventory, open weeks and upcoming booking workload",
      availabilityTitle:
        "Controlled fleet availability",
      availabilityDescription:
        "For yachts classified as Controlled, the internal calendar can be treated as the primary availability authority",
      stats: [
        {
          label: "Controlled yachts",
          value: access.controlled,
          subtitle:
            "Calendar authority belongs to your company",
          tone: "cyan" as const,
          icon: (
            <Anchor className="size-4" />
          ),
        },
        {
          label: "Available now",
          value:
            access.controlledAvailable,
          subtitle:
            "Controlled yachts with future availability",
          tone: "emerald" as const,
          icon: (
            <CalendarDays className="size-4" />
          ),
        },
        {
          label: "Booked",
          value:
            access.controlledBooked,
          subtitle:
            "Controlled yachts with future bookings",
          tone: "violet" as const,
          icon: (
            <ClipboardCheck className="size-4" />
          ),
        },
        {
          label: "Active inquiries",
          value: work.activeInquiryCount,
          subtitle:
            "Demand against the fleet",
          tone: "amber" as const,
          icon: (
            <Users className="size-4" />
          ),
        },
      ] satisfies StatDefinition[],
      actions: [
        {
          title: "Availability board",
          description:
            "See controlled open and booked windows",
          href: "/availability",
          icon: CalendarDays,
        },
        {
          title: "Controlled yachts",
          description:
            "Review the fleet catalogue",
          href: "/fleet",
          icon: Ship,
        },
        {
          title: "New inquiry",
          description:
            "Match demand against controlled inventory",
          href: "/inquiries/new",
          icon: Users,
        },
        {
          title: "Proposals",
          description:
            "Move qualified requests toward booking",
          href: "/proposals",
          icon: FileText,
        },
      ] satisfies ActionCard[],
    };
  }

  return {
    description:
      modelDescriptions.mixed_operation,
    modelExplanation:
      "Bahari OS assumes your company operates across more than one charter model. The cockpit therefore separates controlled, managed and external broker-access inventory instead of forcing a single workflow.",
    defaultWorkflow:
      "Workflow selected by yacht relationship",
    bookingAuthority:
      "Depends on yacht classification",
    verificationPosture:
      "Adaptive",
    priorityTitle:
      "Mixed operations desk",
    priorityDescription:
      "See the different authority models in one place without blending their rules",
    availabilityTitle:
      "Blended availability intelligence",
    availabilityDescription:
      "Availability is interpreted according to each yacht relationship rather than using one global rule",
    stats: [
      {
        label: "Controlled",
        value: access.controlled,
        subtitle:
          `${access.controlledAvailable} currently source-available`,
        tone: "emerald" as const,
        icon: (
          <Anchor className="size-4" />
        ),
      },
      {
        label: "Managed",
        value: access.managed,
        subtitle:
          `${access.pendingOwnerApproval} owner approvals pending`,
        tone: "cyan" as const,
        icon: (
          <Building2 className="size-4" />
        ),
      },
      {
        label: "Broker access",
        value: access.brokerAccess,
        subtitle:
          `${access.pendingManagerVerification} verifications pending`,
        tone: "violet" as const,
        icon: (
          <Ship className="size-4" />
        ),
      },
      {
        label: "Active inquiries",
        value: work.activeInquiryCount,
        subtitle:
          `${work.proposalCount} proposals created`,
        tone: "amber" as const,
        icon: (
          <Users className="size-4" />
        ),
      },
    ] satisfies StatDefinition[],
    actions: [
      {
        title: "Inquiries",
        description:
          "Route demand into the right yacht workflow",
        href: "/inquiries",
        icon: Users,
      },
      {
        title: "Yacht catalogue",
        description:
          "Review controlled, managed and broker access",
        href: "/fleet",
        icon: Ship,
      },
      {
        title: "Availability",
        description:
          "Compare signals across access models",
        href: "/availability",
        icon: CalendarDays,
      },
      {
        title: "Email",
        description:
          "Handle approvals and manager verification",
        href: "/email",
        icon: Mail,
      },
    ] satisfies ActionCard[],
  };
}

function DashboardPanel({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ui-panel rounded-[26px] p-5 sm:p-6">
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={description}
        action={action}
        className="mb-6"
      />

      {children}
    </section>
  );
}

function ModelSignal({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="ui-panel-soft rounded-2xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold leading-5 text-foreground">
        {value}
      </p>
    </div>
  );
}

function AccessMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="ui-panel-soft rounded-2xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-3 font-heading text-3xl leading-none tracking-[0.04em] text-foreground">
        {value}
      </p>

      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function QuickAction({
  title,
  description,
  href,
  icon: Icon,
}: ActionCard) {
  return (
    <Link
      href={href}
      className="ui-panel-soft apple-transition group rounded-2xl p-4 hover:-translate-y-0.5 hover:border-ring/30"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-background/50 text-muted-foreground">
          <Icon className="size-4" />
        </div>

        <span className="text-lg text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground">
          →
        </span>
      </div>

      <p className="mt-4 text-sm font-semibold text-foreground">
        {title}
      </p>

      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </Link>
  );
}

function SourceStatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized =
    status.toLowerCase();

  const style =
    normalized === "healthy"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : normalized === "syncing"
        ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
        : normalized === "error"
          ? "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"
          : "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${style}`}
    >
      {status}
    </span>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-5 py-9 text-center">
      <Database className="mx-auto size-5 text-muted-foreground" />

      <p className="mt-3 text-sm font-semibold text-foreground">
        {title}
      </p>

      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function MissionControlSkeleton() {
  return (
    <PageContainer contentClassName="space-y-7">
      <div className="h-64 animate-pulse rounded-[28px] bg-muted" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({
          length: 4,
        }).map((_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-[24px] bg-muted"
          />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="h-80 animate-pulse rounded-[26px] bg-muted" />
        <div className="h-80 animate-pulse rounded-[26px] bg-muted" />
      </div>
    </PageContainer>
  );
}

function getGreeting(): string {
  const hour =
    new Date().getHours();

  if (hour < 12) {
    return "Good morning";
  }

  if (hour < 18) {
    return "Good afternoon";
  }

  return "Good evening";
}

function formatAccessBand(
  value: string | null
): string {
  const labels: Record<
    string,
    string
  > = {
    "1_25": "1 to 25 yachts",
    "26_100": "26 to 100 yachts",
    "101_500": "101 to 500 yachts",
    "501_2000": "501 to 2,000 yachts",
    "2000_plus": "2,000+ yachts",
  };

  return value
    ? labels[value] ?? value
    : "Not specified";
}

function formatDateRange(
  startDate: string,
  endDate: string | null
): string {
  const start =
    new Date(
      `${startDate}T00:00:00`
    );

  const end = endDate
    ? new Date(
        `${endDate}T00:00:00`
      )
    : null;

  const startLabel =
    start.toLocaleDateString(
      "en-GB",
      {
        day: "numeric",
        month: "short",
      }
    );

  if (
    !end ||
    Number.isNaN(end.getTime())
  ) {
    return startLabel;
  }

  return `${startLabel} to ${end.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  )}`;
}

function formatDateTime(
  value: string | null
): string {
  if (!value) {
    return "No updates yet";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Unknown";
  }

  return date.toLocaleString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function formatRate(
  amount: number | null,
  currency: string
): string {
  if (amount === null) {
    return "Rate on request";
  }

  try {
    return new Intl.NumberFormat(
      "en-GB",
      {
        style: "currency",
        currency:
          currency || "EUR",
        maximumFractionDigits: 0,
      }
    ).format(amount);
  } catch {
    return `${
      currency || "EUR"
    } ${amount.toLocaleString()}`;
  }
}

function formatRelativeTime(
  value: string
): string {
  const timestamp =
    new Date(value).getTime();

  if (
    Number.isNaN(timestamp)
  ) {
    return "Unknown time";
  }

  const difference =
    timestamp - Date.now();

  const absoluteDifference =
    Math.abs(difference);

  const formatter =
    new Intl.RelativeTimeFormat(
      "en",
      {
        numeric: "auto",
      }
    );

  if (
    absoluteDifference <
    60_000
  ) {
    return "just now";
  }

  if (
    absoluteDifference <
    3_600_000
  ) {
    return formatter.format(
      Math.round(
        difference / 60_000
      ),
      "minute"
    );
  }

  if (
    absoluteDifference <
    86_400_000
  ) {
    return formatter.format(
      Math.round(
        difference /
          3_600_000
      ),
      "hour"
    );
  }

  return formatter.format(
    Math.round(
      difference /
        86_400_000
    ),
    "day"
  );
}

function formatSourceType(
  value: string
): string {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}