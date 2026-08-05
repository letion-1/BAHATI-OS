"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";

type ProposalStatus =
  | "Draft"
  | "Ready"
  | "Sent"
  | "Accepted"
  | "Declined"
  | "Expired";

type ProposalDetailResponse = {
  success: boolean;
  proposal: {
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
      destination: string | null;
    };

    commercial: {
      weeklyRate: number | null;
      estimatedTotal: number | null;
      currency: string;
    };

    notes: string | null;
    source: string | null;
    status: ProposalStatus;
    pdfUrl: string | null;
    createdAt: string | null;
    sentAt: string | null;
    updatedAt: string | null;
  };
  error?: string;
};

const proposalStatuses: ProposalStatus[] = [
  "Draft",
  "Ready",
  "Sent",
  "Accepted",
  "Declined",
  "Expired",
];

export default function ProposalDetailPage() {
  const params = useParams<{ id: string }>();
  const proposalId = params.id;

  const [data, setData] =
    useState<ProposalDetailResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] =
    useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProposal = useCallback(
    async (refreshing: boolean) => {
      if (!proposalId) {
        return;
      }

      try {
        if (refreshing) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }

        setError(null);

        const response = await fetch(
          `/api/proposals/${encodeURIComponent(proposalId)}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result =
          (await response.json()) as ProposalDetailResponse;

        if (!response.ok || !result.success) {
          throw new Error(
            result.error ?? "Could not load proposal."
          );
        }

        setData(result);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load proposal."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [proposalId]
  );

  useEffect(() => {
    void loadProposal(false);
  }, [loadProposal]);

  const charterDuration = useMemo(() => {
    if (!data?.proposal.charter.startDate || !data.proposal.charter.endDate) {
      return null;
    }

    const start = new Date(
      `${data.proposal.charter.startDate}T00:00:00`
    );

    const end = new Date(
      `${data.proposal.charter.endDate}T00:00:00`
    );

    const difference = end.getTime() - start.getTime();

    if (difference <= 0) {
      return null;
    }

    return Math.ceil(difference / 86_400_000);
  }, [data]);

  async function updateStatus(status: ProposalStatus) {
    if (!proposalId || !data || status === data.proposal.status) {
      return;
    }

    try {
      setIsUpdatingStatus(true);
      setError(null);

      const response = await fetch(
        `/api/proposals/${encodeURIComponent(proposalId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        }
      );

      const result =
        (await response.json()) as ProposalDetailResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ?? "Could not update proposal status."
        );
      }

      setData(result);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update proposal status."
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  if (isLoading) {
    return <ProposalDetailSkeleton />;
  }

  if (!data) {
    return (
      <PageContainer>
        <Link
          href="/proposals"
          className="apple-transition inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <span>←</span>
          Back to proposals
        </Link>

        <div className="mt-8 rounded-2xl border border-red-500/25 bg-red-500/10 p-6">
          <h1 className="font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
            Proposal unavailable
          </h1>

          <p className="mt-3 text-sm text-red-700 dark:text-red-200">
            {error ?? "Could not load proposal."}
          </p>

          <button
            type="button"
            onClick={() => void loadProposal(false)}
            className="ui-primary-button apple-transition mt-5 px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </PageContainer>
    );
  }

  const proposal = data.proposal;

  return (
    <PageContainer contentClassName="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/proposals"
          className="apple-transition inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <span>←</span>
          Back to proposals
        </Link>

        <button
          type="button"
          onClick={() => void loadProposal(true)}
          disabled={isRefreshing}
          className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshIcon spinning={isRefreshing} />
          {isRefreshing
            ? "Refreshing..."
            : "Refresh proposal"}
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <section className="ui-hero rounded-[30px] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-violet-400/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-44 w-80 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative grid gap-8 xl:grid-cols-[1fr_390px] xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={proposal.status} />

              <span className="ui-hero-accent text-xs font-semibold uppercase tracking-[0.22em]">
                {proposal.reference}
              </span>
            </div>

            <h1 className="mt-6 text-balance text-6xl leading-none tracking-[0.055em] text-[var(--hero-foreground)] sm:text-7xl">
              {proposal.yacht.name ??
                "Charter proposal"}
            </h1>

            <p className="ui-hero-muted mt-4 max-w-2xl text-sm leading-7 sm:text-base">
              Prepared for {proposal.client.name}. Review the client, charter
              and commercial details before generating the final PDF.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    setError(null);

                    const response = await fetch(
                      `/api/proposals/${encodeURIComponent(
                        proposalId
                      )}/pdf`,
                      {
                        method: "POST",
                      }
                    );

                    const result =
                      await response.json();

                    if (!response.ok) {
                      throw new Error(
                        result.error ??
                          "Could not generate proposal PDF."
                      );
                    }

                    if (result.pdfUrl) {
                      window.open(
                        result.pdfUrl,
                        "_blank",
                        "noopener,noreferrer"
                      );
                    }

                    await loadProposal(true);
                  } catch (pdfError) {
                    setError(
                      pdfError instanceof Error
                        ? pdfError.message
                        : "Could not generate proposal PDF."
                    );
                  }
                }}
                className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
              >
                Generate PDF
              </button>

              {proposal.yacht.id ? (
                <Link
                  href={`/fleet/${proposal.yacht.id}`}
                  className="apple-transition inline-flex min-h-11 items-center justify-center rounded-[0.9rem] border border-current/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-[var(--hero-foreground)] hover:-translate-y-0.5 hover:bg-white/10"
                >
                  Open yacht
                </Link>
              ) : null}
            </div>
          </div>

          <div className="rounded-[24px] border border-current/10 bg-black/10 p-5 backdrop-blur-sm">
            <label
              htmlFor="proposal-status"
              className="ui-hero-muted text-[10px] font-semibold uppercase tracking-[0.18em]"
            >
              Proposal status
            </label>

            <select
              id="proposal-status"
              value={proposal.status}
              onChange={(event) =>
                void updateStatus(
                  event.target.value as ProposalStatus
                )
              }
              disabled={isUpdatingStatus}
              className="mt-3 h-12 w-full rounded-xl border border-current/15 bg-black/15 px-4 text-sm font-semibold text-[var(--hero-foreground)] outline-none transition focus:border-violet-400/50 focus:ring-4 focus:ring-violet-400/10 disabled:opacity-60"
            >
              {proposalStatuses.map(
                (status) => (
                  <option
                    key={status}
                    value={status}
                    className="bg-card text-foreground"
                  >
                    {status}
                  </option>
                )
              )}
            </select>

            <p className="ui-hero-muted mt-3 text-xs leading-5">
              {isUpdatingStatus
                ? "Updating proposal status..."
                : "Status changes are saved immediately."}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Estimated total"
          value={formatRate(
            proposal.commercial.estimatedTotal,
            proposal.commercial.currency
          )}
          subtitle="Projected charter value"
          tone="emerald"
        />

        <StatCard
          label="Weekly rate"
          value={formatRate(
            proposal.commercial.weeklyRate,
            proposal.commercial.currency
          )}
          subtitle="Imported or custom offer"
          tone="neutral"
        />

        <StatCard
          label="Guests"
          value={
            proposal.charter.guests !== null
              ? proposal.charter.guests
              : "Not set"
          }
          subtitle="Expected charter party"
          tone="cyan"
        />

        <StatCard
          label="Duration"
          value={
            charterDuration !== null
              ? `${charterDuration} days`
              : "Not set"
          }
          subtitle="Selected charter period"
          tone="violet"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel
          title="Client information"
          description="Proposal recipient and contact details"
        >
          <div className="space-y-4">
            <DetailRow
              label="Client"
              value={proposal.client.name}
            />
            <DetailRow
              label="Email"
              value={
                proposal.client.email ??
                "Not provided"
              }
            />
            <DetailRow
              label="Phone"
              value={
                proposal.client.phone ??
                "Not provided"
              }
            />
            <DetailRow
              label="Created"
              value={formatDateTime(
                proposal.createdAt
              )}
            />
            <DetailRow
              label="Last updated"
              value={formatDateTime(
                proposal.updatedAt
              )}
            />
          </div>
        </Panel>

        <Panel
          title="Charter details"
          description="Selected yacht, dates and party size"
        >
          <div className="space-y-4">
            <DetailRow
              label="Yacht"
              value={
                proposal.yacht.name ??
                "Not selected"
              }
            />
            <DetailRow
              label="Dates"
              value={formatDateRange(
                proposal.charter.startDate,
                proposal.charter.endDate
              )}
            />
            <DetailRow
              label="Guests"
              value={
                proposal.charter.guests !== null
                  ? String(
                      proposal.charter.guests
                    )
                  : "Not provided"
              }
            />
            <DetailRow
              label="Destination"
              value={
                proposal.charter.destination ??
                "Not provided"
              }
            />
            <DetailRow
              label="Source"
              value={
                proposal.source ??
                "Proposal Builder"
              }
            />
          </div>
        </Panel>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel
          title="Commercial summary"
          description="Pricing details stored with this proposal"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <CommercialCard
              label="Weekly rate"
              value={formatRate(
                proposal.commercial.weeklyRate,
                proposal.commercial.currency
              )}
            />

            <CommercialCard
              label="Estimated total"
              value={formatRate(
                proposal.commercial.estimatedTotal,
                proposal.commercial.currency
              )}
            />

            <CommercialCard
              label="Currency"
              value={
                proposal.commercial.currency
              }
            />

            <CommercialCard
              label="Sent"
              value={
                proposal.sentAt
                  ? formatDateTime(
                      proposal.sentAt
                    )
                  : "Not sent"
              }
            />
          </div>
        </Panel>

        <Panel
          title="Proposal notes"
          description="Broker notes and client requirements"
        >
          {proposal.notes ? (
            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/80">
              {proposal.notes}
            </p>
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
              <p className="font-semibold text-foreground">
                No notes added
              </p>

              <p className="mt-2 text-sm text-muted-foreground">
                Proposal notes will appear here.
              </p>
            </div>
          )}
        </Panel>
      </section>
    </PageContainer>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="ui-panel rounded-[24px] p-5 sm:p-6">
      <SectionHeader
        title={title}
        subtitle={description}
        className="mb-6"
      />

      {children}
    </section>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border pb-4 last:border-0 last:pb-0">
      <p className="text-sm text-muted-foreground">
        {label}
      </p>

      <p className="max-w-[65%] text-right text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function CommercialCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="ui-panel-soft rounded-2xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-3 font-semibold text-foreground">
        {value}
      </p>
    </article>
  );
}

function StatusBadge({
  status,
}: {
  status: ProposalStatus;
}) {
  const styles: Record<
    ProposalStatus,
    string
  > = {
    Draft:
      "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200",
    Ready:
      "border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200",
    Sent:
      "border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200",
    Accepted:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    Declined:
      "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-200",
    Expired:
      "border-border bg-muted text-muted-foreground",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function ProposalDetailSkeleton() {
  return (
    <PageContainer>
      <div className="animate-pulse space-y-7">
        <div className="h-10 w-40 rounded-xl bg-muted" />
        <div className="h-80 rounded-[30px] bg-muted" />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({
            length: 4,
          }).map((_, index) => (
            <div
              key={index}
              className="h-36 rounded-[24px] bg-muted"
            />
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="h-96 rounded-[24px] bg-muted" />
          <div className="h-96 rounded-[24px] bg-muted" />
        </div>
      </div>
    </PageContainer>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
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
  startDate: string | null,
  endDate: string | null
): string {
  if (!startDate || !endDate) {
    return "Not selected";
  }

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

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}