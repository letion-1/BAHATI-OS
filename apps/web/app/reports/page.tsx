"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type DataPoint = {
  label: string;
  value: number;
};

type ReportsResponse = {
  success: boolean;
  metrics?: {
    totalInquiries: number;
    openInquiries: number;
    wonInquiries: number;
    lostInquiries: number;
    proposalCount: number;
    clientCount: number;
    yachtCount: number;
    documentCount: number;
    pipelineValue: number;
    wonValue: number;
    conversionRate: number;
    proposalRate: number;
    averageInquiryValue: number;
  };
  statusBreakdown?: DataPoint[];
  destinationBreakdown?: DataPoint[];
  monthlyInquiries?: DataPoint[];
  generatedAt?: string;
  error?: string;
};

export default function ReportsPage() {
  const [data, setData] =
    useState<ReportsResponse | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [isLoading, setIsLoading] =
    useState(true);
  const [error, setError] =
    useState<string | null>(null);

  const loadReports = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();

      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const response = await fetch(
        `/api/reports?${params.toString()}`,
        { cache: "no-store" }
      );

      const text = await response.text();

      let result: ReportsResponse | null = null;

      if (text.trim()) {
        try {
          result = JSON.parse(text) as ReportsResponse;
        } catch {
          throw new Error(
            `Reports API returned invalid JSON (${response.status}).`
          );
        }
      }

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error ??
            `Could not load reports (${response.status}).`
        );
      }

      setData(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load reports."
      );
    } finally {
      setIsLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const metrics = data?.metrics;

  const maxStatus = useMemo(
    () =>
      Math.max(
        1,
        ...(data?.statusBreakdown ?? []).map(
          (item) => item.value
        )
      ),
    [data]
  );

  const maxMonth = useMemo(
    () =>
      Math.max(
        1,
        ...(data?.monthlyInquiries ?? []).map(
          (item) => item.value
        )
      ),
    [data]
  );

  return (
    <main className="ui-page min-h-full px-5 py-7 sm:px-7 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-7">
        <section className="ui-hero rounded-[30px] p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />

          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="ui-hero-accent text-xs font-semibold uppercase tracking-[0.26em]">
                Commercial Intelligence
              </p>
              <h1 className="mt-5 font-heading text-5xl leading-none tracking-[0.055em] text-[var(--hero-foreground)] sm:text-6xl xl:text-7xl">
                Brokerage reports
              </h1>
              <p className="ui-hero-muted mt-3 max-w-3xl text-sm leading-7">
                Track pipeline value, inquiry conversion,
                proposal activity and destination demand.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadReports()}
              className="ui-primary-button apple-transition min-h-12 px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
            >
              Refresh reports
            </button>
          </div>
        </section>

        <section className="ui-panel rounded-[24px] p-5">
          <div className="grid gap-4 [&>*]:min-w-0 md:grid-cols-[1fr_1fr_auto_auto]">
            <DateField
              label="From"
              value={from}
              onChange={setFrom}
            />
            <DateField
              label="To"
              value={to}
              onChange={setTo}
            />

            <button
              type="button"
              onClick={() => void loadReports()}
              className="ui-primary-button apple-transition self-end px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
            >
              Apply
            </button>

            <button
              type="button"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="ui-secondary-button apple-transition self-end px-5 py-3 text-sm font-semibold hover:bg-accent"
            >
              Clear
            </button>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map(
              (_, index) => (
                <div
                  key={index}
                  className="h-40 animate-pulse rounded-[24px] bg-muted"
                />
              )
            )}
          </div>
        ) : (
          <>
            <section className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Pipeline value"
                value={formatCurrency(
                  metrics?.pipelineValue ?? 0
                )}
              />
              <Metric
                label="Won value"
                value={formatCurrency(
                  metrics?.wonValue ?? 0
                )}
              />
              <Metric
                label="Conversion rate"
                value={`${(
                  metrics?.conversionRate ?? 0
                ).toFixed(1)}%`}
              />
              <Metric
                label="Proposal rate"
                value={`${(
                  metrics?.proposalRate ?? 0
                ).toFixed(1)}%`}
              />
            </section>

            <section className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
              <SmallMetric
                label="Total inquiries"
                value={metrics?.totalInquiries ?? 0}
              />
              <SmallMetric
                label="Open inquiries"
                value={metrics?.openInquiries ?? 0}
              />
              <SmallMetric
                label="Won inquiries"
                value={metrics?.wonInquiries ?? 0}
              />
              <SmallMetric
                label="Proposals"
                value={metrics?.proposalCount ?? 0}
              />
              <SmallMetric
                label="Clients"
                value={metrics?.clientCount ?? 0}
              />
              <SmallMetric
                label="Fleet yachts"
                value={metrics?.yachtCount ?? 0}
              />
              <SmallMetric
                label="Documents"
                value={metrics?.documentCount ?? 0}
              />
              <SmallMetric
                label="Average inquiry"
                value={formatCurrency(
                  metrics?.averageInquiryValue ?? 0
                )}
              />
            </section>

            <section className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-2">
              <Panel title="Inquiry pipeline">
                <Bars
                  items={data?.statusBreakdown ?? []}
                  maximum={maxStatus}
                />
              </Panel>

              <Panel title="Destination demand">
                <div className="space-y-3">
                  {(data?.destinationBreakdown ?? []).map(
                    (item, index) => (
                      <div
                        key={item.label}
                        className="ui-panel-soft apple-transition flex items-center justify-between rounded-xl px-4 py-3 hover:-translate-y-0.5 hover:border-ring/25"
                      >
                        <span className="text-sm text-muted-foreground">
                          {index + 1}. {item.label}
                        </span>
                        <span className="font-semibold">
                          {item.value}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </Panel>

              <Panel title="Monthly activity">
                <Bars
                  items={data?.monthlyInquiries ?? []}
                  maximum={maxMonth}
                />
              </Panel>

              <Panel title="Commercial summary">
                <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2">
                  <SmallMetric
                    label="Open opportunities"
                    value={metrics?.openInquiries ?? 0}
                  />
                  <SmallMetric
                    label="Won opportunities"
                    value={metrics?.wonInquiries ?? 0}
                  />
                  <SmallMetric
                    label="Lost opportunities"
                    value={metrics?.lostInquiries ?? 0}
                  />
                  <SmallMetric
                    label="Proposal records"
                    value={metrics?.proposalCount ?? 0}
                  />
                </div>
              </Panel>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="ui-input mt-2 h-12 px-4 text-sm"
      />
    </label>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="ui-panel rounded-[24px] p-5">
      <p className="text-sm text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 font-heading text-5xl leading-none tracking-[0.045em] text-foreground">
        {value}
      </p>
    </article>
  );
}

function SmallMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <article className="ui-panel-soft rounded-xl p-4">
      <p className="text-sm text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-heading text-3xl leading-none tracking-[0.045em] text-foreground">
        {value}
      </p>
    </article>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ui-panel rounded-[24px] p-5 sm:p-6">
      <h2 className="font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
        {title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Bars({
  items,
  maximum,
}: {
  items: DataPoint[];
  maximum: number;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No data found.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {humanize(item.label)}
            </span>
            <span>{item.value}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#8a6444,#b48763)] dark:bg-[linear-gradient(90deg,#38bdf8,#22d3ee)]"
              style={{
                width: `${Math.max(
                  5,
                  (item.value / maximum) * 100
                )}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function humanize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}