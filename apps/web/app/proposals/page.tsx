"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { HeroCard } from "@/components/ui/hero-card";
import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { WithdrawProposalButton } from "@/components/proposals/withdraw-proposal-button";

type ProposalStatus =
  | "Draft"
  | "Ready"
  | "Sent"
  | "Accepted"
  | "Declined"
  | "Expired";

type Proposal = {
  id: string;
  reference: string;

  client: {
    name: string;
    email: string | null;
    phone: string | null;
  };

  yacht: {
    id: string | null;
    name: string | null;
  };

  charter: {
    startDate: string | null;
    endDate: string | null;
    guests: number | null;
  };

  commercial: {
    weeklyRate: number | null;
    estimatedTotal: number | null;
    currency: string;
  };

  notes: string | null;
  status: ProposalStatus;
  pdfUrl: string | null;
  createdAt: string | null;
  sentAt: string | null;
  updatedAt: string | null;
};

type ProposalsResponse = {
  success: boolean;

  overview: {
    total: number;
    draft: number;
    ready: number;
    sent: number;
    accepted: number;
  };

  proposals: Proposal[];
  error?: string;
};

type StatusFilter = ProposalStatus | "All";

type SortOption =
  | "newest"
  | "oldest"
  | "client"
  | "yacht"
  | "value-high"
  | "value-low";

const statusOrder: StatusFilter[] = [
  "All",
  "Draft",
  "Ready",
  "Sent",
  "Accepted",
  "Declined",
  "Expired",
];

export default function ProposalsPage() {
  return (
    <Suspense fallback={<ProposalsSkeleton />}>
      <ProposalsContent />
    </Suspense>
  );
}

