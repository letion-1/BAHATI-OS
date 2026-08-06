import Link from "next/link";
import { notFound } from "next/navigation";

import { HeroCard } from "@/components/ui/hero-card";
import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { createClient } from "@/lib/supabase/server";

type InquiryWorkspacePageProps = {
  params: Promise<{ id: string }>;
};

type InquiryRecord = {
  id: string;
  reference: string | null;
  client_name: string | null;
  client_type: string | null;
  email: string | null;
  phone: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  preferences: string | null;
  original_inquiry: string | null;
  source: string | null;
  status: string | null;
  extraction_confidence: number | null;
  created_at: string | null;
};

export default async function InquiryWorkspacePage({
  params,
}: InquiryWorkspacePageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inquiries")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load inquiry:", error);
  }

  if (!data) {
    notFound();
  }

  const inquiry = data as InquiryRecord;
  const confidence = normalizeConfidence(
    inquiry.extraction_confidence
  );

  return (
    <PageContainer contentClassName="space-y-7">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Link
          href="/inquiries"
          className="apple-transition hover:text-foreground"
        >
          Inquiries
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">
          {inquiry.reference || inquiry.id}
        </span>
      </div>

      <HeroCard
        eyebrow="Inquiry intelligence"
        title={inquiry.client_name || "Unnamed inquiry"}
        description={
          inquiry.client_type ||
          "Review the extracted charter brief, confirm missing details and move the request into matching."
        }
        actions={
          <div className="flex flex-wrap gap-3">
            <Link
              href="/inquiries"
              className="ui-secondary-button apple-transition inline-flex min-h-12 items-center justify-center px-5 py-3 text-sm font-semibold hover:bg-accent"
            >
              Back to inquiries
            </Link>
            <Link
              href="/inquiries/new"
              className="ui-primary-button apple-transition inline-flex min-h-12 items-center justify-center px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
            >
              New inquiry
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Destination"
          value={inquiry.destination || "Not set"}
          subtitle="Preferred cruising area"
          tone="cyan"
        />
        <StatCard
          label="Guests"
          value={inquiry.guests ?? "Not set"}
          subtitle="Current confirmed count"
          tone="emerald"
        />
        <StatCard
          label="Charter dates"
          value={formatDateRange(
            inquiry.start_date,
            inquiry.end_date
          ) || "Not set"}
          subtitle="Requested charter window"
          tone="violet"
        />
        <StatCard
          label="Budget"
          value={formatBudget(inquiry) || "Not set"}
          subtitle="Maximum charter range"
          tone="amber"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="ui-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader
              eyebrow="Client record"
              title="Contact and inquiry details"
              subtitle="Everything captured from the original request"
              className="mb-5"
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <DetailPanel title="Client details">
                <DetailRow
                  label="Name"
                  value={inquiry.client_name}
                />
                <DetailRow
                  label="Email"
                  value={inquiry.email}
                />
                <DetailRow
                  label="Phone"
                  value={inquiry.phone}
                />
                <DetailRow
                  label="Client type"
                  value={inquiry.client_type}
                />
              </DetailPanel>

              <DetailPanel title="Inquiry details">
                <DetailRow
                  label="Reference"
                  value={inquiry.reference}
                />
                <DetailRow
                  label="Source"
                  value={inquiry.source}
                />
                <DetailRow
                  label="Status"
                  value={formatLabel(inquiry.status)}
                />
                <DetailRow
                  label="Created"
                  value={formatDateTime(inquiry.created_at)}
                />
              </DetailPanel>
            </div>
          </section>

          <section className="ui-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader
              eyebrow="Charter brief"
              title="Preferences"
              subtitle="Requested yacht features and service priorities"
              className="mb-5"
            />

            {inquiry.preferences ? (
              <div className="flex flex-wrap gap-2">
                {splitPreferences(inquiry.preferences).map(
                  (preference) => (
                    <span
                      key={preference}
                      className="rounded-full border border-border bg-accent/70 px-3 py-1.5 text-xs font-medium text-foreground/80"
                    >
                      {preference}
                    </span>
                  )
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No preferences were provided.
              </p>
            )}
          </section>

          <section className="ui-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader
              eyebrow="Source message"
              title="Original inquiry"
              subtitle="The exact message used to create this record"
              className="mb-5"
            />

            <div className="ui-panel-soft rounded-2xl p-5">
              <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/80">
                {inquiry.original_inquiry ||
                  "Original inquiry text is unavailable."}
              </p>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="ui-panel rounded-[28px] p-5 sm:p-6">
            <SectionHeader
              eyebrow="Pipeline"
              title="Next actions"
              subtitle="Move this inquiry through the charter workflow"
              className="mb-5"
            />

            <div className="space-y-3">
              <Link
                href={`/availability?inquiry=${inquiry.id}`}
                className="ui-primary-button apple-transition flex min-h-12 w-full items-center justify-center px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
              >
                Match fleet
              </Link>
              <Link
                href="/proposals/new"
                className="ui-secondary-button apple-transition flex min-h-12 w-full items-center justify-center px-5 py-3 text-sm font-semibold hover:bg-accent"
              >
                Build proposal
              </Link>
              <a
                href={buildContactHref(inquiry)}
                className="ui-secondary-button apple-transition flex min-h-12 w-full items-center justify-center px-5 py-3 text-sm font-semibold hover:bg-accent"
              >
                Contact client
              </a>
            </div>
          </section>

          <section className="ui-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Inquiry health
                </p>
                <h2 className="mt-2 font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
                  Broker readiness
                </h2>
              </div>

              {confidence !== null ? (
                <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-800 dark:text-cyan-200">
                  {confidence}% AI
                </span>
              ) : null}
            </div>

            <div className="mt-6 space-y-4">
              <HealthRow
                label="Client identified"
                complete={Boolean(inquiry.client_name)}
              />
              <HealthRow
                label="Destination confirmed"
                complete={Boolean(inquiry.destination)}
              />
              <HealthRow
                label="Dates provided"
                complete={Boolean(
                  inquiry.start_date && inquiry.end_date
                )}
              />
              <HealthRow
                label="Budget provided"
                complete={
                  inquiry.budget_min !== null ||
                  inquiry.budget_max !== null
                }
              />
              <HealthRow
                label="Contact available"
                complete={Boolean(
                  inquiry.email || inquiry.phone
                )}
              />
            </div>
          </section>
        </aside>
      </section>
    </PageContainer>
  );
}

function DetailPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ui-panel-soft rounded-2xl p-4 sm:p-5">
      <p className="font-heading text-2xl leading-none tracking-[0.05em] text-foreground">
        {title}
      </p>
      <div className="mt-4 space-y-3">
        {children}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-3 last:border-0 last:pb-0">
      <span className="text-xs text-muted-foreground">
        {label}
      </span>
      <span className="max-w-[66%] text-right text-sm font-semibold text-foreground">
        {value || "Not provided"}
      </span>
    </div>
  );
}

