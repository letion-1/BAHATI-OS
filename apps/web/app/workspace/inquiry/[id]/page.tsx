import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  FileText,
  Mail,
  MapPin,
  Phone,
  Plus,
  Send,
  Ship,
  Sparkles,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";

import { HeroCard } from "@/components/ui/hero-card";
import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";
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

type ReadinessItem = {
  label: string;
  complete: boolean;
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

  const readinessItems: ReadinessItem[] = [
    {
      label: "Client identified",
      complete: Boolean(inquiry.client_name),
    },
    {
      label: "Destination confirmed",
      complete: Boolean(inquiry.destination),
    },
    {
      label: "Dates provided",
      complete: Boolean(
        inquiry.start_date && inquiry.end_date
      ),
    },
    {
      label: "Budget provided",
      complete:
        inquiry.budget_min !== null ||
        inquiry.budget_max !== null,
    },
    {
      label: "Contact available",
      complete: Boolean(
        inquiry.email || inquiry.phone
      ),
    },
  ];

  const readinessScore = Math.round(
    (readinessItems.filter((item) => item.complete).length /
      readinessItems.length) *
      100
  );

  const preferences = inquiry.preferences
    ? splitPreferences(inquiry.preferences)
    : [];

  const destinationSummary = summarizeDestination(
    inquiry.destination
  );

  const compactCharterDates = formatCompactDateRange(
    inquiry.start_date,
    inquiry.end_date
  );

  const compactBudget = formatCompactBudget(inquiry);

  return (
    <PageContainer contentClassName="space-y-7">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Link
          href="/inquiries"
          className="apple-transition inline-flex items-center gap-1.5 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
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
        description={buildHeroDescription(
          inquiry.client_type
        )}
        actions={
          <div className="flex flex-wrap gap-3">
            <Link
              href="/inquiries"
              className="ui-secondary-button apple-transition inline-flex min-h-12 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:bg-accent"
            >
              <ArrowLeft className="size-4" />
              Back to inquiries
            </Link>

            <Link
              href="/inquiries/new"
              className="ui-primary-button apple-transition inline-flex min-h-12 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
            >
              <Plus className="size-4" />
              New inquiry
            </Link>
          </div>
        }
      />

      <section className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <InquiryStatCard
          label="Destination"
          value={destinationSummary.primary}
          subtitle={destinationSummary.secondary}
          tone="cyan"
          icon={<MapPin className="size-4" />}
        />

        <InquiryStatCard
          label="Guests"
          value={
            inquiry.guests !== null
              ? String(inquiry.guests)
              : "Not set"
          }
          subtitle="Confirmed party size"
          tone="emerald"
          icon={<Users className="size-4" />}
        />

        <InquiryStatCard
          label="Charter dates"
          value={compactCharterDates || "Not set"}
          subtitle="Requested charter window"
          tone="violet"
          icon={<CalendarDays className="size-4" />}
        />

        <InquiryStatCard
          label="Budget"
          value={compactBudget || "Not set"}
          subtitle="Expected charter range"
          tone="amber"
          icon={<WalletCards className="size-4" />}
        />

        <InquiryStatCard
          label="Readiness"
          value={`${readinessScore}%`}
          subtitle={
            confidence !== null
              ? `${confidence}% extraction confidence`
              : "Broker review status"
          }
          tone="neutral"
          icon={<CheckCircle2 className="size-4" />}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-7">
          <section className="ui-panel apple-transition overflow-hidden rounded-[26px] hover:border-ring/20">
            <div className="relative overflow-hidden border-b border-border bg-[linear-gradient(135deg,var(--hero-start),var(--hero-middle),var(--hero-end))] px-5 py-6 sm:px-6">
              <div className="absolute right-8 top-1/2 size-28 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-3xl" />

              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="ui-hero-muted text-[11px] font-semibold uppercase tracking-[0.22em]">
                    Client dossier
                  </p>

                  <h2 className="mt-2 font-heading text-3xl leading-none tracking-[0.05em] text-[var(--hero-foreground)]">
                    Contact and inquiry details
                  </h2>

                  <p className="ui-hero-muted mt-3 max-w-2xl text-sm leading-6">
                    Everything captured from the original request, organized for fast broker review.
                  </p>
                </div>

                <StatusBadge status={inquiry.status} />
              </div>
            </div>

            <div className="grid lg:grid-cols-2">
              <InfoColumn
                title="Client details"
                icon={<UserRound className="size-4" />}
              >
                <InfoRow
                  label="Name"
                  value={inquiry.client_name}
                  icon={<UserRound className="size-4" />}
                />

                <InfoRow
                  label="Email"
                  value={inquiry.email}
                  icon={<Mail className="size-4" />}
                />

                <InfoRow
                  label="Phone"
                  value={inquiry.phone}
                  icon={<Phone className="size-4" />}
                />

                <InfoRow
                  label="Client type"
                  value={inquiry.client_type}
                  icon={<Users className="size-4" />}
                />
              </InfoColumn>

              <InfoColumn
                title="Inquiry details"
                icon={<Ship className="size-4" />}
                className="border-t border-border lg:border-l lg:border-t-0"
              >
                <InfoRow
                  label="Reference"
                  value={inquiry.reference}
                  icon={<FileText className="size-4" />}
                />

                <InfoRow
                  label="Source"
                  value={inquiry.source}
                  icon={<Sparkles className="size-4" />}
                />

                <InfoRow
                  label="Status"
                  value={formatLabel(inquiry.status)}
                  icon={<CheckCircle2 className="size-4" />}
                />

                <InfoRow
                  label="Created"
                  value={formatDateTime(inquiry.created_at)}
                  icon={<CalendarDays className="size-4" />}
                />
              </InfoColumn>
            </div>
          </section>

          <section>
            <SectionHeader
              eyebrow="Charter brief"
              title="Preferences"
              subtitle="Requested yacht features, destinations and service priorities"
              className="mb-5"
            />

            <div className="ui-panel rounded-[26px] p-5 sm:p-6">
              {preferences.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {preferences.map((preference) => (
                    <div
                      key={preference}
                      className="ui-panel-soft apple-transition flex min-h-20 items-center gap-3 rounded-2xl px-4 py-4 hover:-translate-y-0.5 hover:border-ring/20"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background/55 text-cyan-700 dark:text-cyan-300">
                        <Sparkles className="size-4" />
                      </div>

                      <p className="text-sm font-semibold leading-5 text-foreground">
                        {preference}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel
                  icon={<Sparkles className="size-6" />}
                  title="No preferences provided"
                  description="The original request did not include specific yacht features or service priorities."
                />
              )}
            </div>
          </section>

          <section>
            <SectionHeader
              eyebrow="Source message"
              title="Original inquiry"
              subtitle="The exact message used to create this record"
              className="mb-5"
            />

            <div className="ui-panel overflow-hidden rounded-[26px]">
              <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
                <div className="flex size-10 items-center justify-center rounded-2xl border border-border bg-background/55 text-muted-foreground">
                  <FileText className="size-4" />
                </div>

                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Inquiry transcript
                  </p>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Preserved exactly as received
                  </p>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                <div className="ui-panel-soft rounded-[22px] p-5 sm:p-6">
                  <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/80">
                    {inquiry.original_inquiry ||
                      "Original inquiry text is unavailable."}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="ui-panel apple-transition rounded-[26px] p-5 sm:p-6 hover:border-ring/20">
            <SectionHeader
              eyebrow="Pipeline"
              title="Next actions"
              subtitle="Move this inquiry through the charter workflow"
              className="mb-5"
            />

            <div className="space-y-3">
              <Link
                href={`/availability?inquiry=${inquiry.id}`}
                className="ui-primary-button apple-transition flex min-h-12 w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
              >
                <Ship className="size-4" />
                Match fleet
              </Link>

              <Link
                href="/proposals/new"
                className="ui-secondary-button apple-transition flex min-h-12 w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:bg-accent"
              >
                <FileText className="size-4" />
                Build proposal
              </Link>

              <a
                href={buildContactHref(inquiry)}
                className="ui-secondary-button apple-transition flex min-h-12 w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:bg-accent"
              >
                <Send className="size-4" />
                Contact client
              </a>
            </div>
          </section>

          <section className="ui-panel apple-transition rounded-[26px] p-5 sm:p-6 hover:border-ring/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Inquiry health
                </p>

                <h2 className="mt-2 font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
                  Broker readiness
                </h2>
              </div>

              <div className="flex size-14 shrink-0 items-center justify-center rounded-[18px] border border-border bg-background/55">
                <span className="text-sm font-bold text-foreground">
                  {readinessScore}%
                </span>
              </div>
            </div>

            <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${readinessScore}%` }}
              />
            </div>

            <div className="mt-6 space-y-4">
              {readinessItems.map((item) => (
                <HealthRow
                  key={item.label}
                  label={item.label}
                  complete={item.complete}
                />
              ))}
            </div>

            {confidence !== null ? (
              <div className="mt-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.08] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-800/70 dark:text-cyan-200/70">
                      AI extraction
                    </p>

                    <p className="mt-1 text-sm font-semibold text-cyan-900 dark:text-cyan-100">
                      {confidence}% confidence
                    </p>
                  </div>

                  <Sparkles className="size-5 text-cyan-700 dark:text-cyan-300" />
                </div>
              </div>
            ) : null}
          </section>

          <section className="ui-panel apple-transition overflow-hidden rounded-[26px] hover:border-ring/20">
            <div className="border-b border-border px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Charter summary
              </p>

              <h3 className="mt-2 text-base font-semibold tracking-[-0.02em] text-foreground">
                Request at a glance
              </h3>
            </div>

            <div className="divide-y divide-border">
              <SummaryRow
                icon={<MapPin className="size-4" />}
                label="Destination"
                value={inquiry.destination || "Not provided"}
              />

              <SummaryRow
                icon={<CalendarDays className="size-4" />}
                label="Dates"
                value={
                  formatDateRange(
                    inquiry.start_date,
                    inquiry.end_date
                  ) || "Not provided"
                }
              />

              <SummaryRow
                icon={<Users className="size-4" />}
                label="Guests"
                value={
                  inquiry.guests !== null
                    ? String(inquiry.guests)
                    : "Not provided"
                }
              />

              <SummaryRow
                icon={<WalletCards className="size-4" />}
                label="Budget"
                value={
                  formatBudget(inquiry) || "Not provided"
                }
              />
            </div>
          </section>
        </aside>
      </section>
    </PageContainer>
  );
}

type InquiryStatTone =
  | "cyan"
  | "emerald"
  | "violet"
  | "amber"
  | "neutral";

function InquiryStatCard({
  label,
  value,
  subtitle,
  tone,
  icon,
}: {
  label: string;
  value: string;
  subtitle: string;
  tone: InquiryStatTone;
  icon: ReactNode;
}) {
  const toneStyles: Record<
    InquiryStatTone,
    {
      icon: string;
      glow: string;
    }
  > = {
    cyan: {
      icon:
        "border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
      glow: "bg-cyan-400/10",
    },
    emerald: {
      icon:
        "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      glow: "bg-emerald-400/10",
    },
    violet: {
      icon:
        "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
      glow: "bg-violet-400/10",
    },
    amber: {
      icon:
        "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300",
      glow: "bg-amber-400/10",
    },
    neutral: {
      icon:
        "border-border bg-background/55 text-muted-foreground",
      glow: "bg-foreground/[0.04]",
    },
  };

  const styles = toneStyles[tone];

  return (
    <article className="ui-panel apple-transition relative min-h-[190px] min-w-0 overflow-hidden rounded-[24px] p-5 hover:-translate-y-0.5 hover:border-ring/20 sm:p-6">
      <div
        className={`pointer-events-none absolute -right-8 -top-10 size-28 rounded-full blur-3xl ${styles.glow}`}
      />

      <div className="relative flex h-full min-w-0 flex-col">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>

          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${styles.icon}`}
          >
            {icon}
          </div>
        </div>

        <p className="mt-5 min-w-0 break-words font-heading text-[clamp(1.75rem,2.2vw,2.65rem)] leading-[0.98] tracking-[0.035em] text-foreground [overflow-wrap:anywhere]">
          {value}
        </p>

        <p className="mt-auto min-w-0 break-words pt-5 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
          {subtitle}
        </p>
      </div>
    </article>
  );
}

function InfoColumn({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`p-5 sm:p-6 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl border border-border bg-background/55 text-muted-foreground">
          {icon}
        </div>

        <h3 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </h3>
      </div>

      <div className="mt-5 space-y-1">
        {children}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | null;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl px-3 py-3 transition hover:bg-accent/55">
      <div className="mt-0.5 text-muted-foreground">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/75">
          {label}
        </p>

        <p className="mt-1 break-words text-sm font-semibold text-foreground">
          {value || "Not provided"}
        </p>
      </div>
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
        className={`flex size-8 items-center justify-center rounded-full border ${
          complete
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300"
        }`}
      >
        {complete ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <CircleAlert className="size-4" />
        )}
      </span>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 px-5 py-4">
      <div className="mt-0.5 text-muted-foreground">
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/75">
          {label}
        </p>

        <p className="mt-1 break-words text-sm font-semibold text-foreground">
          {value}
        </p>
      </div>
    </div>
  );
}

function EmptyPanel({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-[22px] border border-dashed border-border bg-background/25 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-[20px] bg-accent text-accent-foreground">
        {icon}
      </div>

      <h3 className="mt-5 font-heading text-2xl leading-none tracking-[0.05em] text-foreground">
        {title}
      </h3>

      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string | null;
}) {
  const normalized = status?.toLowerCase() ?? "new";

  const styles: Record<string, string> = {
    new: "border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200",
    open: "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    qualified:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    matching:
      "border-violet-500/25 bg-violet-500/10 text-violet-800 dark:text-violet-200",
    proposal:
      "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200",
    closed:
      "border-border bg-muted text-muted-foreground",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur-xl ${
        styles[normalized] ?? styles.new
      }`}
    >
      {formatLabel(status) || "New inquiry"}
    </span>
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

function buildHeroDescription(
  clientType: string | null
): string {
  const normalized = clientType
    ?.trim()
    .replace(/[.!?]+$/, "");

  if (!normalized) {
    return "Review the extracted charter brief, confirm missing details and move the request into matching.";
  }

  return `${normalized} request ready for review, fleet matching and proposal preparation.`;
}

function summarizeDestination(
  value: string | null
): {
  primary: string;
  secondary: string;
} {
  const normalized = value?.trim();

  if (!normalized) {
    return {
      primary: "Not set",
      secondary: "Preferred cruising area",
    };
  }

  const parenthetical = normalized.match(
    /^(.+?)\s*\((.+)\)\s*$/
  );

  if (parenthetical) {
    return {
      primary: parenthetical[1].trim(),
      secondary: sentenceCase(
        parenthetical[2].trim()
      ),
    };
  }

  const separator = normalized.match(
    /^(.+?)\s+(?:with|and)\s+(.+)$/
  );

  if (
    separator &&
    separator[1].trim().length <= 24
  ) {
    return {
      primary: separator[1].trim(),
      secondary: sentenceCase(
        separator[2].trim()
      ),
    };
  }

  return {
    primary: normalized,
    secondary: "Preferred cruising area",
  };
}

function sentenceCase(value: string): string {
  if (!value) {
    return value;
  }

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

function formatCompactBudget(inquiry: {
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
      ? formatCompactAmount(
          inquiry.budget_min
        )
      : "?";

  const maximum =
    inquiry.budget_max !== null
      ? formatCompactAmount(
          inquiry.budget_max
        )
      : "?";

  if (
    inquiry.budget_min !== null &&
    inquiry.budget_max !== null &&
    inquiry.budget_min === inquiry.budget_max
  ) {
    return `${symbol}${minimum}`;
  }

  return `${symbol}${minimum}–${maximum}`;
}

function formatCompactAmount(
  amount: number
): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `${trimCompactDecimal(
      amount / 1_000_000
    )}M`;
  }

  if (Math.abs(amount) >= 1_000) {
    return `${trimCompactDecimal(
      amount / 1_000
    )}K`;
  }

  return amount.toLocaleString("en-GB");
}

function trimCompactDecimal(
  value: number
): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, "");
}

