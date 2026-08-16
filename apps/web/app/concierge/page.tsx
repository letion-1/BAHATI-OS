"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type ConciergeCharter = {
  id: string;
  reference: string;
  clientName: string;
  clientEmail: string | null;
  yachtName: string;
  startDate: string | null;
  endDate: string | null;
  destination: string | null;
  embarkationPort: string | null;
  disembarkationPort: string | null;
  guests: number | null;
  currency: string;
  contractStatus: string;
  charterStatus: string;
  concierge: {
    total: number;
    active: number;
    urgent: number;
    confirmed: number;
    completed: number;
    guestVisible: number;
    nextScheduledAt: string | null;
    estimatedOpenCost: number;
  };
};

type ConciergeResponse = {
  success: boolean;
  summary?: {
    charters: number;
    activeRequests: number;
    urgentRequests: number;
    confirmedRequests: number;
    guestVisible: number;
  };
  charters?: ConciergeCharter[];
  error?: string;
};

export default function ConciergePage() {
  const [
    data,
    setData,
  ] =
    useState<ConciergeResponse | null>(
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

  const [
    query,
    setQuery,
  ] =
    useState("");

  const loadConcierge =
    useCallback(async () => {
      try {
        setError(null);

        const response =
          await fetch(
            "/api/concierge",
            {
              cache:
                "no-store",
            }
          );

        const result =
          (await response.json()) as ConciergeResponse;

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ??
              "Could not load Concierge."
          );
        }

        setData(result);
      } catch (
        caughtError
      ) {
        setError(
          caughtError instanceof
            Error
            ? caughtError.message
            : "Could not load Concierge."
        );
      } finally {
        setLoading(
          false
        );
      }
    }, []);

  useEffect(() => {
    void loadConcierge();
  }, [loadConcierge]);

  const charters =
    data?.charters ??
    [];

  const summary =
    data?.summary ?? {
      charters: 0,
      activeRequests: 0,
      urgentRequests: 0,
      confirmedRequests: 0,
      guestVisible: 0,
    };

  const filteredCharters =
    useMemo(() => {
      const normalized =
        query
          .trim()
          .toLowerCase();

      if (!normalized) {
        return charters;
      }

      return charters.filter(
        (charter) =>
          [
            charter.reference,
            charter.clientName,
            charter.clientEmail,
            charter.yachtName,
            charter.destination,
            charter.embarkationPort,
            charter.disembarkationPort,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(
              normalized
            )
      );
    }, [
      charters,
      query,
    ]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="ui-panel animate-pulse rounded-[28px] p-6">
          <div className="h-3 w-32 rounded bg-muted" />
          <div className="mt-4 h-11 w-72 rounded bg-muted" />
          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({
              length: 4,
            }).map(
              (
                _,
                index
              ) => (
                <div
                  key={index}
                  className="h-28 rounded-2xl bg-muted"
                />
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-5">
        <section className="ui-panel rounded-[28px] p-5 sm:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                Charter service control
              </p>

              <h1 className="mt-3 font-heading text-3xl tracking-[0.04em] text-foreground sm:text-4xl">
                Concierge
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                Coordinate guest requests, transfers, restaurants, provisioning, activities and crew-facing arrangements across every charter.
              </p>
            </div>

            <div className="w-full xl:max-w-sm">
              <label className="block">
                <span className="sr-only">
                  Search concierge charters
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(
                    event
                  ) =>
                    setQuery(
                      event.target
                        .value
                    )
                  }
                  placeholder="Search yacht, client, destination..."
                  className="ui-input w-full px-4 py-3 text-sm"
                />
              </label>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Charters"
            value={
              summary.charters
            }
          />
          <StatCard
            label="Active requests"
            value={
              summary.activeRequests
            }
          />
          <StatCard
            label="Urgent"
            value={
              summary.urgentRequests
            }
            emphasis={
              summary.urgentRequests >
              0
            }
          />
          <StatCard
            label="Confirmed"
            value={
              summary.confirmedRequests
            }
          />
          <StatCard
            label="Guest visible"
            value={
              summary.guestVisible
            }
          />
        </section>

        <section className="ui-panel rounded-[28px] p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Active charter workspaces
              </p>
              <h2 className="mt-2 font-heading text-2xl text-foreground">
                Concierge charters
              </h2>
            </div>

            <p className="text-xs text-muted-foreground">
              {
                filteredCharters.length
              }{" "}
              shown
            </p>
          </div>

          {filteredCharters.length >
          0 ? (
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {filteredCharters.map(
                (charter) => (
                  <CharterCard
                    key={
                      charter.id
                    }
                    charter={
                      charter
                    }
                  />
                )
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-background/35 px-5 py-14 text-center">
              <p className="text-sm font-semibold text-foreground">
                No concierge charters found.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Confirmed charters will appear here automatically.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CharterCard({
  charter,
}: {
  charter: ConciergeCharter;
}) {
  return (
    <article className="ui-panel-soft rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              value={
                charter.contractStatus
              }
            />
            <StatusBadge
              value={
                charter.charterStatus
              }
            />

            {charter.concierge
              .urgent > 0 ? (
              <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-red-800 dark:text-red-200">
                {
                  charter.concierge
                    .urgent
                }{" "}
                urgent
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 font-heading text-2xl text-foreground">
            {
              charter.yachtName
            }
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            {
              charter.clientName
            }{" "}
            ·{" "}
            {
              charter.reference
            }
          </p>
        </div>

        <Link
          href={`/concierge/${encodeURIComponent(
            charter.id
          )}`}
          className="ui-primary-button apple-transition inline-flex min-h-10 shrink-0 items-center justify-center px-4 py-2 text-sm font-semibold"
        >
          Open workspace
        </Link>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <InfoLine
          label="Charter"
          value={formatDateRange(
            charter.startDate,
            charter.endDate
          )}
        />
        <InfoLine
          label="Destination"
          value={
            charter.destination ??
            "Not set"
          }
        />
        <InfoLine
          label="Guests"
          value={
            charter.guests !==
            null
              ? String(
                  charter.guests
                )
              : "Not set"
          }
        />
        <InfoLine
          label="Next arrangement"
          value={formatDateTime(
            charter.concierge
              .nextScheduledAt
          )}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniMetric
          label="Active"
          value={
            charter.concierge
              .active
          }
        />
        <MiniMetric
          label="Confirmed"
          value={
            charter.concierge
              .confirmed
          }
        />
        <MiniMetric
          label="Completed"
          value={
            charter.concierge
              .completed
          }
        />
        <MiniMetric
          label="Guest visible"
          value={
            charter.concierge
              .guestVisible
          }
        />
      </div>

      {charter.concierge
        .estimatedOpenCost >
      0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Open estimated concierge spend:{" "}
          <span className="font-semibold text-foreground">
            {formatMoney(
              charter.concierge
                .estimatedOpenCost,
              charter.currency
            )}
          </span>
        </p>
      ) : null}
    </article>
  );
}

function StatCard({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-4 ${
        emphasis
          ? "border-red-500/25 bg-red-500/10"
          : "ui-panel"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/35 px-3 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function InfoLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/35 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm text-foreground">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  value,
}: {
  value: string;
}) {
  const positive =
    [
      "signed",
      "confirmed",
      "completed",
      "active",
    ].includes(value);

  const caution =
    [
      "pending",
      "planning",
      "contracting",
      "sent",
    ].includes(value);

  const negative =
    [
      "cancelled",
      "declined",
      "expired",
    ].includes(value);

  const className =
    positive
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
      : caution
        ? "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200"
        : negative
          ? "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-200"
          : "border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] ${className}`}
    >
      {formatLabel(
        value
      )}
    </span>
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

function formatDateRange(
  start: string | null,
  end: string | null
) {
  if (!start && !end) {
    return "Dates not set";
  }

  return `${formatDate(
    start
  )} → ${formatDate(
    end
  )}`;
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "Not set";
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
    return "Not scheduled";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Not scheduled";
  }

  return date.toLocaleString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function formatMoney(
  value: number,
  currency: string
) {
  try {
    return new Intl.NumberFormat(
      "en-GB",
      {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }
    ).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(
      "en-GB"
    )}`;
  }
}