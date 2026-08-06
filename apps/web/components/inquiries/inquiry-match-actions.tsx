"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  MapPin,
  Ship,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type InquiryMatchInput = {
  id: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  guests: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  preferences: string | null;
};

type YachtRecord = {
  id: string;
  name: string;
  yachtType: string | null;
  builder: string | null;
  model: string | null;
  lengthMeters: number | null;
  guestCapacity: number | null;
  sleepingGuests: number | null;
  cabinCount: number | null;
  homePort: string | null;
  cruisingRegions: string[];
  weeklyRateLow: number | null;
  weeklyRateHigh: number | null;
  currency: string;
  heroImageUrl: string | null;
};

type AvailabilityRecord = {
  id: string;
  startDate: string;
  endDate: string;
  status:
    | "available"
    | "provisional"
    | "option"
    | "booked"
    | "unavailable"
    | "maintenance";
  location: string | null;
  region: string | null;
  embarkationPort: string | null;
  disembarkationPort: string | null;
  weeklyRate: number | null;
  currency: string;
  yacht: YachtRecord | null;
  source: {
    id: string;
    name: string;
  } | null;
};

type AvailabilityResponse = {
  success: boolean;
  error?: string;
  data?: AvailabilityRecord[];
};

type YachtMatch = {
  yacht: YachtRecord;
  sourceName: string | null;
  weeklyRate: number | null;
  currency: string;
  availableFrom: string;
  availableTo: string;
  route: string | null;
  score: number;
  reasons: string[];
  warnings: string[];
};

