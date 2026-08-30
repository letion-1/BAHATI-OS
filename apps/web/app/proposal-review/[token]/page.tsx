"use client";

import {
  Check,
  ChevronDown,
  Ship,
  Sparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";
import { getYachtPlaceholderMedia } from "@/lib/yachts/placeholder-media";

type ProposalYacht = {
  proposalYachtId: string;
  fleetId: string | null;
  position: number;
  name: string;
  weeklyRate: number | null;
  estimatedTotal: number | null;
  currency: string;
  availabilityStatus: string | null;
  verificationStatus: string | null;
  accessType: string | null;
  bookingModel: string | null;
  availabilityLabel: string;
  selectable: boolean;
  imageUrl: string | null;
  galleryImages: string[];
  yachtType: string | null;
  builder: string | null;
  model: string | null;
  buildYear: number | null;
  lengthMeters: number | null;
  guestCapacity: number | null;
  sleepingGuests: number | null;
  cabinCount: number | null;
  homePort: string | null;
  cruisingRegions: string[];
};

type ProposalSelection = {
  proposalYachtId: string;
  yachtName: string;
  selectedAt: string;
};

type PublicProposalResponse = {
  success: boolean;
  proposal?: {
    id: string;
    reference: string;
    clientName: string;
    charter: {
      startDate: string | null;
      endDate: string | null;
      guests: number | null;
      destination: string | null;
    };
    createdAt: string | null;
    yachts: ProposalYacht[];
    selection: ProposalSelection | null;
  };
  error?: string;
};

type SelectionResponse = {
  success: boolean;
  changed?: boolean;
  selection?: ProposalSelection;
  error?: string;
};

export default function PublicProposalReviewPage() {
  useFixedClientProposalTheme();

  const params =
    useParams<{
      token: string;
    }>();

  const token =
    params.token;

  const [data, setData] =
    useState<PublicProposalResponse["proposal"] | null>(
      null
    );

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(
      null
    );

  const [pendingYacht, setPendingYacht] =
    useState<ProposalYacht | null>(
      null
    );

  const [isSelecting, setIsSelecting] =
    useState(false);

  const [selectionError, setSelectionError] =
    useState<string | null>(
      null
    );

  const [expandedYachtId, setExpandedYachtId] =
    useState<string | null>(
      null
    );

  const loadProposal =
    useCallback(async () => {
      if (!token) {
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const response =
          await fetch(
            `/api/public/proposals/${encodeURIComponent(
              token
            )}`,
            {
              method: "GET",
              cache: "no-store",
            }
          );

        const result =
          (await response.json()) as PublicProposalResponse;

        if (
          !response.ok ||
          !result.success ||
          !result.proposal
        ) {
          throw new Error(
            result.error ??
              "This proposal could not be loaded."
          );
        }

        setData(
          result.proposal
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "This proposal could not be loaded."
        );
      } finally {
        setIsLoading(false);
      }
    }, [token]);

  useEffect(() => {
    void loadProposal();
  }, [loadProposal]);

  const selectedYacht =
    useMemo(() => {
      if (
        !data?.selection
      ) {
        return null;
      }

      return (
        data.yachts.find(
          (yacht) =>
            yacht.proposalYachtId ===
            data.selection
              ?.proposalYachtId
        ) ?? null
      );
    }, [data]);

  async function confirmSelection() {
    if (
      !pendingYacht ||
      !token
    ) {
      return;
    }

    try {
      setIsSelecting(true);
      setSelectionError(
        null
      );

      const response =
        await fetch(
          `/api/public/proposals/${encodeURIComponent(
            token
          )}/select`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              proposalYachtId:
                pendingYacht.proposalYachtId,
            }),
          }
        );

      const result =
        (await response.json()) as SelectionResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.selection
      ) {
        throw new Error(
          result.error ??
            "Your yacht preference could not be saved."
        );
      }

      setData(
        (current) =>
          current
            ? {
                ...current,
                selection:
                  result.selection ??
                  null,
              }
            : current
      );

      setPendingYacht(
        null
      );
    } catch (selectError) {
      setSelectionError(
        selectError instanceof Error
          ? selectError.message
          : "Your yacht preference could not be saved."
      );
    } finally {
      setIsSelecting(
        false
      );
    }
  }

  if (isLoading) {
    return (
      <ProposalLoading />
    );
  }

  if (
    error ||
    !data
  ) {
    return (
      <ProposalUnavailable
        message={
          error ??
          "This proposal is unavailable."
        }
      />
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl border border-border bg-background">
              <Ship className="size-4 text-cyan-700 dark:text-cyan-300" />
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Private Charter Selection
              </p>
              <p className="mt-0.5 text-sm font-semibold">
                {data.reference}
              </p>
            </div>
          </div>

          <span className="hidden rounded-full border border-border bg-background/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:inline-flex">
            Private link
          </span>
        </div>
      </div>

      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/4 size-80 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">
            Prepared for {data.clientName}
          </p>

          <h1 className="mt-5 max-w-4xl text-balance text-5xl font-medium leading-[0.96] tracking-[-0.04em] sm:text-7xl">
            Your private charter selection.
          </h1>

          <p className="mt-6 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            Review the yacht options prepared for your charter and select the one you would like your broker to proceed with.
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            <MetaPill
              label="Dates"
              value={formatDateRange(
                data.charter.startDate,
                data.charter.endDate
              )}
            />

            <MetaPill
              label="Destination"
              value={
                data.charter.destination ??
                "To be confirmed"
              }
            />

            <MetaPill
              label="Guests"
              value={
                data.charter.guests !==
                null
                  ? String(
                      data.charter.guests
                    )
                  : "To be confirmed"
              }
            />
          </div>
        </div>
      </section>

      {selectedYacht ? (
        <section className="border-b border-emerald-500/20 bg-emerald-500/[0.06]">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="size-4" />
              </div>

              <div>
                <p className="text-sm font-semibold">
                  Your preferred yacht is {selectedYacht.name}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Your broker has received your selection and can now proceed with final availability and approval.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setPendingYacht(
                  selectedYacht
                )
              }
              className="text-left text-xs font-semibold text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300 sm:text-right"
            >
              Confirm again
            </button>
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Curated shortlist
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
              {data.yachts.length} yacht
              {data.yachts.length === 1
                ? ""
                : "s"}{" "}
              selected for you
            </h2>
          </div>

          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            Selecting a yacht records your preference. It does not constitute a booking or final confirmation.
          </p>
        </div>

        <div className="grid gap-6 [&>*]:min-w-0">
          {data.yachts.map(
            (yacht) => {
              const selected =
                data.selection
                  ?.proposalYachtId ===
                yacht.proposalYachtId;

              const expanded =
                expandedYachtId ===
                yacht.proposalYachtId;

              const placeholderMedia =
                getYachtPlaceholderMedia(
                  yacht.fleetId ??
                    yacht.proposalYachtId
                );

              const displayHero =
                yacht.imageUrl ??
                yacht.galleryImages[0] ??
                placeholderMedia.hero;

              const displayGallery =
                yacht.galleryImages.length > 0
                  ? yacht.galleryImages
                  : placeholderMedia.gallery;

              return (
                <article
                  key={
                    yacht.proposalYachtId
                  }
                  className={`overflow-hidden rounded-[28px] border bg-card shadow-sm transition ${
                    selected
                      ? "border-emerald-500/35 ring-4 ring-emerald-500/[0.06]"
                      : "border-border"
                  }`}
                >
                  <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
                    <div className="relative min-h-[300px] overflow-hidden bg-muted sm:min-h-[400px] lg:min-h-[520px]">
                      <img
                        src={displayHero}
                        alt={yacht.name}
                        className="absolute inset-0 size-full object-cover"
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />

                      <div className="absolute left-5 top-5 flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-md">
                          Option{" "}
                          {
                            yacht.position
                          }
                        </span>

                        {selected ? (
                          <span className="rounded-full bg-emerald-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
                            Your selection
                          </span>
                        ) : null}
                      </div>

                      <div className="absolute bottom-5 left-5 right-5 text-white">
                        <p className="text-xs font-medium text-white/70">
                          {[
                            yacht.builder,
                            yacht.buildYear,
                          ]
                            .filter(
                              Boolean
                            )
                            .join(
                              " · "
                            ) ||
                            yacht.yachtType ||
                            "Private yacht"}
                        </p>

                        <h3 className="mt-2 text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">
                          {
                            yacht.name
                          }
                        </h3>
                      </div>
                    </div>

                    <div className="flex flex-col p-6 sm:p-8 lg:p-10">
                      <div className="flex flex-wrap items-start justify-between gap-5">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Charter rate
                          </p>

                          <p className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
                            {formatRate(
                              yacht.weeklyRate,
                              yacht.currency
                            )}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            per week
                          </p>
                        </div>

                        <AvailabilityBadge
                          label={
                            yacht.availabilityLabel
                          }
                        />
                      </div>

                      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                        <Spec
                          label="Length"
                          value={
                            yacht.lengthMeters !==
                            null
                              ? `${formatNumber(
                                  yacht.lengthMeters
                                )} m`
                              : "—"
                          }
                        />
                        <Spec
                          label="Guests"
                          value={
                            yacht.sleepingGuests ??
                            yacht.guestCapacity ??
                            "—"
                          }
                        />
                        <Spec
                          label="Cabins"
                          value={
                            yacht.cabinCount ??
                            "—"
                          }
                        />
                        <Spec
                          label="Built"
                          value={
                            yacht.buildYear ??
                            "—"
                          }
                        />
                      </div>

                      <div className="mt-7 space-y-3">
                        {yacht.homePort ? (
                          <InfoLine
                            label="Home port"
                            value={
                              yacht.homePort
                            }
                          />
                        ) : null}

                        {yacht.cruisingRegions.length >
                        0 ? (
                          <InfoLine
                            label="Cruising"
                            value={yacht.cruisingRegions.join(
                              ", "
                            )}
                          />
                        ) : null}

                        {yacht.model ? (
                          <InfoLine
                            label="Model"
                            value={
                              yacht.model
                            }
                          />
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedYachtId(
                            expanded
                              ? null
                              : yacht.proposalYachtId
                          )
                        }
                        className="mt-6 flex items-center justify-between border-y border-border py-4 text-left text-sm font-semibold"
                      >
                        More details
                        <ChevronDown
                          className={`size-4 transition ${
                            expanded
                              ? "rotate-180"
                              : ""
                          }`}
                        />
                      </button>

                      {expanded ? (
                        <div className="border-b border-border py-5 text-sm leading-6 text-muted-foreground">
                          <p>
                            {buildYachtSummary(
                              yacht
                            )}
                          </p>

                          <div className="mt-5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground">
                              Gallery
                            </p>

                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {displayGallery
                                .slice(0, 6)
                                .map(
                                  (
                                    imageUrl,
                                    imageIndex
                                  ) => (
                                    <div
                                      key={`${imageUrl}-${imageIndex}`}
                                      className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted"
                                    >
                                      <img
                                        src={imageUrl}
                                        alt={`${yacht.name} view ${imageIndex + 1}`}
                                        className="absolute inset-0 size-full object-cover"
                                      />
                                    </div>
                                  )
                                )}
                            </div>
                          </div>

                          {yacht.estimatedTotal !==
                          null ? (
                            <div className="mt-4 rounded-2xl bg-muted/60 p-4">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                                Estimated charter total
                              </p>
                              <p className="mt-2 text-lg font-semibold text-foreground">
                                {formatRate(
                                  yacht.estimatedTotal,
                                  yacht.currency
                                )}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-auto pt-7">
                        <button
                          type="button"
                          disabled={
                            !yacht.selectable
                          }
                          onClick={() => {
                            setSelectionError(
                              null
                            );
                            setPendingYacht(
                              yacht
                            );
                          }}
                          className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                            selected
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-300"
                              : yacht.selectable
                                ? "bg-foreground text-background hover:opacity-90"
                                : "cursor-not-allowed bg-muted text-muted-foreground"
                          }`}
                        >
                          {selected ? (
                            <>
                              <Check className="size-4" />
                              Selected
                            </>
                          ) : yacht.selectable ? (
                            <>
                              <Sparkles className="size-4" />
                              Select this yacht
                            </>
                          ) : (
                            "Unavailable"
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            }
          )}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
          <p className="max-w-3xl text-xs leading-6 text-muted-foreground">
            Yacht availability, owner approval and commercial terms remain subject to final confirmation by your broker and the relevant yacht representative. Your selection indicates preference only and does not create a binding charter agreement.
          </p>
        </div>
      </footer>

      {pendingYacht ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget &&
              !isSelecting
            ) {
              setPendingYacht(
                null
              );
            }
          }}
        >
          <section className="w-full max-w-lg rounded-[28px] border border-border bg-card p-6 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">
                  Confirm preference
                </p>

                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
                  {pendingYacht.name}
                </h2>
              </div>

              <button
                type="button"
                disabled={
                  isSelecting
                }
                onClick={() =>
                  setPendingYacht(
                    null
                  )
                }
                className="flex size-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-border">
              <img
                src={
                  pendingYacht.imageUrl ??
                  pendingYacht.galleryImages[0] ??
                  getYachtPlaceholderMedia(
                    pendingYacht.fleetId ??
                      pendingYacht.proposalYachtId
                  ).hero
                }
                alt={pendingYacht.name}
                className="h-44 w-full object-cover"
              />

              <div className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">
                    {formatRate(
                      pendingYacht.weeklyRate,
                      pendingYacht.currency
                    )}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      / week
                    </span>
                  </p>

                  <AvailabilityBadge
                    label={
                      pendingYacht.availabilityLabel
                    }
                  />
                </div>
              </div>
            </div>

            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              By confirming, you are asking your broker to proceed with {pendingYacht.name} as your preferred yacht. This is not a booking and remains subject to final availability and any required owner or manager approval.
            </p>

            {selectionError ? (
              <div className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
                {
                  selectionError
                }
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                disabled={
                  isSelecting
                }
                onClick={() =>
                  setPendingYacht(
                    null
                  )
                }
                className="min-h-12 flex-1 rounded-2xl border border-border px-5 py-3 text-sm font-semibold transition hover:bg-muted disabled:opacity-50"
              >
                Keep reviewing
              </button>

              <button
                type="button"
                disabled={
                  isSelecting
                }
                onClick={() =>
                  void confirmSelection()
                }
                className="min-h-12 flex-1 rounded-2xl bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {isSelecting
                  ? "Sending..."
                  : "Confirm selection"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function useFixedClientProposalTheme() {
  useEffect(() => {
    const root = document.documentElement;

    const hadDark =
      root.classList.contains("dark");
    const hadLight =
      root.classList.contains("light");
    const previousColorScheme =
      root.style.colorScheme;

    const enforceLightTheme = () => {
      root.classList.remove("dark");
      root.classList.add("light");
      root.style.colorScheme = "light";
    };

    enforceLightTheme();

    const observer =
      new MutationObserver(() => {
        if (
          root.classList.contains("dark") ||
          !root.classList.contains("light")
        ) {
          enforceLightTheme();
        }
      });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();

      root.classList.remove(
        "light",
        "dark"
      );

      if (hadLight) {
        root.classList.add("light");
      }

      if (hadDark) {
        root.classList.add("dark");
      }

      root.style.colorScheme =
        previousColorScheme;
    };
  }, []);
}

function MetaPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full border border-border bg-card/70 px-4 py-2 text-sm">
      <span className="text-muted-foreground">
        {label}:{" "}
      </span>
      <span className="font-semibold">
        {value}
      </span>
    </div>
  );
}

function Spec({
  label,
  value,
}: {
  label: string;
  value:
    | string
    | number;
}) {
  return (
    <div className="rounded-2xl bg-muted/55 p-3.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold">
        {value}
      </p>
    </div>
  );
}

function InfoLine({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-5 text-sm">
      <span className="text-muted-foreground">
        {label}
      </span>
      <span className="max-w-[65%] text-right font-medium">
        {value}
      </span>
    </div>
  );
}

function AvailabilityBadge({
  label,
}: {
  label: string;
}) {
  const normalized =
    label.toLowerCase();

  const style =
    normalized ===
    "available"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
      : normalized.includes(
            "unavailable"
          )
        ? "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-300"
        : normalized.includes(
              "owner"
            )
          ? "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          : "border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-300";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${style}`}
    >
      {label}
    </span>
  );
}

function ProposalLoading() {
  return (
    <main className="min-h-screen bg-background p-5 text-foreground sm:p-8">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-14 rounded-2xl bg-muted" />
        <div className="mt-5 h-72 rounded-[28px] bg-muted" />

        <div className="mt-8 space-y-6">
          {Array.from({
            length: 3,
          }).map(
            (_, index) => (
              <div
                key={
                  index
                }
                className="h-[520px] rounded-[28px] bg-muted"
              />
            )
          )}
        </div>
      </div>
    </main>
  );
}

function ProposalUnavailable({
  message,
}: {
  message: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 text-foreground">
      <section className="w-full max-w-lg rounded-[28px] border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted">
          <Ship className="size-5 text-muted-foreground" />
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Private Charter Proposal
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
          Proposal unavailable
        </h1>

        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {message}
        </p>

        <p className="mt-5 text-xs leading-5 text-muted-foreground">
          Please contact your charter broker if you need a new proposal link.
        </p>
      </section>
    </main>
  );
}

function buildYachtSummary(
  yacht: ProposalYacht
): string {
  const details: string[] =
    [];

  if (
    yacht.builder
  ) {
    details.push(
      `Built by ${yacht.builder}`
    );
  }

  if (
    yacht.model
  ) {
    details.push(
      `model ${yacht.model}`
    );
  }

  if (
    yacht.lengthMeters !==
    null
  ) {
    details.push(
      `${formatNumber(
        yacht.lengthMeters
      )} metres in length`
    );
  }

  const guests =
    yacht.sleepingGuests ??
    yacht.guestCapacity;

  if (
    guests !== null
  ) {
    details.push(
      `accommodating up to ${guests} guests`
    );
  }

  if (
    yacht.cabinCount !==
    null
  ) {
    details.push(
      `across ${yacht.cabinCount} cabins`
    );
  }

  if (
    details.length ===
    0
  ) {
    return "Your broker has included this yacht as one of the strongest matches for your charter requirements.";
  }

  return `${details.join(
    ", "
  )}.`;
}

function formatRate(
  amount: number | null,
  currency: string
): string {
  if (
    amount === null ||
    !Number.isFinite(
      amount
    )
  ) {
    return "Rate on request";
  }

  try {
    return new Intl.NumberFormat(
      "en-GB",
      {
        style:
          "currency",
        currency:
          currency ||
          "EUR",
        maximumFractionDigits: 0,
      }
    ).format(
      amount
    );
  } catch {
    return `${currency || "EUR"} ${amount.toLocaleString()}`;
  }
}

function formatDateRange(
  startDate: string | null,
  endDate: string | null
): string {
  if (
    !startDate ||
    !endDate
  ) {
    return "To be confirmed";
  }

  const start =
    new Date(
      `${startDate}T00:00:00`
    );

  const end =
    new Date(
      `${endDate}T00:00:00`
    );

  return `${start.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
    }
  )} – ${end.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  )}`;
}

function formatNumber(
  value: number
): string {
  return new Intl.NumberFormat(
    "en-GB",
    {
      maximumFractionDigits: 1,
    }
  ).format(
    value
  );
}