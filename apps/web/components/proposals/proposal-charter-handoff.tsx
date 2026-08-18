"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { FinalConfirmationPanel } from "@/components/proposals/final-confirmation-panel";

type ClientSelection = {
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
};

type ConvertedCharter = {
  id: string;
  proposalId: string;
  reference: string;
  clientName: string;
  clientEmail: string | null;
  yachtName: string;
  startDate: string | null;
  endDate: string | null;
  destination: string | null;
  guests: number | null;
  charterStatus: string;
  contractStatus: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
};

type CharterLookupResponse = {
  success: boolean;
  charter?: ConvertedCharter | null;
  error?: string;
};

export function ProposalCharterHandoff({
  proposalId,
  clientName,
  yachtCount,
  clientSelection,
}: {
  proposalId: string;
  clientName: string;
  yachtCount: number;
  clientSelection: ClientSelection;
}) {
  const [
    charter,
    setCharter,
  ] =
    useState<ConvertedCharter | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const load =
    useCallback(async () => {
      if (!proposalId) {
        return;
      }

      try {
        setError(null);

        const response =
          await fetch(
            `/api/proposals/${encodeURIComponent(
              proposalId
            )}/charter`,
            {
              cache:
                "no-store",
            }
          );

        const result =
          (await response.json()) as CharterLookupResponse;

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ??
              "Could not check whether this proposal has been converted."
          );
        }

        setCharter(
          result.charter ??
            null
        );
      } catch (
        caughtError
      ) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not check charter conversion."
        );
      } finally {
        setLoading(false);
      }
    }, [proposalId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const interval =
      window.setInterval(
        () => {
          void load();
        },
        20000
      );

    const onFocus = () => {
      void load();
    };

    window.addEventListener(
      "focus",
      onFocus
    );

    return () => {
      window.clearInterval(
        interval
      );

      window.removeEventListener(
        "focus",
        onFocus
      );
    };
  }, [load]);

  return (
    <div className="space-y-4">
      <section
        className={`overflow-hidden rounded-[24px] border ${
          charter
            ? "border-cyan-500/25 bg-cyan-500/[0.07]"
            : "border-emerald-500/25 bg-emerald-500/[0.07]"
        }`}
      >
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex items-start gap-4">
            <div
              className={`flex size-11 shrink-0 items-center justify-center rounded-full text-white ${
                charter
                  ? "bg-cyan-600"
                  : "bg-emerald-500"
              }`}
            >
              <CheckIcon />
            </div>

            <div className="min-w-0">
              <p
                className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
                  charter
                    ? "text-cyan-700 dark:text-cyan-300"
                    : "text-emerald-700 dark:text-emerald-300"
                }`}
              >
                Client preference
              </p>

              <h2 className="mt-2 break-words font-heading text-3xl tracking-[0.04em] text-foreground">
                {
                  clientSelection.yachtName
                }
              </h2>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {clientName} selected this yacht from the{" "}
                {yachtCount}-option proposal on{" "}
                {formatDateTime(
                  clientSelection.selectedAt
                )}.
              </p>

              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {charter
                  ? "The sales workflow is complete. Contracting and charter operations now continue in the dedicated Charter workspace."
                  : "This records the client's preferred yacht only. Final availability, manager or owner approval and charter confirmation remain separate."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {clientSelection.fleetId ? (
              <Link
                href={`/fleet/${clientSelection.fleetId}`}
                className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:bg-accent"
              >
                Open selected yacht
              </Link>
            ) : null}

            {loading ? (
              <span className="inline-flex min-h-11 items-center justify-center rounded-[0.9rem] border border-border bg-background/35 px-4 py-2.5 text-sm font-semibold text-muted-foreground">
                Checking charter...
              </span>
            ) : charter ? (
              <span className="inline-flex min-h-11 items-center justify-center rounded-[0.9rem] border border-cyan-500/25 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-800 dark:text-cyan-200">
                Converted to charter
              </span>
            ) : (
              <span className="inline-flex min-h-11 items-center justify-center rounded-[0.9rem] border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                Ready for final confirmation
              </span>
            )}
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          {error}
        </div>
      ) : null}

      {!loading &&
      charter ? (
        <ConvertedCharterPanel
          charter={
            charter
          }
        />
      ) : !loading ? (
        <FinalConfirmationPanel
          proposalId={
            proposalId
          }
        />
      ) : null}
    </div>
  );
}

function ConvertedCharterPanel({
  charter,
}: {
  charter: ConvertedCharter;
}) {
  return (
    <section className="ui-panel overflow-hidden rounded-[26px]">
      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[1fr_auto] xl:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-800 dark:text-cyan-200">
              Converted to charter
            </span>

            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {
                charter.reference
              }
            </span>
          </div>

          <h3 className="mt-4 font-heading text-3xl tracking-[0.04em] text-foreground">
            {
              charter.yachtName
            }
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            This proposal is now a historical sales record. Contracting,
            payments, itinerary, Concierge, client portal and charter
            operations should be managed from the Charter workspace.
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Info
              label="Dates"
              value={formatDateRange(
                charter.startDate,
                charter.endDate
              )}
            />

            <Info
              label="Destination"
              value={
                charter.destination ??
                "Not set"
              }
            />

            <Info
              label="Contract"
              value={formatLabel(
                charter.contractStatus
              )}
            />

            <Info
              label="Payments"
              value={formatLabel(
                charter.paymentStatus
              )}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
          <Link
            href={`/charters/${encodeURIComponent(
              charter.id
            )}`}
            className="ui-primary-button inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm font-semibold"
          >
            Open Charter
          </Link>

          <Link
            href="/charters"
            className="ui-secondary-button inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm font-semibold"
          >
            All Charters
          </Link>
        </div>
      </div>
    </section>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="ui-panel-soft min-w-0 rounded-xl px-3 py-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function formatDateRange(
  start: string | null,
  end: string | null
) {
  return `${formatDate(
    start
  )} - ${formatDate(
    end
  )}`;
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "TBC";
  }

  const date =
    new Date(
      `${value.slice(
        0,
        10
      )}T12:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}

function formatDateTime(
  value: string | null
) {
  if (!value) {
    return "Unknown";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
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

function formatLabel(
  value: string
) {
  return value
    .split("_")
    .map(
      (word) =>
        word
          .charAt(0)
          .toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        d="m5 12 4 4L19 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}