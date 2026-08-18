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

import { ProposalCharterHandoff } from "@/components/proposals/proposal-charter-handoff";
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

    yachts: Array<{
      id: string;
      fleetId: string | null;
      position: number;
      name: string;
      weeklyRate: number | null;
      estimatedTotal: number | null;
      currency: string;
      brokerNote: string | null;
      availabilityStatus: string | null;
      verificationStatus: string | null;
      accessType: string | null;
      calendarAuthority: string | null;
      bookingModel: string | null;
      snapshot: Record<string, unknown>;
    }>;

    yachtCount: number;

    clientSelection: {
      id: string;
      proposalYachtId: string;
      fleetId: string | null;
      yachtName: string;
      selectedAt: string;
      updatedAt: string;
      position: number | null;
      weeklyRate: number | null;
      estimatedTotal: number | null;
      currency: string;
      availabilityStatus: string | null;
      verificationStatus: string | null;
      accessType: string | null;
      calendarAuthority: string | null;
      bookingModel: string | null;
    } | null;

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

type ProposalShare = {
  id: string;
  proposalId: string;
  active: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  lastOpenedAt: string | null;
  openedCount: number;
  createdAt: string;
  updatedAt: string;
};

type ProposalShareResponse = {
  success: boolean;
  share?: ProposalShare | null;
  error?: string;
};