function HealthRow({
  label,
  complete,
}: {
  label: string;
  complete: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">
        {label}
      </span>
      <span
        className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${
          complete
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "bg-amber-500/10 text-amber-800 dark:text-amber-300"
        }`}
      >
        {complete ? "✓" : "!"}
      </span>
    </div>
  );
}

function normalizeConfidence(
  value: number | null
): number | null {
  if (value === null || Number.isNaN(value)) {
    return null;
  }

  const percentage = value <= 1 ? value * 100 : value;
  return Math.round(
    Math.min(100, Math.max(0, percentage))
  );
}

function splitPreferences(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatBudget(inquiry: {
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
}): string | null {
  if (
    inquiry.budget_min === null &&
    inquiry.budget_max === null
  ) {
    return null;
  }

  const symbol =
    inquiry.currency === "EUR"
      ? "€"
      : inquiry.currency === "USD"
        ? "$"
        : inquiry.currency === "GBP"
          ? "£"
          : inquiry.currency
            ? `${inquiry.currency} `
            : "";

  const minimum =
    inquiry.budget_min !== null
      ? inquiry.budget_min.toLocaleString()
      : "?";
  const maximum =
    inquiry.budget_max !== null
      ? inquiry.budget_max.toLocaleString()
      : "?";

  if (
    inquiry.budget_min !== null &&
    inquiry.budget_max !== null &&
    inquiry.budget_min === inquiry.budget_max
  ) {
    return `${symbol}${minimum}`;
  }

  return `${symbol}${minimum}–${symbol}${maximum}`;
}

function formatDateRange(
  startDate: string | null,
  endDate: string | null
): string | null {
  if (!startDate && !endDate) return null;
  if (startDate && !endDate) return formatDate(startDate);
  if (!startDate && endDate) return formatDate(endDate);
  return `${formatDate(startDate!)} – ${formatDate(endDate!)}`;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(
  value: string | null
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatLabel(value: string | null): string | null {
  if (!value) return null;
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}

function buildContactHref(inquiry: InquiryRecord): string {
  if (inquiry.email) {
    return `mailto:${inquiry.email}`;
  }
  if (inquiry.phone) {
    return `tel:${inquiry.phone.replace(/\s+/g, "")}`;
  }
  return "/inquiries";
}