function ProposalsContent() {
  const searchParams = useSearchParams();
  const createdProposalId = searchParams.get("created");

  const [data, setData] = useState<ProposalsResponse | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("All");
  const [sort, setSort] = useState<SortOption>("newest");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProposals = useCallback(async (refreshing: boolean) => {
    try {
      if (refreshing) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setError(null);

      const response = await fetch("/api/proposals", {
        method: "GET",
        cache: "no-store",
      });

      const result = (await response.json()) as ProposalsResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Could not load proposals.");
      }

      setData(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load proposals."
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadProposals(false);
  }, [loadProposals]);

  const visibleProposals = useMemo(() => {
    if (!data) {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();

    const filtered = data.proposals.filter((proposal) => {
      const matchesStatus =
        statusFilter === "All" || proposal.status === statusFilter;

      const searchableText = [
        proposal.reference,
        proposal.client.name,
        proposal.client.email ?? "",
        proposal.yacht.name ?? "",
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery =
        normalizedQuery.length === 0 ||
        searchableText.includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });

    return [...filtered].sort((left, right) => {
      if (sort === "oldest") {
        return compareDateValues(left.createdAt, right.createdAt);
      }

      if (sort === "client") {
        return left.client.name.localeCompare(right.client.name);
      }

      if (sort === "yacht") {
        return (left.yacht.name ?? "").localeCompare(
          right.yacht.name ?? ""
        );
      }

      if (sort === "value-high") {
        return compareNumbers(
          right.commercial.estimatedTotal,
          left.commercial.estimatedTotal
        );
      }

      if (sort === "value-low") {
        return compareNumbers(
          left.commercial.estimatedTotal,
          right.commercial.estimatedTotal
        );
      }

      return compareDateValues(right.createdAt, left.createdAt);
    });
  }, [data, query, sort, statusFilter]);

  if (isLoading) {
    return <ProposalsSkeleton />;
  }

  if (!data) {
    return (
      <PageContainer>
        <HeroCard
          eyebrow="Proposal workspace"
          title="Proposals unavailable"
          description="The proposal workspace could not be loaded from the protected company database."
        />

        <div className="mt-8 rounded-2xl border border-red-500/25 bg-red-500/10 p-6">
          <p className="text-sm text-red-700 dark:text-red-200">
            {error ?? "Could not load proposals."}
          </p>

          <button
            type="button"
            onClick={() => void loadProposals(false)}
            className="ui-primary-button apple-transition mt-5 px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </PageContainer>
    );
  }

  const createdProposal = createdProposalId
    ? data.proposals.find(
        (proposal) => proposal.id === createdProposalId
      ) ?? null
    : null;

  return (
    <PageContainer contentClassName="space-y-7">
      <HeroCard
        eyebrow="Proposal workspace"
        title="Manage charter proposals"
        description="Review drafts, track sent offers and move accepted proposals toward confirmed charters."
        actions={
          <>
            <button
              type="button"
              onClick={() => void loadProposals(true)}
              disabled={isRefreshing}
              className="ui-secondary-button apple-transition inline-flex min-h-12 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshIcon spinning={isRefreshing} />
              {isRefreshing
                ? "Refreshing..."
                : "Refresh proposals"}
            </button>

            <Link
              href="/fleet"
              className="ui-primary-button apple-transition inline-flex min-h-12 items-center justify-center px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
            >
              Create proposal
            </Link>
          </>
        }
      />

      {createdProposalId ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4">
          <p className="font-semibold text-emerald-800 dark:text-emerald-100">
            Proposal saved successfully.
          </p>

          <p className="mt-1 text-sm text-emerald-700/80 dark:text-emerald-200/75">
            {createdProposal
              ? `${createdProposal.reference} for ${createdProposal.client.name} is now stored in the workspace.`
              : "The new proposal is now stored in the workspace."}
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-4 text-sm text-amber-800 dark:text-amber-100">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total proposals"
          value={data.overview.total}
          subtitle="All commercial offers"
          tone="neutral"
        />

        <StatCard
          label="Draft"
          value={data.overview.draft}
          subtitle="Still being prepared"
          tone="amber"
        />

        <StatCard
          label="Ready"
          value={data.overview.ready}
          subtitle="Ready for client review"
          tone="cyan"
        />

        <StatCard
          label="Sent"
          value={data.overview.sent}
          subtitle="Awaiting client action"
          tone="violet"
        />

        <StatCard
          label="Accepted"
          value={data.overview.accepted}
          subtitle="Confirmed by clients"
          tone="emerald"
        />
      </section>

      <section className="ui-panel rounded-[24px] p-4 sm:p-5">
        <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-[minmax(280px,1fr)_200px_220px_auto]">
          <label className="relative block">
            <span className="sr-only">
              Search proposals
            </span>

            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted-foreground">
              <SearchIcon />
            </span>

            <input
              type="search"
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Search client, yacht or reference..."
              className="ui-input h-12 pl-11 pr-4 text-sm"
            />
          </label>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as StatusFilter
              )
            }
            aria-label="Filter proposals by status"
            className="ui-input h-12 px-4 text-sm"
          >
            {statusOrder.map((status) => (
              <option
                key={status}
                value={status}
              >
                {status === "All"
                  ? "All statuses"
                  : status}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(event) =>
              setSort(
                event.target.value as SortOption
              )
            }
            aria-label="Sort proposals"
            className="ui-input h-12 px-4 text-sm"
          >
            <option value="newest">
              Newest first
            </option>
            <option value="oldest">
              Oldest first
            </option>
            <option value="client">
              Client A–Z
            </option>
            <option value="yacht">
              Yacht A–Z
            </option>
            <option value="value-high">
              Highest value
            </option>
            <option value="value-low">
              Lowest value
            </option>
          </select>

          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatusFilter("All");
              setSort("newest");
            }}
            disabled={
              query.trim().length === 0 &&
              statusFilter === "All" &&
              sort === "newest"
            }
            className="ui-secondary-button apple-transition h-12 px-4 text-sm font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35"
          >
            Clear
          </button>
        </div>
      </section>

      <section>
        <SectionHeader
          eyebrow="Commercial pipeline"
          title="Proposal results"
          subtitle={`${visibleProposals.length} of ${data.overview.total} proposals`}
          className="mb-5"
        />

        {visibleProposals.length === 0 ? (
          <div className="ui-panel rounded-[28px] border-dashed px-6 py-16 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-[20px] bg-accent text-accent-foreground">
              <span className="font-heading text-3xl">
                P
              </span>
            </div>

            <h3 className="mt-5 font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
              No proposals found
            </h3>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              Create a proposal from a yacht profile or adjust the active search filters.
            </p>

            <Link
              href="/fleet"
              className="ui-primary-button apple-transition mt-6 inline-flex px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
            >
              Browse fleet
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 [&>*]:min-w-0 xl:grid-cols-2">
            {visibleProposals.map(
              (proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  highlighted={
                    proposal.id ===
                    createdProposalId
                  }
                  onWithdrawn={() =>
                    void loadProposals(true)
                  }
                />
              )
            )}
          </div>
        )}
      </section>
    </PageContainer>
  );
}

function ProposalCard({
  proposal,
  highlighted,
  onWithdrawn,
}: {
  proposal: Proposal;
  highlighted: boolean;
  onWithdrawn: () => void;
}) {
  return (
    <article
      className={`ui-panel apple-transition group rounded-[24px] p-5 hover:-translate-y-0.5 sm:p-6 ${
        highlighted
          ? "border-emerald-500/35 ring-2 ring-emerald-500/10"
          : "hover:border-violet-500/25"
      }`}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <ProposalStatusBadge
              status={proposal.status}
            />

            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/75">
              {proposal.reference}
            </span>

            {highlighted ? (
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                New
              </span>
            ) : null}
          </div>

          <h3 className="mt-4 truncate text-3xl leading-none tracking-[0.045em] text-foreground">
            {proposal.client.name}
          </h3>

          <p className="mt-2 truncate text-sm text-muted-foreground">
            {proposal.client.email ??
              "No email supplied"}
          </p>
        </div>

        <div className="shrink-0 sm:text-right">
          <p className="font-heading text-3xl leading-none tracking-[0.045em] text-foreground">
            {formatRate(
              proposal.commercial
                .estimatedTotal,
              proposal.commercial.currency
            )}
          </p>

          <p className="mt-2 text-xs text-muted-foreground/75">
            estimated charter total
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <ProposalMetric
          label="Yacht"
          value={
            proposal.yacht.name ??
            "Unknown yacht"
          }
        />

        <ProposalMetric
          label="Charter dates"
          value={
            proposal.charter.startDate &&
            proposal.charter.endDate
              ? formatDateRange(
                  proposal.charter.startDate,
                  proposal.charter.endDate
                )
              : "Not scheduled"
          }
        />

        <ProposalMetric
          label="Guests"
          value={
            proposal.charter.guests !== null
              ? String(
                  proposal.charter.guests
                )
              : "Not entered"
          }
        />
      </div>

      <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground/75">
            Created{" "}
            {formatRelativeTime(
              proposal.createdAt
            )}
          </p>

          <p className="mt-1 text-xs text-muted-foreground/75">
            Weekly rate:{" "}
            {formatRate(
              proposal.commercial
                .weeklyRate,
              proposal.commercial.currency
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <WithdrawProposalButton
            proposalId={proposal.id}
            clientName={proposal.client.name ?? "this client"}
            proposalStatus={proposal.status ?? null}
            onWithdrawn={onWithdrawn}
          />

          <Link
            href={`/proposals/${proposal.id}`}
            className="apple-transition inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:opacity-75 dark:text-violet-300"
          >
            Open proposal
            <span className="transition group-hover:translate-x-1">
              →
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
}

function ProposalMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="ui-panel-soft rounded-xl px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 truncate text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function ProposalStatusBadge({
  status,
}: {
  status: ProposalStatus;
}) {
  const styles: Record<
    ProposalStatus,
    string
  > = {
    Draft:
      "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    Ready:
      "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-200",
    Sent:
      "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-200",
    Accepted:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    Declined:
      "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-200",
    Expired:
      "border-border bg-muted text-muted-foreground",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function ProposalsSkeleton() {
  return (
    <PageContainer>
      <div className="animate-pulse space-y-7">
        <div className="h-64 rounded-[30px] bg-muted" />

        <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({
            length: 5,
          }).map((_, index) => (
            <div
              key={index}
              className="h-36 rounded-[24px] bg-muted"
            />
          ))}
        </div>

        <div className="h-24 rounded-[24px] bg-muted" />

        <div className="grid gap-4 [&>*]:min-w-0 xl:grid-cols-2">
          {Array.from({
            length: 4,
          }).map((_, index) => (
            <div
              key={index}
              className="h-80 rounded-[24px] bg-muted"
            />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function RefreshIcon({
  spinning,
}: {
  spinning: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`}
      aria-hidden="true"
    >
      <path d="M20 11a8 8 0 1 0-2.34 5.66" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

function compareDateValues(
  left: string | null,
  right: string | null
): number {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  return left.localeCompare(right);
}

function compareNumbers(
  left: number | null,
  right: number | null
): number {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left - right;
}

function formatRate(
  amount: number | null,
  currency: string
): string {
  if (amount === null || !Number.isFinite(amount)) {
    return "Rate on request";
  }

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || "EUR"} ${amount.toLocaleString()}`;
  }
}

function formatDateRange(
  startDate: string,
  endDate: string
): string {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  return `${start.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })} – ${end.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

function formatRelativeTime(value: string | null): string {
  if (!value) {
    return "at an unknown time";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "at an unknown time";
  }

  const difference = timestamp - Date.now();
  const absoluteDifference = Math.abs(difference);

  const formatter = new Intl.RelativeTimeFormat("en", {
    numeric: "auto",
  });

  if (absoluteDifference < 60_000) {
    return "just now";
  }

  if (absoluteDifference < 3_600_000) {
    return formatter.format(
      Math.round(difference / 60_000),
      "minute"
    );
  }

  if (absoluteDifference < 86_400_000) {
    return formatter.format(
      Math.round(difference / 3_600_000),
      "hour"
    );
  }

  return formatter.format(
    Math.round(difference / 86_400_000),
    "day"
  );
}