export function InquiryMatchActions({
  inquiry,
}: {
  inquiry: InquiryMatchInput;
}) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<YachtMatch[]>([]);
  const [selectedYachtId, setSelectedYachtId] =
    useState<string | null>(null);

  const selectedMatch = useMemo(
    () =>
      matches.find(
        (match) => match.yacht.id === selectedYachtId
      ) ?? null,
    [matches, selectedYachtId]
  );

  async function openMatcher() {
    setIsOpen((current) => !current);

    if (hasLoaded || isLoading) {
      return;
    }

    await loadMatches();
  }

  async function loadMatches() {
    if (!inquiry.startDate || !inquiry.endDate) {
      setError(
        "Add both charter dates before matching the fleet."
      );
      setIsOpen(true);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSelectedYachtId(null);

    try {
      const params = new URLSearchParams({
        startDate: inquiry.startDate,
        endDate: inquiry.endDate,
        status: "available",
        limit: "1000",
      });

      const response = await fetch(
        `/api/availability?${params.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload =
        (await response.json()) as AvailabilityResponse;

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error ?? "Could not match the fleet."
        );
      }

      const rankedMatches = buildRankedMatches(
        payload.data ?? [],
        inquiry
      );

      setMatches(rankedMatches);
      setHasLoaded(true);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not match the fleet."
      );
      setMatches([]);
    } finally {
      setIsLoading(false);
    }
  }

  function buildProposal() {
    if (!selectedMatch) {
      return;
    }

    const params = new URLSearchParams({
      inquiryId: inquiry.id,
      yachtId: selectedMatch.yacht.id,
      yachtName: selectedMatch.yacht.name,
      currency:
        selectedMatch.currency ||
        inquiry.currency ||
        "EUR",
    });

    if (selectedMatch.weeklyRate !== null) {
      params.set(
        "weeklyRate",
        String(selectedMatch.weeklyRate)
      );
    }

    if (inquiry.startDate) {
      params.set("startDate", inquiry.startDate);
    }

    if (inquiry.endDate) {
      params.set("endDate", inquiry.endDate);
    }

    if (inquiry.destination) {
      params.set("destination", inquiry.destination);
    }

    if (inquiry.guests !== null) {
      params.set("guests", String(inquiry.guests));
    }

    router.push(`/proposals/new?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void openMatcher()}
        className="ui-primary-button apple-transition flex min-h-12 w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
        aria-expanded={isOpen}
      >
        <Ship className="size-4" />
        Match yachts
        <ChevronDown
          className={`ml-auto size-4 transition ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <div className="overflow-hidden rounded-[22px] border border-border bg-background/35">
          <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Suggested yachts
              </p>

              <p className="mt-1 text-sm text-foreground/80">
                {formatDateRange(
                  inquiry.startDate,
                  inquiry.endDate
                )}
                {inquiry.destination
                  ? ` · ${inquiry.destination}`
                  : ""}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-xl p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Close yacht matcher"
            >
              <X className="size-4" />
            </button>
          </div>

          {isLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 px-5 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Finding available yachts
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>

              <button
                type="button"
                onClick={() => void loadMatches()}
                className="ui-secondary-button mt-3 min-h-10 w-full px-4 text-sm font-semibold"
              >
                Try again
              </button>
            </div>
          ) : matches.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <Ship className="mx-auto size-7 text-muted-foreground" />

              <p className="mt-3 text-sm font-semibold text-foreground">
                No yachts available for the full date range
              </p>

              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Change the inquiry dates or review the general availability calendar.
              </p>
            </div>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
              {matches.map((match, index) => {
                const isSelected =
                  selectedYachtId === match.yacht.id;

                return (
                  <button
                    key={match.yacht.id}
                    type="button"
                    onClick={() =>
                      setSelectedYachtId(match.yacht.id)
                    }
                    className={`apple-transition w-full rounded-2xl border p-4 text-left ${
                      isSelected
                        ? "border-cyan-500/40 bg-cyan-500/10"
                        : "border-border bg-card/45 hover:border-ring/25 hover:bg-accent/45"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-border bg-background/55">
                        {match.yacht.heroImageUrl ? (
                          <img
                            src={match.yacht.heroImageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Ship className="size-5 text-muted-foreground" />
                        )}

                        {isSelected ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-cyan-950/65 text-white">
                            <Check className="size-5" />
                          </span>
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {match.yacht.name}
                            </p>

                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {[
                                match.yacht.yachtType,
                                match.yacht.lengthMeters
                                  ? `${match.yacht.lengthMeters} m`
                                  : null,
                                match.sourceName,
                              ]
                                .filter(Boolean)
                                .join(" · ") ||
                                "Connected yacht"}
                            </p>
                          </div>

                          <div className="shrink-0 text-right">
                            {index < 3 ? (
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                                Recommended
                              </p>
                            ) : null}

                            <p className="mt-1 text-xs font-semibold text-foreground">
                              {match.weeklyRate !== null
                                ? formatMoney(
                                    match.weeklyRate,
                                    match.currency
                                  )
                                : "Rate on request"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <MatchMetric
                            icon={<Users className="size-3.5" />}
                            value={
                              getGuestCapacity(match.yacht) !== null
                                ? `${getGuestCapacity(
                                    match.yacht
                                  )} guests`
                                : "Guests unknown"
                            }
                          />

                          <MatchMetric
                            icon={<MapPin className="size-3.5" />}
                            value={
                              match.route ??
                              match.yacht.homePort ??
                              "Route unknown"
                            }
                          />

                          <MatchMetric
                            icon={
                              <WalletCards className="size-3.5" />
                            }
                            value={`${match.availableFrom} – ${match.availableTo}`}
                          />
                        </div>

                        {match.reasons.length > 0 ? (
                          <p className="mt-3 text-xs leading-5 text-emerald-700 dark:text-emerald-300">
                            {match.reasons.slice(0, 2).join(" · ")}
                          </p>
                        ) : null}

                        {match.warnings.length > 0 ? (
                          <p className="mt-2 text-xs leading-5 text-amber-800 dark:text-amber-300">
                            {match.warnings.slice(0, 2).join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <button
        type="button"
        onClick={buildProposal}
        disabled={!selectedMatch}
        className="ui-secondary-button apple-transition flex min-h-12 w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-35"
      >
        <FileText className="size-4" />
        {selectedMatch
          ? `Build proposal for ${selectedMatch.yacht.name}`
          : "Select a yacht to build proposal"}
      </button>
    </div>
  );
}

function MatchMetric({
  icon,
  value,
}: {
  icon: React.ReactNode;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function buildRankedMatches(
  records: AvailabilityRecord[],
  inquiry: InquiryMatchInput
): YachtMatch[] {
  const grouped = new Map<string, AvailabilityRecord[]>();

  for (const record of records) {
    if (!record.yacht || record.status !== "available") {
      continue;
    }

    const current = grouped.get(record.yacht.id) ?? [];
    current.push(record);
    grouped.set(record.yacht.id, current);
  }

  return [...grouped.values()]
    .map((windows) => {
      const first = windows[0];
      const yacht = first.yacht!;
      const priced = windows
        .filter(
          (
            record
          ): record is AvailabilityRecord & {
            weeklyRate: number;
          } =>
            typeof record.weeklyRate === "number" &&
            Number.isFinite(record.weeklyRate)
        )
        .sort(
          (left, right) =>
            left.weeklyRate - right.weeklyRate
        );

      const weeklyRate =
        priced[0]?.weeklyRate ??
        yacht.weeklyRateLow ??
        yacht.weeklyRateHigh ??
        null;

      const currency =
        priced[0]?.currency ??
        yacht.currency ??
        inquiry.currency ??
        "EUR";

      const score = scoreMatch(
        yacht,
        windows,
        weeklyRate,
        inquiry
      );

      return {
        yacht,
        sourceName:
          first.source?.name ?? null,
        weeklyRate,
        currency,
        availableFrom: formatShortDate(
          inquiry.startDate ?? first.startDate
        ),
        availableTo: formatShortDate(
          inquiry.endDate ?? first.endDate
        ),
        route: formatRoute(windows),
        score: score.score,
        reasons: score.reasons,
        warnings: score.warnings,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (
        left.weeklyRate === null &&
        right.weeklyRate !== null
      ) {
        return 1;
      }

      if (
        left.weeklyRate !== null &&
        right.weeklyRate === null
      ) {
        return -1;
      }

      return (
        (left.weeklyRate ?? 0) -
        (right.weeklyRate ?? 0)
      );
    });
}

function scoreMatch(
  yacht: YachtRecord,
  windows: AvailabilityRecord[],
  weeklyRate: number | null,
  inquiry: InquiryMatchInput
) {
  let score = 100;
  const reasons: string[] = [
    "Available for the complete charter window",
  ];
  const warnings: string[] = [];

  const guestCapacity = getGuestCapacity(yacht);

  if (
    inquiry.guests !== null &&
    guestCapacity !== null
  ) {
    if (guestCapacity >= inquiry.guests) {
      score += 30;
      reasons.push(
        `Fits ${inquiry.guests} guests`
      );
    } else {
      score -= 120;
      warnings.push(
        `Capacity is ${guestCapacity}, below ${inquiry.guests} guests`
      );
    }
  } else if (inquiry.guests !== null) {
    warnings.push("Guest capacity is not recorded");
  }

  if (weeklyRate !== null) {
    if (
      inquiry.budgetMax !== null &&
      weeklyRate <= inquiry.budgetMax
    ) {
      score += 25;
      reasons.push("Within the stated budget");
    } else if (
      inquiry.budgetMax !== null &&
      weeklyRate > inquiry.budgetMax
    ) {
      score -= 20;
      warnings.push("Weekly rate is above budget");
    }

    if (
      inquiry.budgetMin !== null &&
      inquiry.budgetMax !== null &&
      weeklyRate >= inquiry.budgetMin &&
      weeklyRate <= inquiry.budgetMax
    ) {
      score += 10;
    }
  } else {
    warnings.push("Rate is on request");
  }

  const destination = normalizeText(
    inquiry.destination
  );

  if (destination) {
    const searchableDestination = normalizeText(
      [
        yacht.homePort,
        ...yacht.cruisingRegions,
        ...windows.flatMap((window) => [
          window.location,
          window.region,
          window.embarkationPort,
          window.disembarkationPort,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
    );

    if (
      searchableDestination &&
      destination
        .split(/\s+/)
        .some(
          (word) =>
            word.length >= 4 &&
            searchableDestination.includes(word)
        )
    ) {
      score += 25;
      reasons.push("Destination or route match");
    } else {
      warnings.push(
        "Destination match is not confirmed"
      );
    }
  }

  const preferences = normalizeText(
    inquiry.preferences
  );

  if (preferences) {
    const yachtDescription = normalizeText(
      [
        yacht.name,
        yacht.yachtType,
        yacht.builder,
        yacht.model,
      ]
        .filter(Boolean)
        .join(" ")
    );

    const preferenceWords = preferences
      .split(/\s+/)
      .filter((word) => word.length >= 4);

    const matchedPreferences =
      preferenceWords.filter((word) =>
        yachtDescription.includes(word)
      );

    if (matchedPreferences.length > 0) {
      score += Math.min(
        matchedPreferences.length * 5,
        20
      );
      reasons.push("Matches recorded preferences");
    }
  }

  return {
    score,
    reasons,
    warnings,
  };
}

function getGuestCapacity(
  yacht: YachtRecord
): number | null {
  return (
    yacht.sleepingGuests ??
    yacht.guestCapacity ??
    null
  );
}

function formatRoute(
  windows: AvailabilityRecord[]
): string | null {
  const routed = windows.find(
    (window) =>
      window.embarkationPort ||
      window.disembarkationPort ||
      window.location ||
      window.region
  );

  if (!routed) {
    return null;
  }

  if (
    routed.embarkationPort &&
    routed.disembarkationPort
  ) {
    return `${routed.embarkationPort} → ${routed.disembarkationPort}`;
  }

  return (
    routed.embarkationPort ??
    routed.disembarkationPort ??
    routed.location ??
    routed.region ??
    null
  );
}

function normalizeText(
  value: string | null
): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatMoney(
  amount: number,
  currency: string
) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || "EUR"} ${amount.toLocaleString(
      "en-GB"
    )}`;
  }
}

function formatShortDate(
  value: string
): string {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatDateRange(
  startDate: string | null,
  endDate: string | null
): string {
  if (!startDate || !endDate) {
    return "Dates not fully provided";
  }

  return `${formatShortDate(
    startDate
  )} – ${formatShortDate(endDate)}`;
}