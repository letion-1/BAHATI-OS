"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type OverviewResponse = {
  success: boolean;
  summary?: {
    charters: number;
    planned: number;
    ready: number;
    shared: number;
    totalDistanceNm: number;
  };
  charters?: Array<{
    id: string;
    reference: string;
    clientName: string;
    yachtName: string;
    startDate: string | null;
    endDate: string | null;
    destination: string | null;
    charterStatus: string;
    contractStatus: string;
    itinerary: {
      id: string;
      status: string;
      legCount: number;
      distanceNm: number;
      updatedAt: string;
    } | null;
  }>;
  error?: string;
};

export default function ItinerariesPage() {
  const [
    data,
    setData,
  ] =
    useState<OverviewResponse | null>(
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
            "/api/itineraries",
            {
              cache:
                "no-store",
            }
          );

        const result =
          (await response.json()) as OverviewResponse;

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ??
              "Could not load itineraries."
          );
        }

        setData(result);
      } catch (
        caughtError
      ) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load itineraries."
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

  const summary =
    data?.summary ?? {
      charters: 0,
      planned: 0,
      ready: 0,
      shared: 0,
      totalDistanceNm: 0,
    };

  const filtered =
    useMemo(() => {
      const normalized =
        query
          .trim()
          .toLowerCase();

      if (!normalized) {
        return rows;
      }

      return rows.filter(
        (row) =>
          [
            row.reference,
            row.clientName,
            row.yachtName,
            row.destination,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(
              normalized
            )
      );
    }, [
      query,
      rows,
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
                  Route intelligence
                </p>
              </div>

              <h1 className="mt-7 font-heading text-[42px] leading-[0.96] tracking-[0.02em] text-[var(--hero-foreground)] sm:text-[54px] lg:text-[62px]">
                ITINERARY & FUEL
                <br />
                INTELLIGENCE
              </h1>

              <p className="ui-hero-muted mt-7 max-w-2xl text-[15px] leading-7">
                Build charter routes leg by leg, estimate cruising time, model fuel burn and keep route assumptions visible before anything is shared with the client.
              </p>
            </div>

            <div className="w-full xl:max-w-[390px]">
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
                placeholder="Search yacht, client, destination..."
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
            label="Charters"
            value={summary.charters}
            description="Available route workspaces"
          />
          <Metric
            label="Planned"
            value={summary.planned}
            description="Itineraries already started"
          />
          <Metric
            label="Ready"
            value={summary.ready}
            description="Broker-ready route plans"
          />
          <Metric
            label="Shared"
            value={summary.shared}
            description="Client-facing plans"
          />
          <Metric
            label="Distance"
            value={summary.totalDistanceNm}
            suffix=" nm"
            description="Total planned nautical miles"
          />
        </section>

        <section className="ui-panel rounded-[28px] p-5 sm:p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Charter routes
            </p>
            <h2 className="mt-2 font-heading text-3xl text-foreground">
              ITINERARY WORKSPACES
            </h2>
          </div>

          {filtered.length >
          0 ? (
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {filtered.map(
                (row) => (
                  <article
                    key={row.id}
                    className="ui-panel-soft rounded-2xl p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge
                            value={
                              row.itinerary
                                ?.status ??
                              "not_started"
                            }
                          />
                        </div>

                        <h3 className="mt-3 font-heading text-2xl text-foreground">
                          {row.yachtName}
                        </h3>

                        <p className="mt-1 text-sm text-muted-foreground">
                          {row.clientName} · {row.reference}
                        </p>
                      </div>

                      <Link
                        href={`/itineraries/${encodeURIComponent(
                          row.id
                        )}`}
                        className="ui-primary-button inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm font-semibold"
                      >
                        {row.itinerary
                          ? "Open itinerary"
                          : "Start itinerary"}
                      </Link>
                    </div>

                    <div className="mt-5 grid gap-2 sm:grid-cols-3">
                      <Info
                        label="Dates"
                        value={formatDateRange(
                          row.startDate,
                          row.endDate
                        )}
                      />
                      <Info
                        label="Destination"
                        value={
                          row.destination ??
                          "Not set"
                        }
                      />
                      <Info
                        label="Route"
                        value={
                          row.itinerary
                            ? `${row.itinerary.legCount} legs · ${row.itinerary.distanceNm} nm`
                            : "Not planned"
                        }
                      />
                    </div>
                  </article>
                )
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-border px-5 py-12 text-center text-sm text-muted-foreground">
              No itinerary workspaces found.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  description,
  suffix = "",
}: {
  label: string;
  value: number;
  description: string;
  suffix?: string;
}) {
  return (
    <div className="ui-panel min-h-[180px] rounded-[24px] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-5 font-heading text-4xl text-foreground">
        {value}
        {suffix}
      </p>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
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
  return (
    <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-cyan-800 dark:text-cyan-200">
      {formatLabel(value)}
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

  return `${start ?? "TBC"} → ${end ?? "TBC"}`;
}