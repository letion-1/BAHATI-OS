import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageContainerProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function PageContainer({
  children,
  className,
  contentClassName,
}: PageContainerProps) {
  return (
    <main
      className={cn(
        "ui-page min-h-full px-5 py-7 sm:px-7 lg:px-8",
        className
      )}
    >
      <div
        className={cn(
          "mx-auto w-full max-w-[1600px]",
          contentClassName
        )}
      >
        {children}
      </div>
    </main>
  );
}