import {
  Anchor,
  Database,
  ShieldCheck,
  Waves,
} from "lucide-react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const params = await searchParams;
  const nextPath = normalizeNextPath(
    params.next
  );

  const supabase = await createClient();
  const { data } =
    await supabase.auth.getClaims();

  if (data?.claims?.sub) {
    redirect(nextPath);
  }

  return (
    <main className="ui-page relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-15%] top-[-20%] size-[34rem] rounded-full bg-cyan-400/[0.08] blur-3xl" />
        <div className="absolute bottom-[-30%] right-[-10%] size-[38rem] rounded-full bg-violet-400/[0.08] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--foreground)_4%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--foreground)_4%,transparent)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden flex-col justify-between border-r border-border px-12 py-10 lg:flex xl:px-16">
          <Brand />

          <div className="max-w-xl pb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/55 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-xl">
              <Waves className="size-3.5" />
              Connected charter operations
            </div>

            <h1 className="mt-7 text-balance text-6xl leading-[0.98] tracking-[0.05em] text-foreground xl:text-7xl">
              Your fleet, availability and inquiries in one calm command deck.
            </h1>

            <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">
              Sign in to access your protected company
              workspace. Your name and role personalize
              the operating system across the dashboard,
              settings and workspace navigation.
            </p>

            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              <Feature
                icon={Database}
                title="One normalized fleet"
                description="Supplier data becomes consistent operational records."
              />

              <Feature
                icon={ShieldCheck}
                title="Tenant-isolated data"
                description="Company membership is verified on every protected query."
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground/70">
            Intrigue Studios · Yacht OS
          </p>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-10 lg:hidden">
              <Brand />
            </div>

            <div className="ui-panel rounded-[2rem] p-6 backdrop-blur-xl sm:p-8">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Secure workspace access
              </p>

              <h2 className="mt-3 text-4xl leading-none tracking-[0.05em] text-foreground">
                Sign in to Yacht OS
              </h2>

              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Enter your identity, role and existing
                Supabase account details.
              </p>

              <LoginForm nextPath={nextPath} />
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-muted-foreground/75">
              Access remains limited to users with a
              matching membership in{" "}
              <code>company_members</code>.
            </p>
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
          Intrigue Yacht OS
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

function normalizeNextPath(
  value: string | string[] | undefined
) {
  const candidate = Array.isArray(value)
    ? value[0]
    : value;

  if (
    candidate &&
    candidate.startsWith("/") &&
    !candidate.startsWith("//") &&
    !candidate.startsWith("/login")
  ) {
    return candidate;
  }

  return "/";
}