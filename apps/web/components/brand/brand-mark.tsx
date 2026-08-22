import Image from "next/image";

/**
 * Bahari OS brand mark.
 *
 * Two source files, swapped by colour scheme:
 *
 *   light mode  bahari-mark-navy.png   navy B, reads on the cream background
 *   dark mode   bahari-mark-cream.png  cream B, reads on the navy background
 *
 * The swap is done with CSS visibility (`dark:hidden` / `hidden dark:block`)
 * rather than JavaScript. Choosing the source in JS would mean the component
 * renders with no mark on the server, then corrects on hydration, producing a
 * visible flash on every page load. Both images are in the markup and the
 * browser shows the right one before first paint.
 *
 * Both files are also preloaded when `priority` is set, which is a small cost
 * (the marks are a few KB) in exchange for no pop-in on the sidebar or the
 * sign-in screen.
 */

const NAVY_MARK = "/brand/bahari-mark-navy.png";
const CREAM_MARK = "/brand/bahari-mark-cream.png";

export function BrandMark({
  size = 32,
  className = "",
  priority = false,
}: {
  /** Rendered size in pixels. The source art is square. */
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  const shared = `object-contain ${className}`;

  return (
    <>
      <Image
        src={NAVY_MARK}
        alt=""
        width={size}
        height={size}
        priority={priority}
        aria-hidden
        className={`${shared} dark:hidden`}
        style={{ width: size, height: size }}
      />

      <Image
        src={CREAM_MARK}
        alt=""
        width={size}
        height={size}
        priority={priority}
        aria-hidden
        className={`${shared} hidden dark:block`}
        style={{ width: size, height: size }}
      />
    </>
  );
}

/**
 * The mark inside its circular plate, as used in the sidebar.
 *
 * Kept separate from BrandMark so the plain mark can be used on surfaces that
 * do not want the plate, such as the sign-in card and onboarding.
 */
export function BrandMarkPlate({
  size = 32,
  priority = false,
}: {
  size?: number;
  priority?: boolean;
}) {
  return (
    <div
      className="
        flex size-11 shrink-0 items-center justify-center
        rounded-full
        border border-sidebar-border/90
        bg-background/65
        shadow-sm
        ring-1 ring-black/[0.025]
        backdrop-blur-xl
        dark:border-white/10
        dark:bg-white/[0.04]
        dark:ring-white/[0.035]
      "
    >
      <BrandMark
        size={size}
        priority={priority}
        className="
          drop-shadow-[0_1px_1px_rgba(0,0,0,0.10)]
          dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.34)]
        "
      />
    </div>
  );
}

/**
 * Mark plus wordmark, for sign-in, sign-up and onboarding.
 */
export function BrandLockup({
  size = 40,
  subtitle,
}: {
  size?: number;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={size} priority />

      <div className="min-w-0">
        <p className="font-heading text-2xl leading-none tracking-[0.08em] text-foreground">
          Bahari OS
        </p>

        {subtitle ? (
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}