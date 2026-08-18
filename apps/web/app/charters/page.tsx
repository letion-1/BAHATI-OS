"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type LifecycleStage =
  | "contracting"
  | "upcoming"
  | "active"
  | "completed"
  | "cancelled";

type CharterRow = {
  id: string;
  proposalId: string;
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
  totalContractValue: number | null;
  charterStatus: string;
  contractStatus: string;
  paymentStatus: string;
  lifecycleStage: LifecycleStage;
  contractSentAt: string | null;
  contractSignedAt: string | null;
  payments: {
    total: number;
    paid: number;
    attention: number;
    overdue: number;
  };
  concierge: {
    total: number;
    open: number;
    attention: number;
  };
  itinerary: {
    id: string;
    status: string;
    dayCount: number;
    updatedAt: string;
  } | null;
  portal: {
    status: string;
    sentAt: string | null;
    openedAt: string | null;
    openedCount: number;
    submittedAt: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

type ChartersResponse = {
  success: boolean;
  summary?: {
    openCharters: number;
    contractValueByCurrency:
      Record<string, number>;
    awaitingSignature: number;
    paymentAttention: number;
    conciergeAttention: number;
  };
  counts?: {
    all: number;
    contracting: number;
    upcoming: number;
    active: number;
    completed: number;
    cancelled: number;
  };
  charters?: CharterRow[];
  error?: string;
};

const emptyCounts = {
  all: 0,
  contracting: 0,
  upcoming: 0,
  active: 0,
  completed: 0,
  cancelled: 0,
};

export default function ChartersPage() {
  const [
    data,
    setData,
  ] =
    useState<ChartersResponse | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    query,
    setQuery,
  ] =
    useState("");

  const [
    stage,
    setStage,
  ] =
    useState<
      | "all"
      | LifecycleStage
    >("all");

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const load =
    useCallback(async () => {
      try {
        setError(null);

        const response =
          await fetch(
            "/api/charters",
            {
              cache:
                "no-store",
            }
          );

        const result =
          (await response.json()) as ChartersResponse;

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ??
              "Could not load charters."
          );
        }

        setData(result);
      } catch (
        caughtError
      ) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load charters."
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows =
    data?.charters ??
    [];

  const counts =
    data?.counts ??
    emptyCounts;

  const summary =
    data?.summary ?? {
      openCharters: 0,
      contractValueByCurrency:
        {},
      awaitingSignature: 0,
      paymentAttention: 0,
      conciergeAttention: 0,
    };

  const filtered =
    useMemo(() => {
      const normalized =
        query
          .trim()
          .toLowerCase();

      return rows.filter(
        (row) => {
          if (
            stage !== "all" &&
            row.lifecycleStage !==
              stage
          ) {
            return false;
          }

          if (!normalized) {
            return true;
          }

          return [
            row.reference,
            row.clientName,
            row.clientEmail,
            row.yachtName,
            row.destination,
            row.embarkationPort,
            row.disembarkationPort,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(
              normalized
            );
        }
      );
    }, [
      query,
      rows,
      stage,
    ]);

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="ui-panel h-80 animate-pulse rounded-[30px]" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-5">
        <section className="ui-hero rounded-[30px] p-6 sm:p-8 lg:p-10">
          <div className="relative flex min-h-[290px] flex-col justify-between gap-8 xl:flex-row xl:items-end">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <span className="size-2 rounded-full bg-[var(--hero-foreground)]" />
                <p className="ui-hero-accent text-[11px] font-bold uppercase tracking-[0.28em]">
                  Charter operations
                </p>
              </div>

              <h1 className="mt-7 font-heading text-[42px] leading-[0.96] tracking-[0.02em] text-[var(--hero-foreground)] sm:text-[54px] lg:text-[62px]">
                CHARTERS
              </h1>

              <p className="ui-hero-muted mt-7 max-w-2xl text-[15px] leading-7">
                Proposals win the charter. This workspace runs it. Track contracting, payments, itinerary readiness, Concierge work and the client portal from one operating view.
              </p>
            </div>

            <div className="w-full xl:max-w-[410px]">
              <input
                type="search"
                value={query}
                onChange={(
                  event
                ) =>
                  setQuery(
                    event.target.value
                  )
                }
                placeholder="Search yacht, client, reference, destination..."
                className="ui-input min-h-12 w-full px-4 text-sm"
              />
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Open charters"
            value={String(
              summary.openCharters
            )}
            description="Contracting, upcoming and active"
          />

          <Metric
            label="Contract value"
            value={formatMoneySummary(
              summary.contractValueByCurrency
            )}
            description="Open non-cancelled charter value"
          />

          <Metric
            label="Awaiting signature"
            value={String(
              summary.awaitingSignature
            )}
            description="Contracting charters not yet signed"
          />

          <Metric
            label="Payment attention"
            value={String(
              summary.paymentAttention
            )}
            description="Charters with due or overdue money"
          />

          <Metric
            label="Concierge attention"
            value={String(
              summary.conciergeAttention
            )}
            description="High or urgent open requests"
          />
        </section>

        <section className="ui-panel rounded-[28px] p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
              <StageButton
                label="All"
                value="all"
                count={
                  counts.all
                }
                active={
                  stage ===
                  "all"
                }
                onClick={() =>
                  setStage(
                    "all"
                  )
                }
              />

              <StageButton
                label="Contracting"
                value="contracting"
                count={
                  counts.contracting
                }
                active={
                  stage ===
                  "contracting"
                }
                onClick={() =>
                  setStage(
                    "contracting"
                  )
                }
              />

              <StageButton
                label="Upcoming"
                value="upcoming"
                count={
                  counts.upcoming
                }
                active={
                  stage ===
                  "upcoming"
                }
                onClick={() =>
                  setStage(
                    "upcoming"
                  )
                }
              />

              <StageButton
                label="Active"
                value="active"
                count={
                  counts.active
                }
                active={
                  stage ===
                  "active"
                }
                onClick={() =>
                  setStage(
                    "active"
                  )
                }
              />

              <StageButton
                label="Completed"
                value="completed"
                count={
                  counts.completed
                }
                active={
                  stage ===
                  "completed"
                }
                onClick={() =>
                  setStage(
                    "completed"
                  )
                }
              />

              <StageButton
                label="Cancelled"
                value="cancelled"
                count={
                  counts.cancelled
                }
                active={
                  stage ===
                  "cancelled"
                }
                onClick={() =>
                  setStage(
                    "cancelled"
                  )
                }
              />
            </div>

            <p className="shrink-0 text-xs font-semibold text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "charter" : "charters"}
            </p>
          </div>
        </section>

        {filtered.length >
        0 ? (
          <section className="grid gap-4 xl:grid-cols-2">
            {filtered.map(
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
          </section>
        ) : (
          <section className="ui-panel rounded-[28px] px-5 py-16 text-center">
            <p className="font-heading text-2xl text-foreground">
              NO CHARTERS FOUND
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Try another lifecycle filter or search term.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

function CharterCard({
  charter,
}: {
  charter: CharterRow;
}) {
  return (
    <article className="ui-panel overflow-hidden rounded-[28px]">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <LifecycleBadge
                value={
                  charter.lifecycleStage
                }
              />

              <StatusBadge
                label="Contract"
                value={
                  charter.contractStatus
                }
              />

              <StatusBadge
                label="Payment"
                value={
                  charter.paymentStatus
                }
              />
            </div>

            <h2 className="mt-4 break-words font-heading text-3xl text-foreground">
              {charter.yachtName}
            </h2>

            <p className="mt-1 break-words text-sm text-muted-foreground">
              {charter.clientName} - {charter.reference}
            </p>
          </div>

          <Link
            href={`/charters/${encodeURIComponent(
              charter.id
            )}`}
            className="ui-primary-button inline-flex min-h-11 shrink-0 items-center justify-center px-4 py-2.5 text-sm font-semibold"
          >
            {charter.lifecycleStage ===
            "contracting"
              ? "Continue charter"
              : "Open charter"}
          </Link>
        </div>

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

          <Info
            label="Contract value"
            value={
              charter.totalContractValue !==
              null
                ? formatMoney(
                    charter.totalContractValue,
                    charter.currency
                  )
                : "Not set"
            }
          />
        </div>
      </div>

      <div className="border-t border-border bg-background/25 p-4 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Readiness
            label="Contract"
            value={formatLabel(
              charter.contractStatus
            )}
            tone={
              charter.contractStatus ===
              "signed"
                ? "good"
                : charter.contractStatus ===
                    "sent" ||
                  charter.contractStatus ===
                    "ready"
                  ? "attention"
                  : "neutral"
            }
          />

          <Readiness
            label="Payments"
            value={
              charter.payments.attention >
              0
                ? `${charter.payments.attention} need attention`
                : charter.payments.total >
                    0
                  ? `${charter.payments.paid}/${charter.payments.total} paid`
                  : formatLabel(
                      charter.paymentStatus
                    )
            }
            tone={
              charter.payments.attention >
                0 ||
              charter.paymentStatus ===
                "overdue"
                ? "attention"
                : charter.paymentStatus ===
                    "paid"
                  ? "good"
                  : "neutral"
            }
          />

          <Readiness
            label="Portal"
            value={
              charter.portal
                ? charter.portal.sentAt
                  ? `Sent - ${charter.portal.openedCount} opens`
                  : formatLabel(
                      charter.portal.status
                    )
                : "Not active"
            }
            tone={
              charter.portal?.sentAt
                ? "good"
                : "neutral"
            }
          />

          <Readiness
            label="Itinerary"
            value={
              charter.itinerary
                ? `${charter.itinerary.dayCount} days - ${formatLabel(
                    charter.itinerary.status
                  )}`
                : "Not started"
            }
            tone={
              charter.itinerary
                ?.status ===
              "shared"
                ? "good"
                : charter.itinerary
                  ? "neutral"
                  : "neutral"
            }
          />

          <Readiness
            label="Concierge"
            value={
              charter.concierge.attention >
              0
                ? `${charter.concierge.attention} high priority`
                : charter.concierge.open >
                    0
                  ? `${charter.concierge.open} open`
                  : charter.concierge.total >
                      0
                    ? "Clear"
                    : "No requests"
            }
            tone={
              charter.concierge.attention >
              0
                ? "attention"
                : charter.concierge.open ===
                    0 &&
                  charter.concierge.total >
                    0
                  ? "good"
                  : "neutral"
            }
          />
        </div>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="ui-panel rounded-2xl px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-2 break-words text-2xl font-semibold text-foreground">
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function StageButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  value: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
        active
          ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200"
          : "border-border bg-background/35 text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {label} - {count}
    </button>
  );
}

function LifecycleBadge({
  value,
}: {
  value: LifecycleStage;
}) {
  const className =
    value === "active"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
      : value ===
          "upcoming"
        ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200"
        : value ===
            "contracting"
          ? "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          : value ===
              "cancelled"
            ? "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-200"
            : "border-border bg-background/50 text-muted-foreground";

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

function StatusBadge({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="rounded-full border border-border bg-background/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {label} - {formatLabel(
        value
      )}
    </span>
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function Readiness({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone:
    | "good"
    | "attention"
    | "neutral";
}) {
  const className =
    tone === "good"
      ? "border-emerald-500/20 bg-emerald-500/8"
      : tone ===
          "attention"
        ? "border-amber-500/20 bg-amber-500/8"
        : "border-border bg-background/35";

  return (
    <div
      className={`min-w-0 rounded-xl border px-3 py-3 ${className}`}
    >
      <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 break-words text-xs font-semibold leading-5 text-foreground">
        {value}
      </p>
    </div>
  );
}

function formatMoneySummary(
  values:
    Record<string, number>
) {
  const entries =
    Object.entries(values);

  if (
    entries.length === 0
  ) {
    return "No value";
  }

  return entries
    .slice(0, 2)
    .map(
      ([
        currency,
        value,
      ]) =>
        formatCompactMoney(
          value,
          currency
        )
    )
    .join(" + ");
}

function formatCompactMoney(
  value: number,
  currency: string
) {
  try {
    return new Intl.NumberFormat(
      "en-GB",
      {
        style: "currency",
        currency,
        notation:
          "compact",
        maximumFractionDigits: 1,
      }
    ).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(
      "en-GB"
    )}`;
  }
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
        maximumFractionDigits: 0,
      }
    ).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(
      "en-GB"
    )}`;
  }
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