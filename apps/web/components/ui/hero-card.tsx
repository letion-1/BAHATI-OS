import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type HeroCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  icon?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function HeroCard({
  eyebrow,
  title,
  description,
  actions,
  icon,
  footer,
  className,
}: HeroCardProps) {
  return (
    <section
      className={cn(
        "ui-hero rounded-[30px] p-6 sm:p-8",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.03)_45%,transparent_72%)]" />

      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3">
            {icon ? (
              <div className="flex size-9 items-center justify-center rounded-2xl border border-current/10 bg-white/5">
                {icon}
              </div>
            ) : (
              <span className="size-2 rounded-full bg-current shadow-[0_0_18px_currentColor]" />
            )}

            <p className="ui-hero-accent text-[11px] font-semibold uppercase tracking-[0.28em]">
              {eyebrow}
            </p>
          </div>

          <h1 className="mt-5 text-balance text-5xl leading-none tracking-[0.055em] sm:text-6xl">
            {title}
          </h1>

          <p className="ui-hero-muted mt-5 max-w-2xl text-sm leading-7 sm:text-base">
            {description}
          </p>

          {footer ? (
            <div className="ui-hero-muted mt-6 text-xs">
              {footer}
            </div>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}