type ProposalShareCreateResponse = ProposalShareResponse & {
  share?: (ProposalShare & {
    url?: string;
  }) | null;
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
  const [isGeneratingPdf, setIsGeneratingPdf] =
    useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] =
    useState(false);
  const [error, setError] = useState<string | null>(null);

  const [share, setShare] =
    useState<ProposalShare | null>(null);
  const [generatedShareUrl, setGeneratedShareUrl] =
    useState<string | null>(null);
  const [isLoadingShare, setIsLoadingShare] =
    useState(false);
  const [isCreatingShare, setIsCreatingShare] =
    useState(false);
  const [isRevokingShare, setIsRevokingShare] =
    useState(false);
  const [shareNotice, setShareNotice] =
    useState<string | null>(null);

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

  const refreshProposalSilently =
    useCallback(async () => {
      if (!proposalId) {
        return;
      }

      try {
        const response = await fetch(
          `/api/proposals/${encodeURIComponent(
            proposalId
          )}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result =
          (await response.json()) as ProposalDetailResponse;

        if (
          response.ok &&
          result.success
        ) {
          setData(result);
        }
      } catch {
        // Silent background refresh only.
      }
    }, [proposalId]);

  useEffect(() => {
    const interval =
      window.setInterval(() => {
        void refreshProposalSilently();
      }, 20_000);

    const onVisibilityChange = () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        void refreshProposalSilently();
      }
    };

    const onFocus = () => {
      void refreshProposalSilently();
    };

    document.addEventListener(
      "visibilitychange",
      onVisibilityChange
    );
    window.addEventListener(
      "focus",
      onFocus
    );

    return () => {
      window.clearInterval(
        interval
      );
      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange
      );
      window.removeEventListener(
        "focus",
        onFocus
      );
    };
  }, [refreshProposalSilently]);

  const loadShare = useCallback(async () => {
    if (!proposalId) {
      return;
    }

    try {
      setIsLoadingShare(true);

      const response = await fetch(
        `/api/proposals/${encodeURIComponent(proposalId)}/share`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result =
        (await response.json()) as ProposalShareResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "Could not load client sharing."
        );
      }

      setShare(result.share ?? null);
    } catch (shareError) {
      setError(
        shareError instanceof Error
          ? shareError.message
          : "Could not load client sharing."
      );
    } finally {
      setIsLoadingShare(false);
    }
  }, [proposalId]);

  useEffect(() => {
    void loadShare();
  }, [loadShare]);

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

  async function generateClientLink() {
    if (!proposalId) {
      return;
    }

    try {
      setIsCreatingShare(true);
      setError(null);
      setShareNotice(null);

      const response = await fetch(
        `/api/proposals/${encodeURIComponent(proposalId)}/share`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            expiresInDays: 30,
          }),
        }
      );

      const result =
        (await response.json()) as ProposalShareCreateResponse;

      if (!response.ok || !result.success || !result.share) {
        throw new Error(
          result.error ??
            "Could not generate the client link."
        );
      }

      setShare(result.share);

      const url =
        result.share.url?.trim() || null;

      setGeneratedShareUrl(url);

      setShareNotice(
        url
          ? "Secure client link created. Copy it now or open the client view."
          : "Secure client link created."
      );
    } catch (shareError) {
      setError(
        shareError instanceof Error
          ? shareError.message
          : "Could not generate the client link."
      );
    } finally {
      setIsCreatingShare(false);
    }
  }

  async function revokeClientLink() {
    if (!proposalId || !share?.active) {
      return;
    }

    try {
      setIsRevokingShare(true);
      setError(null);
      setShareNotice(null);

      const response = await fetch(
        `/api/proposals/${encodeURIComponent(proposalId)}/share`,
        {
          method: "DELETE",
        }
      );

      const result =
        (await response.json()) as ProposalShareResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "Could not revoke the client link."
        );
      }

      setGeneratedShareUrl(null);
      setShareNotice(
        "Client link revoked. The previous URL can no longer be used."
      );

      await loadShare();
    } catch (shareError) {
      setError(
        shareError instanceof Error
          ? shareError.message
          : "Could not revoke the client link."
      );
    } finally {
      setIsRevokingShare(false);
    }
  }

  async function copyClientLink() {
    if (!generatedShareUrl) {
      return;
    }

    try {
      await copyTextToClipboard(
        generatedShareUrl
      );

      setShareNotice(
        "Client link copied to clipboard."
      );
    } catch {
      setError(
        "Could not copy the client link. Open the client view and copy the URL from the browser."
      );
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

  const proposalYachts =
    Array.isArray(proposal.yachts)
      ? [...proposal.yachts].sort(
          (left, right) =>
            left.position - right.position
        )
      : [];

  const yachtCount =
    proposal.yachtCount ??
    proposalYachts.length ??
    (proposal.yacht.name ? 1 : 0);

  const multiYacht =
    yachtCount > 1;

  const proposalHeading =
    multiYacht
      ? `${yachtCount} YACHT OPTIONS`
      : proposal.yacht.name ??
        "Charter proposal";

  const clientSelection =
    proposal.clientSelection;

  const selectedProposalYacht =
    clientSelection
      ? proposalYachts.find(
          (yacht) =>
            yacht.id ===
            clientSelection.proposalYachtId
        ) ?? null
      : null;

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
              {proposalHeading}
            </h1>

            <p className="ui-hero-muted mt-4 max-w-2xl text-sm leading-7 sm:text-base">
              Prepared for {proposal.client.name}.{" "}
              {multiYacht
                ? `Review the ${yachtCount} shortlisted yacht options, charter details and individual commercial terms before sending the proposal.`
                : "Review the client, charter and commercial details before generating the final PDF."}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={async () => {
                  if (isGeneratingPdf) {
                    return;
                  }

                  try {
                    setIsGeneratingPdf(true);
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
                  } finally {
                    setIsGeneratingPdf(false);
                  }
                }}
                disabled={isGeneratingPdf}
                aria-busy={isGeneratingPdf}
                className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
              >
                {isGeneratingPdf ? (
                  <>
                    <RefreshIcon spinning />
                    Generating PDF...
                  </>
                ) : (
                  "Generate PDF"
                )}
              </button>

              {multiYacht ? (
                <a
                  href="#proposal-yacht-options"
                  className="apple-transition inline-flex min-h-11 items-center justify-center rounded-[0.9rem] border border-current/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-[var(--hero-foreground)] hover:-translate-y-0.5 hover:bg-white/10"
                >
                  View {yachtCount} yacht options
                </a>
              ) : proposal.yacht.id ? (
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
      {clientSelection ? (
        <ProposalCharterHandoff
          proposalId={proposalId}
          clientName={proposal.client.name}
          yachtCount={yachtCount}
          clientSelection={clientSelection}
        />
      ) : null}

      {proposalYachts.length > 0 ? (
        <section
          id="proposal-yacht-options"
          className="ui-panel scroll-mt-28 rounded-[24px] p-5 sm:p-6"
        >
          <SectionHeader
            title={
              multiYacht
                ? `${yachtCount} yacht options`
                : "Selected yacht"
            }
            subtitle={
              clientSelection
                ? `${clientSelection.yachtName} is the client's current preference; remaining yachts stay as alternatives`
                : multiYacht
                  ? "The ordered shortlist included in this proposal"
                  : "The yacht included in this proposal"
            }
            className="mb-6"
          />

          <div className="grid gap-4 lg:grid-cols-3">
            {proposalYachts.map((yacht) => {
              const isClientSelected =
                clientSelection?.proposalYachtId ===
                yacht.id;

              return (
              <article
                key={yacht.id}
                className={`rounded-2xl border p-4 ${
                  isClientSelected
                    ? "border-emerald-500/35 bg-emerald-500/[0.07] ring-4 ring-emerald-500/[0.05]"
                    : "border-border bg-card/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                        Option {yacht.position}
                      </p>

                      {clientSelection ? (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] ${
                            isClientSelected
                              ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                              : "border-border bg-muted text-muted-foreground"
                          }`}
                        >
                          {isClientSelected
                            ? "Client selected"
                            : "Alternative"}
                        </span>
                      ) : null}
                    </div>

                    <h3 className="mt-2 truncate text-lg font-semibold text-foreground">
                      {yacht.name}
                    </h3>
                  </div>

                  <span className="shrink-0 rounded-full border border-border bg-background/50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {formatProposalAvailability(
                      yacht.availabilityStatus
                    )}
                  </span>
                </div>

                <div className="mt-5 grid gap-3">
                  <SummaryMetric
                    label="Weekly rate"
                    value={formatRate(
                      yacht.weeklyRate,
                      yacht.currency
                    )}
                  />

                  <SummaryMetric
                    label="Estimated total"
                    value={formatRate(
                      yacht.estimatedTotal,
                      yacht.currency
                    )}
                  />
                </div>

                {yacht.fleetId ? (
                  <Link
                    href={`/fleet/${yacht.fleetId}`}
                    className="ui-secondary-button apple-transition mt-4 inline-flex min-h-10 w-full items-center justify-center px-3 text-xs font-semibold hover:bg-accent"
                  >
                    Open yacht
                  </Link>
                ) : null}
              </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="ui-panel rounded-[24px] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
              Client sharing
            </p>

            <h2 className="mt-2 font-heading text-2xl tracking-[0.04em] text-foreground">
              Interactive proposal link
            </h2>

            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Create a secure client-facing link for this proposal. The client
              will be able to review the yacht options and, in the next stage
              of this workflow, select the yacht they would like the broker to
              proceed with.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {!share?.active ? (
              <button
                type="button"
                onClick={() => void generateClientLink()}
                disabled={isCreatingShare || isLoadingShare}
                className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreatingShare
                  ? "Generating..."
                  : "Generate client link"}
              </button>
            ) : (
              <>
                {generatedShareUrl ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void copyClientLink()}
                      className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
                    >
                      Copy link
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        window.open(
                          generatedShareUrl,
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                      className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:bg-accent"
                    >
                      Open client view
                    </button>
                  </>
                ) : null}

                <button
                  type="button"
                  onClick={() => void generateClientLink()}
                  disabled={isCreatingShare || isRevokingShare}
                  className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCreatingShare
                    ? "Regenerating..."
                    : "Regenerate link"}
                </button>

                <button
                  type="button"
                  onClick={() => void revokeClientLink()}
                  disabled={isRevokingShare || isCreatingShare}
                  className="apple-transition inline-flex min-h-11 items-center justify-center rounded-[0.9rem] border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-800 hover:-translate-y-0.5 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200"
                >
                  {isRevokingShare
                    ? "Revoking..."
                    : "Revoke link"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ShareMetric
            label="Status"
            value={
              isLoadingShare
                ? "Loading..."
                : share?.active
                  ? "Active"
                  : "Not shared"
            }
            accent={share?.active}
          />

          <ShareMetric
            label="Expires"
            value={
              share?.active
                ? formatDateTime(share.expiresAt)
                : "Not available"
            }
          />

          <ShareMetric
            label="Proposal opens"
            value={
              share?.active
                ? String(share.openedCount)
                : "0"
            }
          />

          <ShareMetric
            label="Last opened"
            value={
              share?.active
                ? formatDateTime(share.lastOpenedAt)
                : "Not opened"
            }
          />
        </div>

        {share?.active && !generatedShareUrl ? (
          <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-900 dark:text-amber-200">
            A secure client link is active. For security, Yacht OS stores only
            the token hash and cannot recover the original URL after this page
            is reloaded. Regenerate the link if you need a new copyable URL.
          </div>
        ) : null}

        {generatedShareUrl ? (
          <div className="mt-4 rounded-2xl border border-border bg-background/55 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Secure client URL
            </p>

            <p className="mt-2 break-all font-mono text-xs leading-6 text-foreground/80">
              {generatedShareUrl}
            </p>
          </div>
        ) : null}

        {shareNotice ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
            {shareNotice}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={
            multiYacht
              ? "Yacht options"
              : "Estimated total"
          }
          value={
            multiYacht
              ? yachtCount
              : formatRate(
                  proposal.commercial.estimatedTotal,
                  proposal.commercial.currency
                )
          }
          subtitle={
            multiYacht
              ? "Shortlisted for this client"
              : "Projected charter value"
          }
          tone="emerald"
        />

        <StatCard
          label={
            multiYacht
              ? "Weekly rates"
              : "Weekly rate"
          }
          value={
            multiYacht
              ? formatProposalRateRange(
                  proposalYachts
                )
              : formatRate(
                  proposal.commercial.weeklyRate,
                  proposal.commercial.currency
                )
          }
          subtitle={
            multiYacht
              ? "Across shortlisted options"
              : "Imported or custom offer"
          }
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
          description={
            multiYacht
              ? "Shortlisted yachts, dates and party size"
              : "Selected yacht, dates and party size"
          }
        >
          <div className="space-y-4">
            <DetailRow
              label={
                multiYacht
                  ? "Yacht options"
                  : "Yacht"
              }
              value={
                proposalYachts.length > 0
                  ? proposalYachts
                      .map(
                        (yacht) =>
                          `${yacht.position}. ${yacht.name}`
                      )
                      .join(" · ")
                  : proposal.yacht.name ??
                    "Not selected"
              }
            />
            {clientSelection ? (
              <DetailRow
                label="Client preference"
                value={`${clientSelection.yachtName} · selected ${formatDateTime(
                  clientSelection.selectedAt
                )}`}
              />
            ) : null}

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
          description={
            multiYacht
              ? "Pricing stored for each shortlisted yacht"
              : "Pricing details stored with this proposal"
          }
        >
          {multiYacht ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {clientSelection ? (
                <CommercialCard
                  label="Client selected"
                  value={`${clientSelection.yachtName} · ${formatRate(
                    clientSelection.weeklyRate,
                    clientSelection.currency
                  )} / week`}
                />
              ) : null}
              {proposalYachts.map(
                (yacht) => (
                  <CommercialCard
                    key={yacht.id}
                    label={`Option ${yacht.position} · ${yacht.name}`}
                    value={`${formatRate(
                      yacht.weeklyRate,
                      yacht.currency
                    )} / week`}
                  />
                )
              )}

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
          ) : (
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
          )}
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

function ShareMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <article className="ui-panel-soft rounded-2xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>

      <p
        className={`mt-3 text-sm font-semibold ${
          accent
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-foreground"
        }`}
      >
        {value}
      </p>
    </article>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/45 px-3 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
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

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className="size-5"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
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

async function copyTextToClipboard(
  value: string
): Promise<void> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(
      value
    );
    return;
  }

  const textarea =
    document.createElement("textarea");

  textarea.value = value;
  textarea.setAttribute(
    "readonly",
    ""
  );
  textarea.style.position =
    "fixed";
  textarea.style.opacity = "0";

  document.body.appendChild(
    textarea
  );

  textarea.select();

  const copied =
    document.execCommand("copy");

  document.body.removeChild(
    textarea
  );

  if (!copied) {
    throw new Error(
      "Clipboard copy failed."
    );
  }
}

function formatProposalRateRange(
  yachts: ProposalDetailResponse["proposal"]["yachts"]
): string {
  const priced =
    yachts
      .filter(
        (yacht) =>
          yacht.weeklyRate !== null &&
          Number.isFinite(yacht.weeklyRate)
      )
      .map((yacht) => ({
        amount: yacht.weeklyRate as number,
        currency: yacht.currency || "EUR",
      }));

  if (priced.length === 0) {
    return "Rate on request";
  }

  const currencies =
    Array.from(
      new Set(
        priced.map(
          (item) => item.currency
        )
      )
    );

  if (currencies.length !== 1) {
    return `${priced.length} individual rates`;
  }

  const values =
    priced.map(
      (item) => item.amount
    );

  const minimum =
    Math.min(...values);

  const maximum =
    Math.max(...values);

  if (minimum === maximum) {
    return formatRate(
      minimum,
      currencies[0]
    );
  }

  return `${formatRate(
    minimum,
    currencies[0]
  )} – ${formatRate(
    maximum,
    currencies[0]
  )}`;
}

function formatProposalAvailability(
  value: string | null
): string {
  if (!value) {
    return "Unverified";
  }

  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
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