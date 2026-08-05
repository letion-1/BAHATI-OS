import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatCardTone =
  | "neutral"
  | "cyan"
  | "emerald"
  | "violet"
  | "amber"
  | "rose";

type StatCardProps = {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  tone?: StatCardTone;
  className?: string;
};

const toneClasses: Record<StatCardTone, string> = {
  neutral: "text-foreground",
  cyan: "text-cyan-600 dark:text-cyan-300",
  emerald: "text-emerald-600 dark:text-emerald-300",
  violet: "text-violet-600 dark:text-violet-300",
  amber: "text-amber-700 dark:text-amber-300",
  rose: "text-rose-600 dark:text-rose-300",
};

export function StatCard({
  label,
  value,
  subtitle,
  icon,
  tone = "neutral",
  className,
}: StatCardProps) {
  return (
    <article
      className={cn(
        "ui-panel apple-transition group rounded-[24px] p-6 hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(0,0,0,0.14)]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </p>

          <p className="mt-4 font-heading text-5xl leading-none tracking-[0.045em] text-foreground">
            {value}
          </p>

          {subtitle ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>

        {icon ? (
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-2xl border border-current/15 bg-current/[0.07]",
              toneClasses[tone]
            )}
          >
            {icon}
          </div>
        ) : null}
      </div>
    </article>
  );
}