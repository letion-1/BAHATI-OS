import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Panel heading, used across every dashboard section.
 *
 * Three things here were breaking the mobile layout, and because every panel
 * routes through this component they broke on every screen at once.
 *
 * 1. The text column was a flex item with no `min-w-0`. A flex item defaults
 *    to `min-width: auto`, meaning it refuses to shrink below its content's
 *    intrinsic width. A long heading like "Source availability intelligence"
 *    therefore pushed the row wider than the viewport instead of wrapping,
 *    which is what cut the title off mid-word and pushed the status badges
 *    off the right edge.
 *
 * 2. `text-3xl` was unconditional. Thirty pixels of a wide-tracked display
 *    face is a desktop heading; on a 390px screen it is most of the width
 *    before the first line break.
 *
 * 3. `leading-none` set the line box to exactly the font size. The heading
 *    face has ascenders taller than its em box, so the tops of capitals were
 *    clipped, which is why "Source health" appeared sliced in half.
 */
export function SectionHeader({
  title,
  subtitle,
  eyebrow,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}

        {/*
          `break-words` is the backstop for a single long token, such as an
          imported source name with no spaces in it, which would otherwise
          overflow even a shrinkable column.
        */}
        <h2 className="mt-2 break-words text-2xl leading-tight tracking-[0.05em] text-foreground sm:text-3xl">
          {title}
        </h2>

        {subtitle ? (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>

      {action ? (
        <div className="flex shrink-0 items-center gap-3">
          {action}
        </div>
      ) : null}
    </div>
  );
}