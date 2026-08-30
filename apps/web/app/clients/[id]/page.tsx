"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard as UIStatCard } from "@/components/ui/stat-card";

type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  vipLevel: string;
  preferredDestination: string | null;
  preferredYachtType: string | null;
  notes: string | null;
  preferences: Record<string, unknown>;
  lifetimeValue: number;
  lastContactedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Inquiry = {
  id: string;
  reference: string | null;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  guests: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type Proposal = {
  inquiryId: string;
  reference: string | null;
  status: string;
  pdfPath: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type DocumentRecord = {
  id: string;
  name: string;
  category: string;
  mimeType: string;
  fileSize: number;
  version: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type TimelineEvent = {
  id: string;
  type: string;
  title: string;
  description: string;
  createdAt: string;
  href: string | null;
};

type OverviewResponse = {
  success: boolean;
  client?: Client;
  inquiries?: Inquiry[];
  proposals?: Proposal[];
  documents?: DocumentRecord[];
  timeline?: TimelineEvent[];
  metrics?: {
    inquiryCount: number;
    proposalCount: number;
    documentCount: number;
    wonInquiryCount: number;
  };
  error?: string;
};

type Tab =
  | "overview"
  | "inquiries"
  | "proposals"
  | "documents"
  | "timeline"
  | "notes";

const tabs: Array<{ value: Tab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "inquiries", label: "Inquiries" },
  { value: "proposals", label: "Proposals" },
  { value: "documents", label: "Documents" },
  { value: "timeline", label: "Timeline" },
  { value: "notes", label: "Notes" },
];

export default function ClientProfilePage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const [data, setData] =
    useState<OverviewResponse | null>(null);
  const [activeTab, setActiveTab] =
    useState<Tab>("overview");
  const [isLoading, setIsLoading] =
    useState(true);
  const [error, setError] =
    useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `/api/clients/${clientId}/overview`,
        { cache: "no-store" }
      );

      const result =
        (await response.json()) as OverviewResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "Could not load client profile."
        );
      }

      setData(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load client profile."
      );
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const client = data?.client;
  const inquiries = data?.inquiries ?? [];
  const proposals = data?.proposals ?? [];
  const documents = data?.documents ?? [];
  const timeline = data?.timeline ?? [];
  const metrics = data?.metrics;

  const preferenceEntries = useMemo(() => {
    if (!client) return [];

    return Object.entries(client.preferences ?? {}).filter(
      ([, value]) =>
        value !== null &&
        value !== undefined &&
        value !== ""
    );
  }, [client]);

  if (isLoading) {
    return (
      <PageContainer contentClassName="space-y-7">
        <div className="contents">
          <div className="h-64 animate-pulse rounded-[28px] bg-accent/60" />
          <div className="h-16 animate-pulse rounded-2xl bg-accent/60" />
          <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-2">
            <div className="h-96 animate-pulse rounded-2xl bg-accent/60" />
            <div className="h-96 animate-pulse rounded-2xl bg-accent/60" />
          </div>
        </div>
      </PageContainer>
    );
  }

  if (error || !client) {
    return (
      <PageContainer>
        <div>
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error ?? "Client not found."}
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer contentClassName="space-y-7">
      <div className="contents">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/clients"
            className="text-sm font-semibold text-sky-800 dark:text-sky-300 transition hover:text-foreground"
          >
            ← Back to clients
          </Link>

          <button
            type="button"
            onClick={() => void loadProfile()}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-accent/60 hover:text-foreground"
          >
            Refresh profile
          </button>
        </div>

        <section className="relative overflow-hidden rounded-[28px] border border-border bg-[linear-gradient(135deg,var(--hero-start),var(--hero-middle),var(--hero-end))] text-[var(--hero-foreground)] p-6 shadow-[var(--strong-shadow)] sm:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />

          <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex min-w-0 items-start gap-5">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-[22px] border border-cyan-500/20 bg-cyan-500/10 text-xl font-semibold text-cyan-800 dark:text-cyan-200">
                {initials(client.name)}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="ui-hero-accent text-xs font-semibold uppercase tracking-[0.24em]">
                    Client Intelligence
                  </p>
                  <StatusBadge value={client.status} />
                  <VipBadge value={client.vipLevel} />
                </div>

                <h1 className="mt-4 truncate font-heading text-5xl leading-none tracking-[0.055em] text-[var(--hero-foreground)] sm:text-6xl">
                  {client.name}
                </h1>

                <div className="ui-hero-muted mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <span>
                    {client.email ?? "No email recorded"}
                  </span>
                  <span>
                    {client.phone ?? "No phone recorded"}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
              <HeaderMetric
                label="Lifetime value"
                value={formatCurrency(
                  client.lifetimeValue
                )}
              />
              <HeaderMetric
                label="Inquiries"
                value={String(
                  metrics?.inquiryCount ?? 0
                )}
              />
              <HeaderMetric
                label="Proposals"
                value={String(
                  metrics?.proposalCount ?? 0
                )}
              />
              <HeaderMetric
                label="Documents"
                value={String(
                  metrics?.documentCount ?? 0
                )}
              />
            </div>
          </div>
        </section>

        <section className="overflow-x-auto rounded-2xl border border-border bg-card p-2">
          <div className="flex min-w-max gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() =>
                  setActiveTab(tab.value)
                }
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  activeTab === tab.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeTab === "overview" && (
          <section className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-2">
            <Panel
              title="Client profile"
              subtitle="Relationship and preference summary"
            >
              <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2">
                <InfoBlock
                  label="Preferred destination"
                  value={
                    client.preferredDestination ??
                    "Not specified"
                  }
                />
                <InfoBlock
                  label="Preferred yacht type"
                  value={
                    client.preferredYachtType ??
                    "Not specified"
                  }
                />
                <InfoBlock
                  label="Last contacted"
                  value={formatDateTime(
                    client.lastContactedAt
                  )}
                />
                <InfoBlock
                  label="Client since"
                  value={formatDateTime(
                    client.createdAt
                  )}
                />
              </div>

              <div className="mt-5 rounded-2xl border border-border/75 bg-background/45 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/65">
                  Broker notes
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                  {client.notes ??
                    "No broker notes recorded yet."}
                </p>
              </div>
            </Panel>

            <Panel
              title="Recent activity"
              subtitle="Latest client events"
            >
              <TimelineList
                events={timeline.slice(0, 6)}
              />
            </Panel>
          </section>
        )}

        {activeTab === "inquiries" && (
          <section className="space-y-4">
            {inquiries.length === 0 ? (
              <EmptyPanel
                title="No linked inquiries"
                description="Won inquiries converted into this client will appear here."
              />
            ) : (
              inquiries.map((inquiry) => (
                <article
                  key={inquiry.id}
                  className="rounded-2xl border border-border bg-card p-5 sm:p-6"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-lg font-semibold">
                          {inquiry.reference ??
                            "Inquiry"}
                        </h2>
                        <StatusBadge
                          value={inquiry.status}
                        />
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {inquiry.destination ??
                          "No destination"}{" "}
                        ·{" "}
                        {formatDateRange(
                          inquiry.startDate,
                          inquiry.endDate
                        )}
                      </p>
                    </div>

                    <Link
                      href={`/workspace/inquiry/${inquiry.id}`}
                      className="inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-primary-foreground"
                    >
                      Open inquiry
                    </Link>
                  </div>
                </article>
              ))
            )}
          </section>
        )}

        {activeTab === "proposals" && (
          <section className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
            {proposals.length === 0 ? (
              <div className="lg:col-span-2">
                <EmptyPanel
                  title="No proposals yet"
                  description="Generated proposals linked to this client's inquiries will appear here."
                />
              </div>
            ) : (
              proposals.map((proposal) => (
                <article
                  key={proposal.inquiryId}
                  className="rounded-2xl border border-border bg-card p-5"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-800 dark:text-violet-300">
                    Proposal
                  </p>
                  <h2 className="mt-3 text-xl font-semibold">
                    {proposal.reference ??
                      "Charter proposal"}
                  </h2>
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/75 pt-4">
                    <StatusBadge
                      value={proposal.status}
                    />
                    <Link
                      href={`/proposals/${proposal.inquiryId}`}
                      className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                    >
                      Open proposal
                    </Link>
                  </div>
                </article>
              ))
            )}
          </section>
        )}

        {activeTab === "documents" && (
          <section className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2 2xl:grid-cols-3">
            {documents.length === 0 ? (
              <div className="lg:col-span-2 2xl:col-span-3">
                <EmptyPanel
                  title="No linked documents"
                  description="Upload a document and link it to this client."
                />
              </div>
            ) : (
              documents.map((document) => (
                <article
                  key={document.id}
                  className="rounded-2xl border border-border bg-card p-5"
                >
                  <h2 className="truncate text-lg font-semibold">
                    {document.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {humanize(document.category)}
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <InfoBlock
                      label="Size"
                      value={formatBytes(
                        document.fileSize
                      )}
                    />
                    <InfoBlock
                      label="Version"
                      value={`v${document.version}`}
                    />
                  </div>
                </article>
              ))
            )}
          </section>
        )}

        {activeTab === "timeline" && (
          <Panel
            title="Client timeline"
            subtitle="Chronological activity across the workspace"
          >
            <TimelineList events={timeline} />
          </Panel>
        )}

        {activeTab === "notes" && (
          <section className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-2">
            <Panel
              title="Broker notes"
              subtitle="Private relationship context"
            >
              <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                {client.notes ??
                  "No broker notes have been added."}
              </p>
            </Panel>

            <Panel
              title="Preference record"
              subtitle="Structured client intelligence"
            >
              {preferenceEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground/80">
                  No structured preferences recorded.
                </p>
              ) : (
                <div className="space-y-3">
                  {preferenceEntries.map(
                    ([key, value]) => (
                      <div
                        key={key}
                        className="rounded-xl border border-white/[0.05] bg-background/45 p-4"
                      >
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground/65">
                          {humanize(key)}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-foreground/80">
                          {formatPreferenceValue(
                            value
                          )}
                        </p>
                      </div>
                    )
                  )}
                </div>
              )}
            </Panel>
          </section>
        )}
      </div>
    </PageContainer>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-xl font-semibold">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground/80">
        {subtitle}
      </p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function TimelineList({
  events,
}: {
  events: TimelineEvent[];
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground/80">
        No timeline events available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex gap-4 rounded-xl border border-white/[0.05] bg-background/45 p-4"
        >
          <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-400" />
          <div>
            <h3 className="text-sm font-semibold">
              {event.title}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {event.description}
            </p>
            <p className="mt-2 text-xs text-muted-foreground/65">
              {formatDateTime(event.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function HeaderMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-32 rounded-xl border border-border/85 bg-background/45 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/65">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold">
        {value}
      </p>
    </div>
  );
}

function InfoBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-background/45 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground/65">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-foreground/80">
        {value}
      </p>
    </div>
  );
}

function EmptyPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-[28px] border border-dashed border-border bg-card px-6 py-20 text-center">
      <h2 className="text-xl font-semibold">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
    </section>
  );
}

function StatusBadge({
  value,
}: {
  value: string;
}) {
  return (
    <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-800 dark:text-sky-300">
      {humanize(value)}
    </span>
  );
}

function VipBadge({
  value,
}: {
  value: string;
}) {
  if (value === "standard") return null;

  return (
    <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
      {value === "ultra" ? "Ultra VIP" : "VIP"}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      part.charAt(0).toUpperCase()
    )
    .join("");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(
  value: string | null
): string {
  if (!value) return "Not recorded";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateRange(
  start: string | null,
  end: string | null
): string {
  if (!start && !end) {
    return "Dates not recorded";
  }

  return `${formatDateTime(start)} – ${formatDateTime(
    end
  )}`;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(
      Math.log(bytes) / Math.log(1024)
    ),
    units.length - 1
  );

  return `${(
    bytes /
    1024 ** index
  ).toFixed(1)} ${units[index]}`;
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}

function formatPreferenceValue(
  value: unknown
): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}