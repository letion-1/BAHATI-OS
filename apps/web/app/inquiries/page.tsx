import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  Filter,
  Mail,
  Plus,
  Search,
  Sparkles,
  Users,
} from "lucide-react";

import { HeroCard } from "@/components/ui/hero-card";
import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace/get-current-workspace";

type Inquiry = {
  id: string;
  client_name: string;
  email: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  source: string | null;
  status: string | null;
  created_at: string | null;
};

function statusClass(status: string | null) {
  if (status === "Proposal ready") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
  }

  if (status === "Matching" || status === "Matching complete") {
    return "border-blue-500/20 bg-blue-500/10 text-blue-800 dark:text-blue-200";
  }

  if (status === "Needs review") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-900 dark:text-amber-200";
  }

  return "border-border bg-accent/60 text-foreground/80";
}

function formatDateRange(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) {
    return "Dates not provided";
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const start = startDate
    ? formatter.format(new Date(`${startDate}T00:00:00`))
    : "Unknown";

  const end = endDate
    ? formatter.format(new Date(`${endDate}T00:00:00`))
    : "Unknown";

  return `${start} – ${end}`;
}

function formatBudget(
  minimum: number | null,
  maximum: number | null,
  currency: string | null
) {
  if (minimum === null && maximum === null) {
    return "Not provided";
  }

  const formatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency ?? "EUR",
    maximumFractionDigits: 0,
  });

  if (minimum !== null && maximum !== null) {
    return `${formatter.format(minimum)}–${formatter.format(maximum)}`;
  }

  if (maximum !== null) {
    return `Up to ${formatter.format(maximum)}`;
  }

  return `From ${formatter.format(minimum ?? 0)}`;
}

function formatCreatedAt(createdAt: string | null) {
  if (!createdAt) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(createdAt));
}

function formatPipelineValue(inquiries: Inquiry[]) {
  const total = inquiries.reduce(
    (sum, inquiry) => sum + (inquiry.budget_max ?? inquiry.budget_min ?? 0),
    0
  );

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(total);
}