function formatCompactDateRange(
  startDate: string | null,
  endDate: string | null
): string | null {
  if (!startDate && !endDate) {
    return null;
  }

  if (startDate && !endDate) {
    return formatCompactDate(startDate);
  }

  if (!startDate && endDate) {
    return formatCompactDate(endDate);
  }

  const start = parseStoredDate(startDate!);
  const end = parseStoredDate(endDate!);

  if (!start || !end) {
    return `${startDate}–${endDate}`;
  }

  const startDay = start.getDate();
  const endDay = end.getDate();

  const startMonth = start.toLocaleDateString(
    "en-GB",
    { month: "short" }
  );

  const endMonth = end.toLocaleDateString(
    "en-GB",
    { month: "short" }
  );

  const startYear = start.getFullYear();
  const endYear = end.getFullYear();

  if (
    startYear === endYear &&
    start.getMonth() === end.getMonth()
  ) {
    if (startDay === endDay) {
      return `${startDay} ${startMonth} ${startYear}`;
    }

    return `${startDay}–${endDay} ${startMonth} ${startYear}`;
  }

  if (startYear === endYear) {
    return `${startDay} ${startMonth}–${endDay} ${endMonth} ${startYear}`;
  }

  return `${startDay} ${startMonth} ${startYear}–${endDay} ${endMonth} ${endYear}`;
}

function formatCompactDate(
  value: string
): string {
  const date = parseStoredDate(value);

  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  ).format(date);
}

function parseStoredDate(
  value: string
): Date | null {
  const date = new Date(
    `${value}T00:00:00`
  );

  return Number.isNaN(date.getTime())
    ? null
    : date;
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
  if (!startDate && !endDate) {
    return null;
  }

  if (startDate && !endDate) {
    return formatDate(startDate);
  }

  if (!startDate && endDate) {
    return formatDate(endDate);
  }

  return `${formatDate(startDate!)} – ${formatDate(
    endDate!
  )}`;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(
  value: string | null
): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatLabel(
  value: string | null
): string | null {
  if (!value) {
    return null;
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}

function buildContactHref(
  inquiry: InquiryRecord
): string {
  if (inquiry.email) {
    return `mailto:${inquiry.email}`;
  }

  if (inquiry.phone) {
    return `tel:${inquiry.phone.replace(/\s+/g, "")}`;
  }

  return "/inquiries";
}