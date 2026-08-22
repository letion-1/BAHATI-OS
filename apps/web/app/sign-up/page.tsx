import {
  Anchor,
  Building2,
  Database,
  ShieldCheck,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/app/sign-up/sign-up-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SignUpPageProps = {
  searchParams: Promise<{
    authError?: string | string[];
  }>;
};

export default async function SignUpPage({
  searchParams,
}: SignUpPageProps) {
  const params = await searchParams;

  const authError =
    readQueryValue(
      params.authError
    );

  const supabase =
    await createClient();

  const { data } =
    await supabase.auth.getClaims();

  if (data?.claims?.sub) {
    redirect("/");
  }

  return (
    <main className="ui-page relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-15%] top-[-20%] size-[34rem] rounded-full bg-cyan-400/[0.08] blur-3xl" />
        <div className="absolute bottom-[-30%] right-[-10%] size-[38rem] rounded-full bg-violet-400/[0.08] blur-3xl" />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden flex-col justify-between border-r border-border px-12 py-10 lg:flex xl:px-16">
          <Brand />

          <div className="max-w-xl pb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/55 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-xl">
              <Waves className="size-3.5" />
              Start a protected charter workspace
            </div>

            <h1 className="mt-7 text-balance text-6xl leading-[0.98] tracking-[0.05em] text-foreground xl:text-7xl">
              Create the operating layer for your charter business.
            </h1>

            <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">
              Verify your work email, create your company workspace and configure Bahari OS around the way your brokerage actually operates.
            </p>

            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              <Feature
                icon={Building2}
                title="Your own company workspace"
                description="A verified signup provisions a new isolated Bahari OS company."
              />

              <Feature
                icon={ShieldCheck}
                title="Owner from day one"
                description="The signup account becomes the workspace owner automatically."
              />

              <Feature
                icon={Database}
                title="Tenant-isolated data"
                description="Yachts, inquiries and communications remain scoped to the company."
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground/70">
            Intrigue Studios · Bahari OS
          </p>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-10 lg:hidden">
              <Brand />
            </div>

            <div className="ui-panel rounded-[2rem] p-6 backdrop-blur-xl sm:p-8">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                New company workspace
              </p>

              <h2 className="mt-3 text-4xl leading-none tracking-[0.05em] text-foreground">
                Create Bahari OS account
              </h2>

              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Start with your company name, work email and a secure password. We will verify the email before provisioning the workspace.
              </p>

              {authError ? (
                <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
                  {authError}
                </div>
              ) : null}

              <SignUpForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
        <Anchor className="size-5" />
      </div>

      <div>
        <p className="font-heading text-2xl leading-none tracking-[0.08em] text-foreground">
          Bahari OS
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          Charter intelligence workspace
        </p>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Database;
  title: string;
  description: string;
}) {
  return (
    <div className="ui-panel-soft rounded-2xl p-4">
      <Icon className="size-4 text-foreground/75" />

      <p className="mt-4 text-sm font-medium text-foreground">
        {title}
      </p>

      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function readQueryValue(
  value: string | string[] | undefined
) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}