export default async function InquiriesPage() {
  // Scope to the caller's company explicitly. RLS is the backstop, not the
  // primary control: an unscoped select here would expose every brokerage's
  // pipeline the moment a policy is missing or misconfigured.
  const workspace = await getCurrentWorkspace();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inquiries")
    .select("*")
    .eq("company_id", workspace.companyId)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <PageContainer>
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-500/25 bg-red-500/10 p-6">
          <h1 className="text-xl font-semibold text-red-300">
            Could not load inquiries
          </h1>
          <p className="mt-2 text-sm text-red-200/70">{error.message}</p>
        </div>
      </PageContainer>
    );
  }

  const inquiries = (data ?? []) as Inquiry[];

  const needsReviewCount = inquiries.filter(
    (inquiry) => inquiry.status === "Needs review"
  ).length;

  const proposalReadyCount = inquiries.filter(
    (inquiry) => inquiry.status === "Proposal ready"
  ).length;

  return (
    <PageContainer contentClassName="space-y-7">
      <>
        <HeroCard
          eyebrow="Charter pipeline"
          title="Inquiries"
          description="Review incoming charter requests, extracted requirements, yacht matches and proposal progress."
          actions={
            <Link
              href="/inquiries/new"
              className="ui-primary-button apple-transition inline-flex h-12 items-center justify-center gap-2 px-5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
            >
              <Plus className="size-4" />
              New inquiry
            </Link>
          }
        />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Open inquiries"
            value={inquiries.length}
            subtitle="Live records from Supabase"
            tone="neutral"
          />
          <StatCard
            label="Needs review"
            value={needsReviewCount}
            subtitle="Missing or uncertain requirements"
            tone="amber"
          />
          <StatCard
            label="Proposal ready"
            value={proposalReadyCount}
            subtitle="Waiting for broker approval"
            tone="emerald"
          />
          <StatCard
            label="Pipeline value"
            value={formatPipelineValue(inquiries)}
            subtitle="Based on inquiry budgets"
            tone="violet"
          />
        </section>

        <section className="ui-panel rounded-[24px] p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_auto]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

              <input
                type="search"
                placeholder="Search client, destination or email"
                className="ui-input h-12 pl-10 pr-4 text-sm"
              />
            </div>

            <Button
              variant="outline"
              className="ui-secondary-button apple-transition h-12 border-border bg-transparent px-5 hover:bg-accent"
            >
              <Filter className="size-4" />
              Filters
            </Button>
          </div>
        </section>

        <section className="space-y-5">
          <SectionHeader
            eyebrow="Inquiry pipeline"
            title="Inquiry results"
            subtitle={`${inquiries.length} charter requests`}
          />
          {inquiries.length === 0 ? (
            <Card className="ui-panel apple-transition rounded-[24px] text-card-foreground hover:-translate-y-0.5 hover:border-ring/25">
              <CardContent className="p-8 text-center">
                <p className="text-lg font-medium">No inquiries yet</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Add your first inquiry to begin the charter workflow.
                </p>
              </CardContent>
            </Card>
          ) : (
            inquiries.map((inquiry) => (
              <Card
                key={inquiry.id}
                className="ui-panel apple-transition rounded-[24px] text-card-foreground hover:-translate-y-0.5 hover:border-ring/25"
              >
                <CardContent className="p-5 sm:p-6">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="font-heading text-3xl leading-none tracking-[0.045em] text-foreground">
                          {inquiry.client_name}
                        </h2>

                        <Badge
                          className={`border ${statusClass(inquiry.status)}`}
                        >
                          {inquiry.status ?? "New"}
                        </Badge>
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="size-3.5" />
                        {inquiry.email ?? "No email provided"}
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="ui-panel-soft rounded-xl p-3">
                          <p className="text-xs text-muted-foreground">Destination</p>
                          <p className="mt-1 text-sm">
                            {inquiry.destination ?? "Not provided"}
                          </p>
                        </div>

                        <div className="ui-panel-soft rounded-xl p-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarDays className="size-3" />
                            Dates
                          </div>
                          <p className="mt-1 text-sm">
                            {formatDateRange(
                              inquiry.start_date,
                              inquiry.end_date
                            )}
                          </p>
                        </div>

                        <div className="ui-panel-soft rounded-xl p-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="size-3" />
                            Guests
                          </div>
                          <p className="mt-1 text-sm">
                            {inquiry.guests ?? "Not provided"}
                          </p>
                        </div>

                        <div className="ui-panel-soft rounded-xl p-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CircleDollarSign className="size-3" />
                            Budget
                          </div>
                          <p className="mt-1 text-sm">
                            {formatBudget(
                              inquiry.budget_min,
                              inquiry.budget_max,
                              inquiry.currency
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 xl:w-64">
                      <div className="ui-panel-soft rounded-xl p-3">
                        <p className="text-xs text-muted-foreground">Source</p>
                        <p className="mt-1 text-sm">
                          {inquiry.source ?? "Unknown"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground/75">
                          Added {formatCreatedAt(inquiry.created_at)}
                        </p>
                      </div>

                      <Link href={`/workspace/inquiry/${inquiry.id}`}>
                        <Button
                          variant="outline"
                          className="w-full border-border bg-transparent"
                        >
                          Open inquiry
                          <ArrowRight className="size-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </section>

        <section className="ui-panel rounded-[24px] p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-[16px] border border-cyan-500/20 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200">
                <Sparkles className="size-4" />
              </div>

              <div>
                <p className="font-heading text-2xl leading-none tracking-[0.045em] text-foreground">AI inquiry review</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {needsReviewCount > 0
                    ? `${needsReviewCount} ${
                        needsReviewCount === 1
                          ? "inquiry contains"
                          : "inquiries contain"
                      } missing or uncertain requirements.`
                    : "No inquiries currently require manual review."}
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              className="ui-secondary-button apple-transition h-12 border-border bg-transparent px-5 hover:bg-accent"
            >
              Review flagged inquiries
            </Button>
          </div>
        </section>
      </>
    </PageContainer>
  );
}