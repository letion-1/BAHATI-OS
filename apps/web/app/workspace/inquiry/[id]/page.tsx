import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type InquiryWorkspacePageProps = {
  params: Promise<{
    id: string;
  }>;
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
    <main className="min-h-[calc(100vh-72px)] bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-8 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Link
                href="/inquiries"
                className="transition hover:text-foreground"
              >
                Inquiries
              </Link>

              <span>/</span>

              <span className="text-foreground/80">
                {inquiry.reference || inquiry.id}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
                {inquiry.client_name || "Unnamed inquiry"}
              </h1>

              <StatusBadge status={inquiry.status} />
            </div>

            <p className="mt-2 text-sm text-muted-foreground">
              {inquiry.client_type || "Charter inquiry"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/inquiries"
              className="rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-accent hover:text-foreground"
            >
              Back to inquiries
            </Link>

            <Link
              href="/inquiries/new"
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              New inquiry
            </Link>
          </div>
        </div>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <div className="rounded-[24px] border border-border bg-card p-6">
              <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    Charter overview
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Core details extracted from the client inquiry
                  </p>
                </div>

                {confidence !== null ? (
                  <span className="rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
                    {confidence}% AI confidence
                  </span>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <InfoCard
                  label="Destination"
                  value={inquiry.destination}
                />

                <InfoCard
                  label="Guests"
                  value={
                    inquiry.guests !== null
                      ? String(inquiry.guests)
                      : null
                  }
                />

                <InfoCard
                  label="Dates"
                  value={formatDateRange(
                    inquiry.start_date,
                    inquiry.end_date
                  )}
                />

                <InfoCard
                  label="Budget"
                  value={formatBudget(inquiry)}
                />
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-[24px] border border-border bg-card p-6">
                <SectionHeading
                  title="Client details"
                  description="Contact information for this inquiry"
                />

                <div className="mt-5 space-y-3">
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
                </div>
              </section>

              <section className="rounded-[24px] border border-border bg-card p-6">
                <SectionHeading
                  title="Inquiry details"
                  description="Source and tracking information"
                />

                <div className="mt-5 space-y-3">
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
                    value={inquiry.status}
                  />

                  <DetailRow
                    label="Created"
                    value={formatDateTime(
                      inquiry.created_at
                    )}
                  />
                </div>
              </section>
            </div>

            <section className="rounded-[24px] border border-border bg-card p-6">
              <SectionHeading
                title="Preferences"
                description="Requested yacht features and charter priorities"
              />

              {inquiry.preferences ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {splitPreferences(
                    inquiry.preferences
                  ).map((preference) => (
                    <span
                      key={preference}
                      className="rounded-full border border-border bg-accent/70 px-3 py-1.5 text-xs text-foreground/80"
                    >
                      {preference}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-5 text-sm text-muted-foreground/70">
                  No preferences were provided.
                </p>
              )}
            </section>

            <section className="rounded-[24px] border border-border bg-card p-6">
              <SectionHeading
                title="Original inquiry"
                description="The source message used to create this record"
              />

              <div className="mt-5 rounded-2xl border border-border bg-muted/40 dark:bg-[#08090b] p-5">
                <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/75">
                  {inquiry.original_inquiry ||
                    "Original inquiry text is unavailable."}
                </p>
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-[24px] border border-border bg-card p-6">
              <SectionHeading
                title="Next actions"
                description="Move this inquiry through the charter pipeline"
              />

              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  Match fleet
                </button>

                <button
                  type="button"
                  className="w-full rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm font-semibold text-foreground/80 transition hover:bg-accent hover:text-foreground"
                >
                  Build proposal
                </button>

                <button
                  type="button"
                  className="w-full rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm font-semibold text-foreground/80 transition hover:bg-accent hover:text-foreground"
                >
                  Contact client
                </button>
              </div>
            </section>

            <section className="rounded-[24px] border border-border bg-card p-6">
              <SectionHeading
                title="Inquiry health"
                description="A quick broker-readiness snapshot"
              />

              <div className="mt-5 space-y-4">
                <HealthRow
                  label="Client identified"
                  complete={Boolean(
                    inquiry.client_name
                  )}
                />

                <HealthRow
                  label="Destination confirmed"
                  complete={Boolean(
                    inquiry.destination
                  )}
                />

                <HealthRow
                  label="Dates provided"
                  complete={Boolean(
                    inquiry.start_date &&
                      inquiry.end_date
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
      </div>
    </main>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-sm font-semibold">
        {title}
      </p>

      <p className="mt-1 text-xs text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
        {label}
      </p>

      <p
        className={`mt-2 text-sm font-medium ${
          value
            ? "text-foreground"
            : "text-muted-foreground/45"
        }`}
      >
        {value || "Not provided"}
      </p>
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
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/40 px-4 py-3">
      <span className="text-xs text-muted-foreground">
        {label}
      </span>

      <span className="max-w-[65%] text-right text-sm font-medium text-foreground/85">
        {value || "Not provided"}
      </span>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string | null;
}) {
  const label = status || "new";

  return (
    <span className="rounded-full border border-emerald-500/30 bg-emerald-50 px-3 py-1 text-xs font-medium capitalize text-emerald-700 dark:border-emerald-400/15 dark:bg-emerald-400/[0.07] dark:text-emerald-200">
      {label}
    </span>
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
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
          complete
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
            : "bg-amber-50 text-amber-800 dark:bg-amber-300/10 dark:text-amber-200"
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
  if (
    value === null ||
    Number.isNaN(value)
  ) {
    return null;
  }

  const percentage =
    value <= 1 ? value * 100 : value;

  return Math.round(
    Math.min(100, Math.max(0, percentage))
  );
}

function splitPreferences(
  value: string
): string[] {
  return value
    .split(",")
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

  const currencySymbol =
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
    return `${currencySymbol}${minimum}`;
  }

  return `${currencySymbol}${minimum}–${currencySymbol}${maximum}`;
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

  return `${formatDate(startDate!)} – ${formatDate(endDate!)}`;
}

function formatDate(
  value: string
): string {
  const date = new Date(
    `${value}T00:00:00`
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  ).format(date);
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

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}