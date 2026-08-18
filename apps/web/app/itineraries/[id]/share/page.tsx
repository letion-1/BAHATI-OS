"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useParams,
} from "next/navigation";

const FALLBACK_HERO_IMAGE =
  "/proposal-yacht/hero-exterior.png";

type ShareResponse = {
  success: boolean;
  charter?: {
    id: string;
    reference: string;
    clientName: string;
    yachtName: string;
    startDate: string | null;
    endDate: string | null;
  };
  itinerary?: {
    id: string;
    title: string;
    status: string;
  } | null;
  share?: {
    id: string;
    token: string;
    isActive: boolean;
    publicPath: string;
    heroImageUrl: string;
    heroImageSource:
      | "custom"
      | "placeholder";
    fallbackHeroImage: string;
    publishedAt: string;
    expiresAt: string | null;
    viewCount: number;
    lastViewedAt: string | null;
  } | null;
  error?: string;
};

export default function ItinerarySharePage() {
  const params =
    useParams();

  const charterId =
    useMemo(() => {
      const value =
        params?.id;

      return typeof value ===
        "string"
        ? value
        : Array.isArray(value)
          ? value[0] ?? ""
          : "";
    }, [params]);

  const [
    data,
    setData,
  ] =
    useState<ShareResponse | null>(
      null
    );

  const [
    heroImageUrl,
    setHeroImageUrl,
  ] =
    useState("");

  const [
    busy,
    setBusy,
  ] =
    useState(false);

  const [
    copied,
    setCopied,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const [
    message,
    setMessage,
  ] =
    useState<string | null>(
      null
    );

  const [
    imageFailed,
    setImageFailed,
  ] =
    useState(false);

  const [
    origin,
    setOrigin,
  ] =
    useState("");

  useEffect(() => {
    setOrigin(
      window.location.origin
    );
  }, []);

  const load =
    useCallback(async () => {
      if (!charterId) {
        return;
      }

      try {
        setError(null);

        const response =
          await fetch(
            `/api/charters/${encodeURIComponent(
              charterId
            )}/itinerary/share`,
            {
              cache:
                "no-store",
            }
          );

        const result =
          (await response.json()) as ShareResponse;

        if (
          !response.ok ||
          !result.success ||
          !result.charter
        ) {
          throw new Error(
            result.error ??
              "Could not load sharing settings."
          );
        }

        setData(result);

        const currentHero =
          result.share
            ?.heroImageSource ===
          "custom"
            ? result.share.heroImageUrl
            : "";

        setHeroImageUrl(
          currentHero
        );

        setImageFailed(false);
      } catch (
        caughtError
      ) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load sharing settings."
        );
      }
    }, [charterId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(
    action: string,
    extras:
      Record<
        string,
        unknown
      > = {}
  ) {
    if (
      !charterId ||
      busy
    ) {
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setMessage(null);

      const response =
        await fetch(
          `/api/charters/${encodeURIComponent(
            charterId
          )}/itinerary/share`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                action,
                ...extras,
              }),
          }
        );

      const result =
        (await response.json()) as ShareResponse & {
          revoked?: boolean;
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not update sharing."
        );
      }

      await load();

      if (
        action === "publish"
      ) {
        setMessage(
          "Secure itinerary link published."
        );
      }

      if (
        action ===
        "update_hero"
      ) {
        setMessage(
          "Hero image updated."
        );
      }

      if (
        action === "rotate"
      ) {
        setMessage(
          "Secure link rotated. The previous link no longer works."
        );
      }

      if (
        action === "revoke"
      ) {
        setMessage(
          "Public itinerary link revoked."
        );
      }
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update sharing."
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const path =
      data?.share
        ?.publicPath;

    if (!path) {
      return;
    }

    const url =
      `${origin || window.location.origin}${path}`;

    await navigator.clipboard.writeText(
      url
    );

    setCopied(true);

    window.setTimeout(
      () =>
        setCopied(false),
      1800
    );
  }

  const charter =
    data?.charter;

  const share =
    data?.share;

  const previewHero =
    imageFailed
      ? FALLBACK_HERO_IMAGE
      : heroImageUrl.trim() ||
        share?.heroImageUrl ||
        FALLBACK_HERO_IMAGE;

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-5">
        <section className="ui-hero overflow-hidden rounded-[30px]">
          <div className="relative min-h-[360px]">
            <img
              src={
                previewHero
              }
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={() =>
                setImageFailed(
                  true
                )
              }
            />

            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/25" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/15" />

            <div className="relative z-10 flex min-h-[360px] flex-col justify-end p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
                Secure itinerary sharing
              </p>

              <h1 className="mt-4 max-w-4xl text-5xl leading-none tracking-[0.03em] text-white sm:text-6xl">
                {charter?.yachtName ??
                  "Charter itinerary"}
              </h1>

              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/75">
                {charter
                  ? `${charter.clientName} - ${charter.reference} - ${formatDateRange(
                      charter.startDate,
                      charter.endDate
                    )}`
                  : "Publish a secure client itinerary link."}
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {charter ? (
                  <>
                    <Link
                      href={`/itineraries/${encodeURIComponent(
                        charter.id
                      )}/experience`}
                      className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur"
                    >
                      Day-by-day
                    </Link>

                    <Link
                      href={`/itineraries/${encodeURIComponent(
                        charter.id
                      )}/preview`}
                      className="rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur"
                    >
                      Internal preview
                    </Link>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            {message}
          </div>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="ui-panel rounded-[28px] p-5 sm:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Hero image
            </p>

            <h2 className="mt-2 font-heading text-2xl text-foreground">
              Client presentation image
            </h2>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Paste a yacht image URL here. If the field is empty or the image fails to load, Yacht OS automatically uses the bundled yacht placeholder.
            </p>

            <label className="mt-5 block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                Hero image URL
              </span>

              <input
                type="url"
                value={
                  heroImageUrl
                }
                onChange={(
                  event
                ) => {
                  setHeroImageUrl(
                    event.target.value
                  );
                  setImageFailed(
                    false
                  );
                }}
                placeholder="https://..."
                className="ui-input mt-2 w-full px-3.5 py-3 text-sm"
              />
            </label>

            <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background/35">
              <div className="aspect-[16/9]">
                <img
                  src={
                    previewHero
                  }
                  alt="Itinerary hero preview"
                  className="h-full w-full object-cover"
                  onError={() =>
                    setImageFailed(
                      true
                    )
                  }
                />
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Current source - {heroImageUrl.trim()
                ? imageFailed
                  ? "placeholder fallback"
                  : "custom image"
                : "placeholder fallback"}
            </p>

            {share ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(
                    "update_hero",
                    {
                      heroImageUrl,
                    }
                  )
                }
                className="ui-secondary-button mt-4 min-h-11 w-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                Save hero image
              </button>
            ) : null}
          </div>

          <div className="ui-panel rounded-[28px] p-5 sm:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Public access
            </p>

            <h2 className="mt-2 font-heading text-2xl text-foreground">
              Secure client link
            </h2>

            {!data?.itinerary ? (
              <div className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-900 dark:text-amber-200">
                Create the itinerary first before publishing a secure client link.
              </div>
            ) : share ? (
              <div className="mt-5 space-y-4">
                <div className="ui-panel-soft rounded-2xl p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Status
                      active={
                        share.isActive
                      }
                    />

                    <span className="text-xs text-muted-foreground">
                      {share.viewCount} views
                    </span>
                  </div>

                  <p className="mt-4 break-all text-sm font-semibold text-foreground">
                    {origin
                      ? `${origin}${share.publicPath}`
                      : share.publicPath}
                  </p>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() =>
                        void copyLink()
                      }
                      className="ui-primary-button min-h-11 px-4 py-2.5 text-sm font-semibold"
                    >
                      {copied
                        ? "Copied"
                        : "Copy secure link"}
                    </button>

                    <Link
                      href={
                        share.publicPath
                      }
                      target="_blank"
                      className="ui-secondary-button inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold"
                    >
                      Open public itinerary
                    </Link>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Info
                    label="Published"
                    value={
                      formatDateTime(
                        share.publishedAt
                      )
                    }
                  />

                  <Info
                    label="Last viewed"
                    value={
                      formatDateTime(
                        share.lastViewedAt
                      )
                    }
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void runAction(
                        "rotate"
                      )
                    }
                    className="ui-secondary-button min-h-11 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    Rotate secure link
                  </button>

                  <button
                    type="button"
                    disabled={
                      busy ||
                      !share.isActive
                    }
                    onClick={() =>
                      void runAction(
                        "revoke"
                      )
                    }
                    className="min-h-11 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-800 disabled:opacity-40 dark:text-red-200"
                  >
                    Revoke public link
                  </button>
                </div>

                {!share.isActive ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void runAction(
                        "publish",
                        {
                          heroImageUrl,
                        }
                      )
                    }
                    className="ui-primary-button min-h-11 w-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    Republish itinerary
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="mt-5">
                <div className="ui-panel-soft rounded-2xl p-4 text-sm leading-6 text-muted-foreground">
                  Publishing creates a random secure token. The client does not need a Yacht OS login and sees only guest-visible itinerary content.
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void runAction(
                      "publish",
                      {
                        heroImageUrl,
                      }
                    )
                  }
                  className="ui-primary-button mt-4 min-h-11 w-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  {busy
                    ? "Publishing..."
                    : "Publish secure itinerary"}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Status({
  active,
}: {
  active: boolean;
}) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] ${
        active
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
          : "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-200"
      }`}
    >
      {active
        ? "Live"
        : "Revoked"}
    </span>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="ui-panel-soft rounded-xl p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function formatDateRange(
  start: string | null,
  end: string | null
) {
  return `${formatDate(
    start
  )} - ${formatDate(
    end
  )}`;
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "TBC";
  }

  const date =
    new Date(
      `${value.slice(
        0,
        10
      )}T12:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}

function formatDateTime(
  value: string | null
) {
  if (!value) {
    return "Not yet";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}