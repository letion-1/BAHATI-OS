import {
  Building2,
  Compass,
  ShieldCheck,
} from "lucide-react";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/app/onboarding/onboarding-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
} from "@/lib/workspace/get-current-workspace";
import { BrandMark } from "@/components/brand/brand-mark";

export const dynamic = "force-dynamic";

type OnboardingPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

type CompanyRow = {
  name: string;
  operating_model: string | null;
  primary_market: string | null;
  yacht_access_band: string | null;
  website_url: string | null;
  onboarding_completed_at: string | null;
};

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const params = await searchParams;

  const nextPath = normalizeNextPath(
    params.next
  );

  const workspace =
    await getCurrentWorkspace();

  const supabase =
    await createClient();

  const admin =
    createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(
        "/onboarding"
      )}`
    );
  }

  const { data, error } =
    await admin
      .from("companies")
      .select(
        [
          "name",
          "operating_model",
          "primary_market",
          "yacht_access_band",
          "website_url",
          "onboarding_completed_at",
        ].join(",")
      )
      .eq("id", workspace.companyId)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Could not load onboarding workspace: ${error.message}`
    );
  }

  const company =
    data as unknown as
      | CompanyRow
      | null;

  if (
    company?.onboarding_completed_at &&
    company.operating_model
  ) {
    redirect(nextPath);
  }

  const metadata =
    user.user_metadata ?? {};

  const fullName =
    readMetadataString(
      metadata.full_name
    ) ||
    readMetadataString(
      metadata.display_name
    );

  const roleTitle =
    readMetadataString(
      metadata.role_title
    );

  if (
    workspace.role !== "owner" &&
    workspace.role !== "admin"
  ) {
    return (
      <OnboardingBlocked
        companyName={
          company?.name ??
          workspace.companyName
        }
      />
    );
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <header className="relative overflow-hidden rounded-[30px] border border-border bg-[linear-gradient(135deg,var(--hero-start),var(--hero-middle),var(--hero-end))] p-6 shadow-sm sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute right-[-5%] top-[-35%] size-72 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                {/*
                  The hero gradient follows the colour scheme
                  (--hero-foreground is dark brown in light mode, white in
                  dark), so the mark has to swap with it. An earlier version
                  hardcoded the cream mark on the assumption the hero was
                  always dark, and it washed out in light mode.
                */}
                <div className="flex size-11 items-center justify-center rounded-2xl border border-black/10 bg-black/[0.04] dark:border-white/10 dark:bg-white/10">
                  <BrandMark size={26} priority />
                </div>

                <div>
                  <p className="ui-hero-muted text-[10px] font-semibold uppercase tracking-[0.2em]">
                    Bahari OS
                  </p>

                  <p className="mt-1 text-xs text-[var(--hero-foreground)]/75">
                    First-time workspace setup
                  </p>
                </div>
              </div>

              <h1 className="mt-8 max-w-2xl font-heading text-4xl leading-[1.05] tracking-[0.045em] text-[var(--hero-foreground)] sm:text-5xl">
                Build the cockpit around how your brokerage actually works.
              </h1>

              <p className="ui-hero-muted mt-5 max-w-2xl text-sm leading-7 sm:text-base">
                Tell Bahari OS whether you primarily broker, manage or control yachts. Individual yacht relationships remain flexible inside the workspace.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:w-[360px] lg:grid-cols-1">
              <HeroPoint
                icon={Building2}
                label="Company-aware workflows"
              />
              <HeroPoint
                icon={Compass}
                label="Flexible yacht access"
              />
              <HeroPoint
                icon={ShieldCheck}
                label="Workspace-scoped setup"
              />
            </div>
          </div>
        </header>

        <div className="mt-7">
          <OnboardingForm
            nextPath={nextPath}
            initialValues={{
              fullName,
              roleTitle,
              companyName:
                company?.name ??
                workspace.companyName,
              operatingModel:
                company?.operating_model ??
                "",
              primaryMarket:
                company?.primary_market ??
                "",
              yachtAccessBand:
                company?.yacht_access_band ??
                "",
              websiteUrl:
                company?.website_url ??
                "",
            }}
          />
        </div>

        <p className="mt-7 text-center text-xs leading-5 text-muted-foreground">
          Company defaults can be changed later in Settings. Yacht-level access and control remain editable per yacht.
        </p>
      </div>
    </main>
  );
}

function HeroPoint({
  icon: Icon,
  label,
}: {
  icon: typeof Building2;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-[var(--hero-foreground)] backdrop-blur-sm">
      <Icon className="size-4 shrink-0 opacity-80" />
      <span className="text-xs font-semibold">
        {label}
      </span>
    </div>
  );
}

function OnboardingBlocked({
  companyName,
}: {
  companyName: string;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 text-foreground">
      <div className="ui-panel max-w-lg rounded-[28px] p-7 text-center sm:p-9">
        <ShieldCheck className="mx-auto size-8 text-muted-foreground" />

        <h1 className="mt-5 font-heading text-3xl tracking-[0.045em]">
          Workspace setup pending
        </h1>

        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {companyName} has not completed its Bahari OS company setup yet. A workspace owner or admin needs to finish onboarding first.
        </p>
      </div>
    </main>
  );
}

function readMetadataString(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeNextPath(
  value: string | string[] | undefined
) {
  const candidate =
    Array.isArray(value)
      ? value[0]
      : value;

  if (
    candidate &&
    candidate.startsWith("/") &&
    !candidate.startsWith("//") &&
    !candidate.startsWith("/login") &&
    !candidate.startsWith("/onboarding")
  ) {
    return candidate;
  }

  return "/";
}