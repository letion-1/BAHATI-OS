"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Clock3,
  FileText,
  Loader2,
  MapPin,
  Radio,
  Save,
  Ship,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useMemo,
  useState,
} from "react";

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

type AvailabilityCheckSource =
  | "yachtfolio"
  | "manager_email"
  | "manager_manual"
  | "management_calendar"
  | "other";

type AvailabilityCheckStatus =
  | "available"
  | "booked"
  | "option"
  | "unavailable"
  | "pending";

type AvailabilityCheck = {
  id: string;
  inquiryId: string;
  yachtId: string;
  source: AvailabilityCheckSource;
  status: AvailabilityCheckStatus;
  startDate: string;
  endDate: string;
  checkedAt: string;
  checkedBy: string | null;
  notes: string | null;
};

type AvailabilityChecksResponse = {
  success: boolean;
  error?: string;
  checks?: AvailabilityCheck[];
  check?: AvailabilityCheck;
};

type CheckEditor = {
  yachtId: string;
  source: AvailabilityCheckSource;
} | null;

const CHECK_STATUSES: Array<{
  value: AvailabilityCheckStatus;
  label: string;
}> = [
  {
    value: "available",
    label: "Available",
  },
  {
    value: "option",
    label: "Option",
  },
  {
    value: "booked",
    label: "Booked",
  },
  {
    value: "unavailable",
    label: "Unavailable",
  },
  {
    value: "pending",
    label: "Request sent",
  },
];

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
  const [checks, setChecks] = useState<AvailabilityCheck[]>([]);
  const [selectedYachtId, setSelectedYachtId] =
    useState<string | null>(null);

  const [editor, setEditor] =
    useState<CheckEditor>(null);

  const [editorStatus, setEditorStatus] =
    useState<AvailabilityCheckStatus>("available");

  const [editorNotes, setEditorNotes] =
    useState("");

  const [savingCheck, setSavingCheck] =
    useState(false);

  const [copiedYachtId, setCopiedYachtId] =
    useState<string | null>(null);

  const selectedMatch = useMemo(
    () =>
      matches.find(
        (match) => match.yacht.id === selectedYachtId
      ) ?? null,
    [matches, selectedYachtId]
  );

  const checksByYacht = useMemo(() => {
    const map =
      new Map<string, AvailabilityCheck[]>();

    for (const check of checks) {
      const current = map.get(check.yachtId) ?? [];
      current.push(check);
      map.set(check.yachtId, current);
    }

    for (const yachtChecks of map.values()) {
      yachtChecks.sort(
        (left, right) =>
          new Date(right.checkedAt).getTime() -
          new Date(left.checkedAt).getTime()
      );
    }

    return map;
  }, [checks]);

  async function openMatcher() {
    setIsOpen((current) => !current);

    if (hasLoaded || isLoading) {
      return;
    }

    await loadMatchesAndChecks();
  }

  async function loadMatchesAndChecks() {
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
      const availabilityParams = new URLSearchParams({
        startDate: inquiry.startDate,
        endDate: inquiry.endDate,
        status: "available",
        limit: "1000",
      });

      const checksParams = new URLSearchParams({
        inquiryId: inquiry.id,
      });

      const [
        availabilityResponse,
        checksResponse,
      ] = await Promise.all([
        fetch(
          `/api/availability?${availabilityParams.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          }
        ),
        fetch(
          `/api/availability-checks?${checksParams.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          }
        ),
      ]);

      const availabilityPayload =
        (await availabilityResponse.json()) as AvailabilityResponse;

      const checksPayload =
        (await checksResponse.json()) as AvailabilityChecksResponse;

      if (
        !availabilityResponse.ok ||
        !availabilityPayload.success
      ) {
        throw new Error(
          availabilityPayload.error ??
            "Could not match the fleet."
        );
      }

      if (
        !checksResponse.ok ||
        !checksPayload.success
      ) {
        throw new Error(
          checksPayload.error ??
            "Could not load availability verification."
        );
      }

      const rankedMatches = buildRankedMatches(
        availabilityPayload.data ?? [],
        inquiry
      );

      setMatches(rankedMatches);
      setChecks(checksPayload.checks ?? []);
      setHasLoaded(true);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not match the fleet."
      );
      setMatches([]);
      setChecks([]);
    } finally {
      setIsLoading(false);
    }
  }

  function openCheckEditor(
    yachtId: string,
    source: AvailabilityCheckSource
  ) {
    setEditor({
      yachtId,
      source,
    });

    setEditorStatus(
      source === "manager_email"
        ? "pending"
        : "available"
    );

    setEditorNotes("");
  }

  async function saveAvailabilityCheck() {
    if (
      !editor ||
      !inquiry.startDate ||
      !inquiry.endDate
    ) {
      return;
    }

    setSavingCheck(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/availability-checks",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inquiryId: inquiry.id,
            yachtId: editor.yachtId,
            source: editor.source,
            status: editorStatus,
            startDate: inquiry.startDate,
            endDate: inquiry.endDate,
            notes: editorNotes.trim() || null,
          }),
        }
      );

      const payload =
        (await response.json()) as AvailabilityChecksResponse;

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error ??
            "Could not save availability verification."
        );
      }

      if (payload.check) {
        setChecks((current) => [
          payload.check!,
          ...current,
        ]);
      }

      if (
        editorStatus === "booked" ||
        editorStatus === "unavailable"
      ) {
        setSelectedYachtId((current) =>
          current === editor.yachtId
            ? null
            : current
        );
      }

      setEditor(null);
      setEditorNotes("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save availability verification."
      );
    } finally {
      setSavingCheck(false);
    }
  }

  async function copyVerificationRequest(
    match: YachtMatch
  ) {
    const message = buildVerificationRequest(
      match,
      inquiry
    );

    try {
      await navigator.clipboard.writeText(message);
      setCopiedYachtId(match.yacht.id);

      window.setTimeout(() => {
        setCopiedYachtId((current) =>
          current === match.yacht.id
            ? null
            : current
        );
      }, 1800);
    } catch {
      setError(
        "Could not copy the verification request. Copy it manually from the manager verification panel."
      );
    }
  }

  function selectYacht(match: YachtMatch) {
    const yachtChecks =
      checksByYacht.get(match.yacht.id) ?? [];

    const effective =
      getEffectiveAvailability(yachtChecks);

    if (
      effective?.status === "booked" ||
      effective?.status === "unavailable"
    ) {
      return;
    }

    setSelectedYachtId(match.yacht.id);
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
      params.set(
        "destination",
        inquiry.destination
      );
    }

    if (inquiry.guests !== null) {
      params.set(
        "guests",
        String(inquiry.guests)
      );
    }

    router.push(
      `/proposals/new?${params.toString()}`
    );
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
              Finding yachts and verification history
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>

              <button
                type="button"
                onClick={() =>
                  void loadMatchesAndChecks()
                }
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
            <div className="max-h-[620px] space-y-3 overflow-y-auto p-3">
              {matches.map((match, index) => {
                const yachtChecks =
                  checksByYacht.get(match.yacht.id) ?? [];

                const yachtfolioCheck =
                  getLatestCheck(
                    yachtChecks,
                    ["yachtfolio"]
                  );

                const managerCheck =
                  getLatestCheck(
                    yachtChecks,
                    [
                      "manager_email",
                      "manager_manual",
                    ]
                  );

                const effective =
                  getEffectiveAvailability(
                    yachtChecks
                  );

                const blocked =
                  effective?.status === "booked" ||
                  effective?.status === "unavailable";

                const isSelected =
                  selectedYachtId === match.yacht.id;

                const needsManagerConfirmation =
                  shouldRecommendManagerConfirmation(
                    inquiry.startDate,
                    managerCheck
                  );

                const editorOpen =
                  editor?.yachtId === match.yacht.id;

                return (
                  <article
                    key={match.yacht.id}
                    className={`apple-transition overflow-hidden rounded-2xl border ${
                      isSelected
                        ? "border-cyan-500/40 bg-cyan-500/[0.07]"
                        : blocked
                          ? "border-red-500/20 bg-red-500/[0.04]"
                          : "border-border bg-card/45 hover:border-ring/25"
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-border bg-background/55">
                          {match.yacht.heroImageUrl ? (
                            <img
                              src={
                                match.yacht.heroImageUrl
                              }
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
                              icon={
                                <Users className="size-3.5" />
                              }
                              value={
                                getGuestCapacity(
                                  match.yacht
                                ) !== null
                                  ? `${getGuestCapacity(
                                      match.yacht
                                    )} guests`
                                  : "Guests unknown"
                              }
                            />

                            <MatchMetric
                              icon={
                                <MapPin className="size-3.5" />
                              }
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
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 lg:grid-cols-3">
                        <EvidenceCard
                          eyebrow="Source availability"
                          title="Available"
                          detail={
                            match.sourceName
                              ? `Imported from ${match.sourceName}`
                              : "Imported connected source"
                          }
                          tone="positive"
                        />

                        <EvidenceCard
                          eyebrow="Yachtfolio check"
                          title={
                            yachtfolioCheck
                              ? formatStatus(
                                  yachtfolioCheck.status
                                )
                              : "Not recorded"
                          }
                          detail={
                            yachtfolioCheck
                              ? `Checked ${formatRelativeTime(
                                  yachtfolioCheck.checkedAt
                                )}`
                              : "Record the broker's Yachtfolio result"
                          }
                          tone={statusTone(
                            yachtfolioCheck?.status
                          )}
                        />

                        <EvidenceCard
                          eyebrow="Manager verification"
                          title={
                            managerCheck
                              ? formatStatus(
                                  managerCheck.status
                                )
                              : needsManagerConfirmation
                                ? "Recommended"
                                : "Not required yet"
                          }
                          detail={
                            managerCheck
                              ? `${sourceLabel(
                                  managerCheck.source
                                )} · ${formatRelativeTime(
                                  managerCheck.checkedAt
                                )}`
                              : needsManagerConfirmation
                                ? "Near-term charter needs a fresh confirmation"
                                : "No direct confirmation recorded"
                          }
                          tone={
                            managerCheck
                              ? statusTone(
                                  managerCheck.status
                                )
                              : needsManagerConfirmation
                                ? "warning"
                                : "neutral"
                          }
                        />
                      </div>

                      {effective ? (
                        <div
                          className={`mt-3 rounded-2xl border px-4 py-3 text-xs ${
                            effective.status === "available"
                              ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-800 dark:text-emerald-200"
                              : effective.status === "booked" ||
                                  effective.status === "unavailable"
                                ? "border-red-500/20 bg-red-500/[0.07] text-red-700 dark:text-red-200"
                                : "border-amber-500/20 bg-amber-500/[0.07] text-amber-800 dark:text-amber-200"
                          }`}
                        >
                          <span className="font-semibold">
                            Current availability intelligence:
                          </span>{" "}
                          {formatStatus(effective.status)}
                          {" · "}
                          {sourceLabel(effective.source)}
                        </div>
                      ) : null}

                      {match.reasons.length > 0 ? (
                        <p className="mt-3 text-xs leading-5 text-emerald-700 dark:text-emerald-300">
                          {match.reasons
                            .slice(0, 2)
                            .join(" · ")}
                        </p>
                      ) : null}

                      {match.warnings.length > 0 ? (
                        <p className="mt-2 text-xs leading-5 text-amber-800 dark:text-amber-300">
                          {match.warnings
                            .slice(0, 2)
                            .join(" · ")}
                        </p>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openCheckEditor(
                              match.yacht.id,
                              "yachtfolio"
                            )
                          }
                          className="ui-secondary-button apple-transition inline-flex min-h-10 items-center justify-center gap-2 px-3 text-xs font-semibold hover:bg-accent"
                        >
                          <Radio className="size-3.5" />
                          Record Yachtfolio check
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            openCheckEditor(
                              match.yacht.id,
                              "manager_email"
                            )
                          }
                          className="ui-secondary-button apple-transition inline-flex min-h-10 items-center justify-center gap-2 px-3 text-xs font-semibold hover:bg-accent"
                        >
                          <CheckCircle2 className="size-3.5" />
                          Manager verification
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void copyVerificationRequest(
                              match
                            )
                          }
                          className="ui-secondary-button apple-transition inline-flex min-h-10 items-center justify-center gap-2 px-3 text-xs font-semibold hover:bg-accent"
                        >
                          <Clipboard className="size-3.5" />
                          {copiedYachtId ===
                          match.yacht.id
                            ? "Copied"
                            : "Copy request"}
                        </button>

                        <button
                          type="button"
                          disabled={blocked}
                          onClick={() =>
                            selectYacht(match)
                          }
                          className="ui-primary-button apple-transition ml-auto inline-flex min-h-10 items-center justify-center gap-2 px-4 text-xs font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          {blocked
                            ? "Do not offer"
                            : isSelected
                              ? "Selected"
                              : "Select yacht"}
                        </button>
                      </div>

                      {editorOpen ? (
                        <div className="mt-4 rounded-[18px] border border-border bg-background/50 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                {editor.source ===
                                "yachtfolio"
                                  ? "Record Yachtfolio check"
                                  : "Manager verification"}
                              </p>

                              <p className="mt-1 text-sm font-semibold text-foreground">
                                {match.yacht.name} ·{" "}
                                {formatDateRange(
                                  inquiry.startDate,
                                  inquiry.endDate
                                )}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setEditor(null)
                              }
                              className="rounded-xl p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                              aria-label="Close verification editor"
                            >
                              <X className="size-4" />
                            </button>
                          </div>

                          {editor.source ===
                          "manager_email" ? (
                            <div className="mt-3 flex items-start gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.07] px-3 py-3 text-xs leading-5 text-cyan-800 dark:text-cyan-200">
                              <Clock3 className="mt-0.5 size-3.5 shrink-0" />
                              Use “Request sent” when you have emailed the Charter Manager. When they reply, reopen this panel and record Available, Option, Booked or Unavailable.
                            </div>
                          ) : null}

                          <div className="mt-4 flex flex-wrap gap-2">
                            {CHECK_STATUSES.filter(
                              (option) =>
                                editor.source !==
                                  "yachtfolio" ||
                                option.value !==
                                  "pending"
                            ).map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  setEditorStatus(
                                    option.value
                                  )
                                }
                                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                                  editorStatus ===
                                  option.value
                                    ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200"
                                    : "border-border bg-background/55 text-muted-foreground hover:bg-accent hover:text-foreground"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>

                          <textarea
                            value={editorNotes}
                            onChange={(event) =>
                              setEditorNotes(
                                event.target.value
                              )
                            }
                            rows={3}
                            placeholder={
                              editor.source ===
                              "yachtfolio"
                                ? "Optional note, e.g. checked in Yachtfolio Bookings."
                                : "Optional note, e.g. manager confirmed from Split at €165,000 + VAT/APA."
                            }
                            className="ui-input mt-3 w-full resize-y rounded-xl px-3 py-3 text-xs leading-5"
                          />

                          <button
                            type="button"
                            onClick={() =>
                              void saveAvailabilityCheck()
                            }
                            disabled={savingCheck}
                            className="ui-primary-button apple-transition mt-3 inline-flex min-h-10 items-center justify-center gap-2 px-4 text-xs font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingCheck ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Save className="size-3.5" />
                            )}
                            Save check
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
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

function EvidenceCard({
  eyebrow,
  title,
  detail,
  tone,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  tone:
    | "positive"
    | "warning"
    | "negative"
    | "neutral";
}) {
  const toneClass = {
    positive:
      "border-emerald-500/20 bg-emerald-500/[0.07]",
    warning:
      "border-amber-500/20 bg-amber-500/[0.07]",
    negative:
      "border-red-500/20 bg-red-500/[0.07]",
    neutral:
      "border-border bg-background/45",
  }[tone];

  const titleClass = {
    positive:
      "text-emerald-800 dark:text-emerald-200",
    warning:
      "text-amber-800 dark:text-amber-200",
    negative:
      "text-red-700 dark:text-red-200",
    neutral:
      "text-foreground",
  }[tone];

  return (
    <div
      className={`min-w-0 rounded-2xl border p-3 ${toneClass}`}
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {eyebrow}
      </p>

      <p
        className={`mt-1 truncate text-xs font-semibold ${titleClass}`}
      >
        {title}
      </p>

      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function MatchMetric({
  icon,
  value,
}: {
  icon: ReactNode;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function getLatestCheck(
  checks: AvailabilityCheck[],
  sources: AvailabilityCheckSource[]
): AvailabilityCheck | null {
  return (
    checks
      .filter((check) =>
        sources.includes(check.source)
      )
      .sort(
        (left, right) =>
          new Date(right.checkedAt).getTime() -
          new Date(left.checkedAt).getTime()
      )[0] ?? null
  );
}

function getEffectiveAvailability(
  checks: AvailabilityCheck[]
): AvailabilityCheck | null {
  const manager =
    getLatestCheck(checks, [
      "manager_email",
      "manager_manual",
    ]);

  if (manager) {
    return manager;
  }

  const yachtfolio =
    getLatestCheck(checks, ["yachtfolio"]);

  if (yachtfolio) {
    return yachtfolio;
  }

  return getLatestCheck(checks, [
    "management_calendar",
    "other",
  ]);
}

function shouldRecommendManagerConfirmation(
  startDate: string | null,
  managerCheck: AvailabilityCheck | null
): boolean {
  if (!startDate) {
    return false;
  }

  const start =
    new Date(`${startDate}T00:00:00`);

  if (Number.isNaN(start.getTime())) {
    return false;
  }

  const now = new Date();
  const daysUntilStart =
    (start.getTime() - now.getTime()) /
    86_400_000;

  if (
    daysUntilStart < 0 ||
    daysUntilStart > 60
  ) {
    return false;
  }

  if (!managerCheck) {
    return true;
  }

  const checkedAt =
    new Date(managerCheck.checkedAt);

  if (Number.isNaN(checkedAt.getTime())) {
    return true;
  }

  const ageHours =
    (now.getTime() - checkedAt.getTime()) /
    3_600_000;

  if (daysUntilStart <= 30) {
    return ageHours > 24;
  }

  return ageHours > 72;
}

function statusTone(
  status:
    | AvailabilityCheckStatus
    | undefined
): "positive" | "warning" | "negative" | "neutral" {
  if (status === "available") {
    return "positive";
  }

  if (
    status === "booked" ||
    status === "unavailable"
  ) {
    return "negative";
  }

  if (
    status === "option" ||
    status === "pending"
  ) {
    return "warning";
  }

  return "neutral";
}

function formatStatus(
  status: AvailabilityCheckStatus
): string {
  const labels: Record<
    AvailabilityCheckStatus,
    string
  > = {
    available: "Available",
    booked: "Booked",
    option: "Option",
    unavailable: "Unavailable",
    pending: "Confirmation pending",
  };

  return labels[status];
}

function sourceLabel(
  source: AvailabilityCheckSource
): string {
  const labels: Record<
    AvailabilityCheckSource,
    string
  > = {
    yachtfolio: "Yachtfolio",
    manager_email: "Charter Manager",
    manager_manual: "Manager confirmation",
    management_calendar: "Management calendar",
    other: "Other source",
  };

  return labels[source];
}

function formatRelativeTime(
  value: string
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const seconds =
    Math.round(
      (Date.now() - date.getTime()) / 1000
    );

  if (seconds < 60) {
    return "just now";
  }

  const minutes =
    Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours =
    Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days =
    Math.round(hours / 24);

  if (days < 14) {
    return `${days}d ago`;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function buildVerificationRequest(
  match: YachtMatch,
  inquiry: InquiryMatchInput
): string {
  const dates =
    formatDateRange(
      inquiry.startDate,
      inquiry.endDate
    );

  const details = [
    `Yacht: ${match.yacht.name}`,
    `Dates: ${dates}`,
    inquiry.destination
      ? `Destination: ${inquiry.destination}`
      : null,
    inquiry.guests !== null
      ? `Guests: ${inquiry.guests}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    `Subject: Availability request · ${match.yacht.name} · ${dates}`,
    "",
    `Hi, could you please confirm the current availability of ${match.yacht.name} for the following charter inquiry?`,
    "",
    details,
    "",
    "Many thanks.",
  ].join("\n");
}

function buildRankedMatches(
  records: AvailabilityRecord[],
  inquiry: InquiryMatchInput
): YachtMatch[] {
  const grouped =
    new Map<string, AvailabilityRecord[]>();

  for (const record of records) {
    if (
      !record.yacht ||
      record.status !== "available"
    ) {
      continue;
    }

    const current =
      grouped.get(record.yacht.id) ?? [];

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
            typeof record.weeklyRate ===
              "number" &&
            Number.isFinite(
              record.weeklyRate
            )
        )
        .sort(
          (left, right) =>
            left.weeklyRate -
            right.weeklyRate
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

      const score =
        scoreMatch(
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
        availableFrom:
          formatShortDate(
            inquiry.startDate ??
              first.startDate
          ),
        availableTo:
          formatShortDate(
            inquiry.endDate ??
              first.endDate
          ),
        route: formatRoute(windows),
        score: score.score,
        reasons: score.reasons,
        warnings: score.warnings,
      };
    })
    .sort((left, right) => {
      if (
        right.score !== left.score
      ) {
        return (
          right.score - left.score
        );
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

  const guestCapacity =
    getGuestCapacity(yacht);

  if (
    inquiry.guests !== null &&
    guestCapacity !== null
  ) {
    if (
      guestCapacity >= inquiry.guests
    ) {
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
  } else if (
    inquiry.guests !== null
  ) {
    warnings.push(
      "Guest capacity is not recorded"
    );
  }

  if (weeklyRate !== null) {
    if (
      inquiry.budgetMax !== null &&
      weeklyRate <= inquiry.budgetMax
    ) {
      score += 25;
      reasons.push(
        "Within the stated budget"
      );
    } else if (
      inquiry.budgetMax !== null &&
      weeklyRate > inquiry.budgetMax
    ) {
      score -= 20;
      warnings.push(
        "Weekly rate is above budget"
      );
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
    warnings.push(
      "Rate is on request"
    );
  }

  const destination =
    normalizeText(
      inquiry.destination
    );

  if (destination) {
    const searchableDestination =
      normalizeText(
        [
          yacht.homePort,
          ...yacht.cruisingRegions,
          ...windows.flatMap(
            (window) => [
              window.location,
              window.region,
              window.embarkationPort,
              window.disembarkationPort,
            ]
          ),
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
            searchableDestination.includes(
              word
            )
        )
    ) {
      score += 25;
      reasons.push(
        "Destination or route match"
      );
    } else {
      warnings.push(
        "Destination match is not confirmed"
      );
    }
  }

  const preferences =
    normalizeText(
      inquiry.preferences
    );

  if (preferences) {
    const yachtDescription =
      normalizeText(
        [
          yacht.name,
          yacht.yachtType,
          yacht.builder,
          yacht.model,
        ]
          .filter(Boolean)
          .join(" ")
      );

    const preferenceWords =
      preferences
        .split(/\s+/)
        .filter(
          (word) =>
            word.length >= 4
        );

    const matchedPreferences =
      preferenceWords.filter(
        (word) =>
          yachtDescription.includes(
            word
          )
      );

    if (
      matchedPreferences.length > 0
    ) {
      score += Math.min(
        matchedPreferences.length * 5,
        20
      );

      reasons.push(
        "Matches recorded preferences"
      );
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
  const routed =
    windows.find(
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
    return new Intl.NumberFormat(
      "en-GB",
      {
        style: "currency",
        currency:
          currency || "EUR",
        maximumFractionDigits: 0,
      }
    ).format(amount);
  } catch {
    return `${
      currency || "EUR"
    } ${amount.toLocaleString(
      "en-GB"
    )}`;
  }
}

function formatShortDate(
  value: string
): string {
  const date =
    new Date(
      `${value}T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "short",
    }
  ).format(date);
}

function formatDateRange(
  startDate: string | null,
  endDate: string | null
): string {
  if (
    !startDate ||
    !endDate
  ) {
    return "Dates not fully provided";
  }

  return `${formatShortDate(
    startDate
  )} – ${formatShortDate(
    endDate
  )}`;
}