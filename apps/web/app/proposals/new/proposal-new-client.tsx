"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type AvailabilityStatus =
  | "available"
  | "provisional"
  | "option"
  | "booked"
  | "unavailable"
  | "maintenance";

type YachtStatus = AvailabilityStatus | "no_availability";

type YachtDetail = {
  id: string;
  name: string;
  status: YachtStatus;
  rates: {
    lowestWeeklyRate: number | null;
    highestWeeklyRate: number | null;
    currency: string;
  };
  sources: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    lastSyncedAt: string | null;
    error: string | null;
    availabilityCount: number;
  }>;
  availability: Array<{
    id: string;
    startDate: string;
    endDate: string;
    status: AvailabilityStatus;
    weeklyRate: number | null;
    currency: string;
    isCurrent: boolean;
    isPast: boolean;
    source: {
      id: string;
      name: string;
      type: string;
    } | null;
  }>;
};

type YachtDetailResponse = {
  success: boolean;
  yacht: YachtDetail;
  error?: string;
};

type InquiryListItem = {
  id: string;
  client_name: string | null;
  email: string | null;
  phone: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  preferences: string | null;
  original_inquiry?: string | null;
};

type InquiriesResponse = {
  success: boolean;
  inquiries?: InquiryListItem[];
  error?: string;
};

type ProposalFormState = {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  startDate: string;
  endDate: string;
  guests: string;
  notes: string;
};

type FormErrors = Partial<Record<keyof ProposalFormState, string>>;

type YachtOffer = {
  yachtId: string;
  weeklyRate: string;
  currency: string;
};

type CreateProposalResponse = {
  success: boolean;
  proposal?: {
    id: string;
    reference: string;
  };
  error?: string;
  fieldErrors?: Record<string, string>;
};

const initialForm: ProposalFormState = {
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  startDate: "",
  endDate: "",
  guests: "",
  notes: "",
};

export default function NewProposalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const legacyYachtId = searchParams.get("yachtId");
  const inquiryId = searchParams.get("inquiryId");

  const selectedYachtIds = useMemo(() => {
    const multi =
      searchParams
        .get("yachtIds")
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean) ?? [];

    const ids =
      multi.length > 0
        ? multi
        : legacyYachtId
          ? [legacyYachtId]
          : [];

    return Array.from(new Set(ids)).slice(0, 3);
  }, [legacyYachtId, searchParams]);

  const yachtIdsKey = selectedYachtIds.join(",");

  const requestedStartDate =
    searchParams.get("startDate") ?? "";

  const requestedEndDate =
    searchParams.get("endDate") ?? "";

  const requestedGuests =
    searchParams.get("guests") ?? "";

  const requestedWeeklyRate =
    searchParams.get("weeklyRate") ?? "";

  const requestedCurrency =
    searchParams.get("currency") ?? "EUR";

  const [yachts, setYachts] =
    useState<YachtDetail[]>([]);

  const [offers, setOffers] =
    useState<Record<string, YachtOffer>>({});

  const [inquiry, setInquiry] =
    useState<InquiryListItem | null>(null);

  const [form, setForm] =
    useState<ProposalFormState>(() => ({
      ...initialForm,
      startDate: requestedStartDate,
      endDate: requestedEndDate,
      guests: requestedGuests,
    }));

  const [errors, setErrors] = useState<FormErrors>({});
  const [isYachtLoading, setIsYachtLoading] =
    useState(selectedYachtIds.length > 0);
  const [isInquiryLoading, setIsInquiryLoading] =
    useState(Boolean(inquiryId));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const loadYachts = useCallback(async () => {
    const ids = yachtIdsKey
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      setYachts([]);
      setOffers({});
      setIsYachtLoading(false);
      return;
    }

    try {
      setIsYachtLoading(true);
      setPageError(null);

      const results = await Promise.all(
        ids.map(async (yachtId) => {
          const response = await fetch(
            `/api/fleet/${encodeURIComponent(yachtId)}`,
            {
              method: "GET",
              cache: "no-store",
            }
          );

          const result =
            (await response.json()) as YachtDetailResponse;

          if (!response.ok || !result.success) {
            throw new Error(
              result.error ??
                `Could not load yacht ${yachtId}.`
            );
          }

          return result.yacht;
        })
      );

      setYachts(results);

      setOffers((current) => {
        const next: Record<string, YachtOffer> = {};

        for (const [index, yacht] of results.entries()) {
          const matchingWindow =
            findBestAvailabilityWindow(
              yacht,
              requestedStartDate,
              requestedEndDate
            );

          const suggestedRate =
            matchingWindow?.weeklyRate ??
            yacht.rates.lowestWeeklyRate;

          const existing = current[yacht.id];

          next[yacht.id] = {
            yachtId: yacht.id,
            weeklyRate:
              existing?.weeklyRate ??
              (index === 0 && requestedWeeklyRate
                ? requestedWeeklyRate
                : suggestedRate !== null &&
                    suggestedRate !== undefined
                  ? String(suggestedRate)
                  : ""),
            currency:
              existing?.currency ??
              (index === 0 && requestedCurrency
                ? requestedCurrency
                : matchingWindow?.currency ||
                  yacht.rates.currency ||
                  requestedCurrency ||
                  "EUR"),
          };
        }

        return next;
      });
    } catch (loadError) {
      setPageError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load the selected yachts."
      );
      setYachts([]);
      setOffers({});
    } finally {
      setIsYachtLoading(false);
    }
  }, [
    yachtIdsKey,
    requestedCurrency,
    requestedEndDate,
    requestedStartDate,
    requestedWeeklyRate,
  ]);

  useEffect(() => {
    void loadYachts();
  }, [loadYachts]);

  const loadInquiry = useCallback(async () => {
    if (!inquiryId) {
      setIsInquiryLoading(false);
      return;
    }

    try {
      setIsInquiryLoading(true);
      setPageError(null);

      const response = await fetch("/api/inquiries", {
        method: "GET",
        cache: "no-store",
      });

      const result =
        (await response.json()) as InquiriesResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ?? "Could not load the inquiry."
        );
      }

      const matchedInquiry =
        result.inquiries?.find(
          (item) => item.id === inquiryId
        ) ?? null;

      if (!matchedInquiry) {
        throw new Error(
          "The selected inquiry could not be found."
        );
      }

      setInquiry(matchedInquiry);

      setForm((current) => ({
        ...current,
        clientName:
          matchedInquiry.client_name?.trim() ??
          current.clientName,
        clientEmail:
          matchedInquiry.email?.trim() ??
          current.clientEmail,
        clientPhone:
          matchedInquiry.phone?.trim() ??
          current.clientPhone,
        startDate:
          matchedInquiry.start_date ??
          current.startDate,
        endDate:
          matchedInquiry.end_date ??
          current.endDate,
        guests:
          matchedInquiry.guests !== null
            ? String(matchedInquiry.guests)
            : current.guests,
        notes:
          buildInquiryNotes(
            matchedInquiry,
            current.notes
          ),
      }));
    } catch (loadError) {
      setPageError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load the inquiry."
      );
    } finally {
      setIsInquiryLoading(false);
    }
  }, [inquiryId]);

  useEffect(() => {
    void loadInquiry();
  }, [loadInquiry]);

  const proposalYachts = useMemo(
    () =>
      yachts.map((yacht, index) => {
        const offer =
          offers[yacht.id] ?? {
            yachtId: yacht.id,
            weeklyRate: "",
            currency:
              yacht.rates.currency ||
              requestedCurrency ||
              "EUR",
          };

        return {
          yacht,
          offer,
          position: index + 1,
          estimatedTotal: calculateEstimatedTotal(
            offer.weeklyRate,
            form.startDate,
            form.endDate
          ),
          availabilityWindow:
            findBestAvailabilityWindow(
              yacht,
              form.startDate,
              form.endDate
            ),
        };
      }),
    [
      form.endDate,
      form.startDate,
      offers,
      requestedCurrency,
      yachts,
    ]
  );

  function updateField(
    field: keyof ProposalFormState,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setErrors((current) => ({
      ...current,
      [field]: undefined,
    }));

    setPageError(null);
  }

  function updateOffer(
    yachtId: string,
    field: "weeklyRate" | "currency",
    value: string
  ) {
    setOffers((current) => ({
      ...current,
      [yachtId]: {
        ...(current[yachtId] ?? {
          yachtId,
          weeklyRate: "",
          currency: "EUR",
        }),
        [field]: value,
      },
    }));

    setPageError(null);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const nextErrors = validateProposalForm(form);
    setErrors(nextErrors);
    setPageError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (proposalYachts.length === 0) {
      setPageError(
        "At least one yacht must be selected before saving the proposal."
      );
      return;
    }

    const invalidOffer = proposalYachts.find(
      ({ offer }) =>
        offer.weeklyRate.trim() &&
        (!Number.isFinite(Number(offer.weeklyRate)) ||
          Number(offer.weeklyRate) < 0)
    );

    if (invalidOffer) {
      setPageError(
        `Enter a valid weekly rate for ${invalidOffer.yacht.name}.`
      );
      return;
    }

    const primary = proposalYachts[0];

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Legacy singular fields remain during the migration.
          yachtId: primary.yacht.id,
          weeklyRate: primary.offer.weeklyRate.trim()
            ? Number(primary.offer.weeklyRate)
            : null,
          estimatedTotal: primary.estimatedTotal,
          currency: primary.offer.currency,

          // Multi-yacht payload used by the upgraded proposal API.
          yachts: proposalYachts.map(
            ({
              yacht,
              offer,
              position,
              estimatedTotal,
              availabilityWindow,
            }) => ({
              yachtId: yacht.id,
              position,
              weeklyRate: offer.weeklyRate.trim()
                ? Number(offer.weeklyRate)
                : null,
              estimatedTotal,
              currency: offer.currency,
              availabilityStatus:
                availabilityWindow?.status ??
                "unverified",
            })
          ),

          inquiryId: inquiryId || null,
          clientName: form.clientName.trim(),
          clientEmail: form.clientEmail.trim(),
          clientPhone:
            form.clientPhone.trim() || null,
          startDate: form.startDate,
          endDate: form.endDate,
          guests: Number(form.guests),
          notes: form.notes.trim() || null,
        }),
      });

      const result =
        (await response.json()) as CreateProposalResponse;

      if (!response.ok || !result.success) {
        if (result.fieldErrors) {
          setErrors(
            mapServerFieldErrors(result.fieldErrors)
          );
        }

        throw new Error(
          result.error ?? "Could not save proposal."
        );
      }

      if (!result.proposal?.id) {
        throw new Error(
          "The proposal was saved, but no record ID was returned."
        );
      }

      router.push(
        `/proposals?created=${encodeURIComponent(
          result.proposal.id
        )}`
      );
    } catch (submitError) {
      setPageError(
        submitError instanceof Error
          ? submitError.message
          : "Could not save proposal."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const isLoading =
    isYachtLoading || isInquiryLoading;

  if (isLoading) {
    return <ProposalSkeleton />;
  }

  const firstYachtId =
    proposalYachts[0]?.yacht.id ??
    selectedYachtIds[0] ??
    null;

  return (
    <main className="min-h-full bg-background px-5 py-7 text-foreground sm:px-7 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href={
              inquiryId
                ? `/workspace/inquiry/${inquiryId}`
                : firstYachtId
                  ? `/fleet/${firstYachtId}`
                  : "/proposals"
            }
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <span>←</span>
            {inquiryId
              ? "Back to inquiry"
              : firstYachtId
                ? "Back to yacht"
                : "Back to proposals"}
          </Link>

          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
            Draft
          </span>
        </div>

        <section className="relative overflow-hidden rounded-[28px] border border-border bg-[linear-gradient(135deg,var(--hero-start),var(--hero-middle),var(--hero-end))] p-6 shadow-[var(--strong-shadow)] sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.55)]" />
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-cyan-700 dark:text-cyan-300">
                Proposal Builder
              </p>
            </div>

            <h1 className="mt-5 font-heading text-4xl leading-none tracking-[0.045em] text-[var(--hero-foreground)] sm:text-5xl">
              Create a charter selection
            </h1>

            <p className="ui-hero-muted mt-3 max-w-3xl text-sm leading-7 sm:text-base">
              Prepare one client proposal containing up to three
              shortlisted yachts, with independent rates and commercial
              details for each option.
            </p>

            {proposalYachts.length > 0 ? (
              <div className="mt-6 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-800 dark:text-cyan-200">
                {proposalYachts.length} of 3 yacht
                {proposalYachts.length === 1 ? "" : "s"} selected
              </div>
            ) : null}
          </div>
        </section>

        {pageError ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-200">
            {pageError}
          </div>
        ) : null}

        {selectedYachtIds.length === 0 ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-6">
            <h2 className="font-semibold text-amber-900 dark:text-amber-100">
              No yachts selected
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-800/80 dark:text-amber-200/75">
              Return to the inquiry and shortlist up to three yachts before
              building the proposal.
            </p>
            <Link
              href={inquiryId ? `/workspace/inquiry/${inquiryId}` : "/fleet"}
              className="ui-primary-button apple-transition mt-5 inline-flex rounded-xl px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
            >
              {inquiryId ? "Back to inquiry" : "Browse yachts"}
            </Link>
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-[1fr_420px]"
        >
          <div className="space-y-6">
            <FormPanel
              title="Client information"
              description="Who will receive this proposal?"
            >
              <div className="grid gap-5 [&>*]:min-w-0 sm:grid-cols-2">
                <TextField
                  label="Client name"
                  value={form.clientName}
                  onChange={(value) =>
                    updateField("clientName", value)
                  }
                  placeholder="Jane Thompson"
                  error={errors.clientName}
                  required
                />

                <TextField
                  label="Client email"
                  value={form.clientEmail}
                  onChange={(value) =>
                    updateField("clientEmail", value)
                  }
                  placeholder="jane@example.com"
                  type="email"
                  error={errors.clientEmail}
                  required
                />

                <TextField
                  label="Client phone"
                  value={form.clientPhone}
                  onChange={(value) =>
                    updateField("clientPhone", value)
                  }
                  placeholder="+44 7700 900000"
                />

                <TextField
                  label="Number of guests"
                  value={form.guests}
                  onChange={(value) =>
                    updateField("guests", value)
                  }
                  placeholder="8"
                  type="number"
                  min="1"
                  error={errors.guests}
                  required
                />
              </div>
            </FormPanel>

            <FormPanel
              title="Charter period"
              description="These dates apply to every yacht in the client selection."
            >
              <div className="grid gap-5 [&>*]:min-w-0 sm:grid-cols-2">
                <TextField
                  label="Start date"
                  value={form.startDate}
                  onChange={(value) =>
                    updateField("startDate", value)
                  }
                  type="date"
                  error={errors.startDate}
                  required
                />

                <TextField
                  label="End date"
                  value={form.endDate}
                  onChange={(value) =>
                    updateField("endDate", value)
                  }
                  type="date"
                  min={form.startDate || undefined}
                  error={errors.endDate}
                  required
                />
              </div>
            </FormPanel>

            <FormPanel
              title="Selected yachts"
              description="Review the three shortlisted options and set the client-facing rate for each."
            >
              <div className="space-y-4">
                {proposalYachts.map(
                  ({
                    yacht,
                    offer,
                    position,
                    estimatedTotal,
                    availabilityWindow,
                  }) => (
                    <div
                      key={yacht.id}
                      className="rounded-[22px] border border-border bg-background/45 p-4 sm:p-5"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-center gap-4">
                          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-[linear-gradient(135deg,var(--hero-start),var(--hero-middle),var(--hero-end))]">
                            <span className="text-sm font-bold text-cyan-700 dark:text-cyan-300">
                              {String(position).padStart(2, "0")}
                            </span>
                          </div>

                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Yacht option {position}
                            </p>
                            <h3 className="mt-1 truncate text-lg font-semibold text-foreground">
                              {yacht.name}
                            </h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {yacht.sources[0]?.name ??
                                "Connected yacht"}
                            </p>
                          </div>
                        </div>

                        <AvailabilityPill
                          status={
                            availabilityWindow?.status ??
                            yacht.status
                          }
                        />
                      </div>

                      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_150px]">
                        <TextField
                          label="Weekly charter rate"
                          value={offer.weeklyRate}
                          onChange={(value) =>
                            updateOffer(
                              yacht.id,
                              "weeklyRate",
                              value
                            )
                          }
                          placeholder="Rate on request"
                          type="number"
                          min="0"
                          step="0.01"
                        />

                        <SelectField
                          label="Currency"
                          value={offer.currency}
                          onChange={(value) =>
                            updateOffer(
                              yacht.id,
                              "currency",
                              value
                            )
                          }
                        >
                          <option value="EUR">EUR</option>
                          <option value="USD">USD</option>
                          <option value="GBP">GBP</option>
                          <option value="CHF">CHF</option>
                        </SelectField>
                      </div>

                      <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card/50 p-4 sm:grid-cols-3">
                        <MiniSummary
                          label="Imported low rate"
                          value={formatRate(
                            yacht.rates.lowestWeeklyRate,
                            yacht.rates.currency
                          )}
                        />
                        <MiniSummary
                          label="Charter dates"
                          value={
                            form.startDate && form.endDate
                              ? formatDateRange(
                                  form.startDate,
                                  form.endDate
                                )
                              : "Not selected"
                          }
                        />
                        <MiniSummary
                          label="Estimated total"
                          value={
                            estimatedTotal !== null
                              ? formatRate(
                                  estimatedTotal,
                                  offer.currency
                                )
                              : "Not calculated"
                          }
                        />
                      </div>
                    </div>
                  )
                )}
              </div>
            </FormPanel>

            <FormPanel
              title="Proposal notes"
              description="Add itinerary ideas, special requirements, exclusions or broker notes."
            >
              <textarea
                value={form.notes}
                onChange={(event) =>
                  updateField("notes", event.target.value)
                }
                rows={8}
                placeholder="Add itinerary ideas, special requirements, exclusions or broker notes..."
                className="ui-input w-full resize-y rounded-xl px-4 py-3 text-sm leading-6"
              />
            </FormPanel>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <FormPanel
              title="Proposal summary"
              description="One client-facing proposal, multiple yacht choices."
            >
              <div className="space-y-4">
                <SummaryRow
                  label="Client"
                  value={form.clientName || "Not entered"}
                />
                <SummaryRow
                  label="Destination"
                  value={
                    inquiry?.destination ||
                    searchParams.get("destination") ||
                    "Not entered"
                  }
                />
                <SummaryRow
                  label="Guests"
                  value={form.guests || "Not entered"}
                />
                <SummaryRow
                  label="Charter dates"
                  value={
                    form.startDate && form.endDate
                      ? formatDateRange(
                          form.startDate,
                          form.endDate
                        )
                      : "Not selected"
                  }
                />
                <SummaryRow
                  label="Yacht options"
                  value={`${proposalYachts.length} of 3`}
                />

                <div className="border-t border-border pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                    Shortlist
                  </p>

                  <div className="mt-3 space-y-3">
                    {proposalYachts.map(
                      ({
                        yacht,
                        offer,
                        position,
                        estimatedTotal,
                      }) => (
                        <div
                          key={yacht.id}
                          className="rounded-xl border border-border bg-background/45 p-3"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                Option {position}
                              </p>
                              <p className="mt-1 truncate text-sm font-semibold text-foreground">
                                {yacht.name}
                              </p>
                            </div>

                            <p className="shrink-0 text-right text-xs font-semibold text-foreground">
                              {offer.weeklyRate
                                ? formatRate(
                                    Number(
                                      offer.weeklyRate
                                    ),
                                    offer.currency
                                  )
                                : "Rate on request"}
                            </p>
                          </div>

                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Estimated charter total:{" "}
                            {estimatedTotal !== null
                              ? formatRate(
                                  estimatedTotal,
                                  offer.currency
                                )
                              : "Not calculated"}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                </div>

                <p className="border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
                  Taxes, APA and additional fees are not included unless
                  specifically stated in the proposal notes.
                </p>
              </div>
            </FormPanel>

            <FormPanel
              title="Selected yachts"
              description="The order below becomes the proposal order."
            >
              <div className="space-y-3">
                {proposalYachts.map(
                  ({ yacht, position }) => (
                    <div
                      key={yacht.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-background/45 p-3"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-[linear-gradient(135deg,var(--hero-start),var(--hero-middle),var(--hero-end))]">
                        <span className="text-xs font-bold text-cyan-700 dark:text-cyan-300">
                          {position}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {yacht.name}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {yacht.sources[0]?.name ??
                            "Connected yacht"}
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>
            </FormPanel>

            <button
              type="submit"
              disabled={
                isSubmitting ||
                proposalYachts.length === 0
              }
              className="ui-primary-button apple-transition inline-flex min-h-13 w-full items-center justify-center rounded-xl px-5 py-3.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting
                ? "Saving proposal..."
                : `Save ${proposalYachts.length}-yacht proposal draft`}
            </button>

            <p className="text-center text-xs leading-5 text-muted-foreground">
              All selected yachts will be stored under one proposal.
            </p>
          </aside>
        </form>
      </div>
    </main>
  );
}

function FormPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="ui-panel rounded-[24px] p-5 sm:p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  error,
  required = false,
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
  required?: boolean;
  min?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground/80">
        {label}
        {required ? (
          <span className="ml-1 text-cyan-700 dark:text-cyan-300">
            *
          </span>
        ) : null}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        min={min}
        step={step}
        required={required}
        className={`mt-2 h-12 w-full rounded-xl border bg-background/55 px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:ring-2 ${
          error
            ? "border-red-500/40 focus:border-red-500/60 focus:ring-red-500/10"
            : "border-border focus:border-cyan-500/40 focus:ring-cyan-500/10"
        }`}
      />

      {error ? (
        <span className="mt-2 block text-xs text-red-700 dark:text-red-300">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground/80">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="ui-input mt-2 h-12 rounded-xl px-4 text-sm"
      >
        {children}
      </select>
    </label>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-5">
      <p className="text-sm text-muted-foreground">
        {label}
      </p>
      <p className="max-w-[220px] text-right text-sm font-semibold text-foreground/85">
        {value}
      </p>
    </div>
  );
}

function MiniSummary({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function AvailabilityPill({
  status,
}: {
  status: YachtStatus | "unverified";
}) {
  const positive =
    status === "available";

  const warning =
    status === "provisional" ||
    status === "option";

  const label = {
    available: "Available",
    provisional: "Provisional",
    option: "Option",
    booked: "Booked",
    unavailable: "Unavailable",
    maintenance: "Maintenance",
    no_availability: "No availability",
    unverified: "Unverified",
  }[status];

  return (
    <span
      className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
        positive
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
          : warning
            ? "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200"
            : "border-border bg-background/55 text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}

function ProposalSkeleton() {
  return (
    <main className="min-h-full bg-background px-5 py-7 sm:px-7 lg:px-8">
      <div className="mx-auto max-w-[1500px] animate-pulse space-y-7">
        <div className="h-10 w-40 rounded-xl bg-muted" />
        <div className="h-64 rounded-[28px] bg-muted" />
        <div className="grid gap-6 [&>*]:min-w-0 xl:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            <div className="h-72 rounded-2xl bg-muted" />
            <div className="h-96 rounded-2xl bg-muted" />
          </div>
          <div className="h-[620px] rounded-2xl bg-muted" />
        </div>
      </div>
    </main>
  );
}

function findBestAvailabilityWindow(
  yacht: YachtDetail,
  startDate: string,
  endDate: string
) {
  const futureAvailable =
    yacht.availability.filter(
      (window) =>
        window.status === "available" &&
        !window.isPast
    );

  if (!startDate || !endDate) {
    return futureAvailable[0] ?? null;
  }

  return (
    futureAvailable.find(
      (window) =>
        window.startDate <= startDate &&
        window.endDate >= endDate
    ) ??
    futureAvailable.find(
      (window) =>
        window.startDate <= endDate &&
        window.endDate >= startDate
    ) ??
    futureAvailable[0] ??
    null
  );
}

function calculateEstimatedTotal(
  weeklyRateValue: string,
  startDate: string,
  endDate: string
): number | null {
  const weeklyRate = Number(weeklyRateValue);

  if (
    !Number.isFinite(weeklyRate) ||
    weeklyRate <= 0 ||
    !startDate ||
    !endDate
  ) {
    return null;
  }

  const start =
    new Date(`${startDate}T00:00:00`);
  const end =
    new Date(`${endDate}T00:00:00`);

  const duration =
    end.getTime() - start.getTime();

  if (duration <= 0) {
    return null;
  }

  const days =
    Math.ceil(duration / 86_400_000);

  return weeklyRate * (days / 7);
}

function buildInquiryNotes(
  inquiry: InquiryListItem,
  existingNotes: string
): string {
  const sections: string[] = [];

  if (inquiry.destination) {
    sections.push(
      `Destination: ${inquiry.destination}`
    );
  }

  if (inquiry.preferences) {
    sections.push(
      `Client preferences: ${inquiry.preferences}`
    );
  }

  if (
    inquiry.budget_min !== null ||
    inquiry.budget_max !== null
  ) {
    sections.push(
      `Client budget: ${formatBudgetRange(
        inquiry.budget_min,
        inquiry.budget_max,
        inquiry.currency
      )}`
    );
  }

  if (inquiry.original_inquiry) {
    sections.push(
      `Original inquiry:\n${inquiry.original_inquiry}`
    );
  }

  if (existingNotes.trim()) {
    sections.push(existingNotes.trim());
  }

  return sections.join("\n\n");
}

function formatBudgetRange(
  minimum: number | null,
  maximum: number | null,
  currency: string | null
): string {
  const code = currency || "EUR";

  const format = (value: number | null) =>
    value === null
      ? "?"
      : new Intl.NumberFormat("en-GB", {
          style: "currency",
          currency: code,
          maximumFractionDigits: 0,
        }).format(value);

  if (
    minimum !== null &&
    maximum !== null &&
    minimum === maximum
  ) {
    return format(minimum);
  }

  return `${format(minimum)} – ${format(maximum)}`;
}

function validateProposalForm(
  form: ProposalFormState
): FormErrors {
  const errors: FormErrors = {};

  if (!form.clientName.trim()) {
    errors.clientName =
      "Enter the client's name.";
  }

  if (!form.clientEmail.trim()) {
    errors.clientEmail =
      "Enter the client's email address.";
  } else if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      form.clientEmail.trim()
    )
  ) {
    errors.clientEmail =
      "Enter a valid email address.";
  }

  const guests = Number(form.guests);

  if (!form.guests.trim()) {
    errors.guests =
      "Enter the number of guests.";
  } else if (
    !Number.isInteger(guests) ||
    guests < 1
  ) {
    errors.guests =
      "Guests must be a whole number above zero.";
  }

  if (!form.startDate) {
    errors.startDate =
      "Select a start date.";
  }

  if (!form.endDate) {
    errors.endDate =
      "Select an end date.";
  }

  if (
    form.startDate &&
    form.endDate &&
    form.endDate <= form.startDate
  ) {
    errors.endDate =
      "The end date must be after the start date.";
  }

  return errors;
}

function mapServerFieldErrors(
  fieldErrors: Record<string, string>
): FormErrors {
  const mapped: FormErrors = {};

  const supportedFields:
    Array<keyof ProposalFormState> = [
      "clientName",
      "clientEmail",
      "clientPhone",
      "startDate",
      "endDate",
      "guests",
      "notes",
    ];

  for (const field of supportedFields) {
    if (fieldErrors[field]) {
      mapped[field] = fieldErrors[field];
    }
  }

  return mapped;
}

function formatRate(
  amount: number | null,
  currency: string
): string {
  if (
    amount === null ||
    !Number.isFinite(amount)
  ) {
    return "Rate on request";
  }

  try {
    return new Intl.NumberFormat(
      "en-GB",
      {
        style: "currency",
        currency: currency || "EUR",
        maximumFractionDigits: 0,
      }
    ).format(amount);
  } catch {
    return `${
      currency || "EUR"
    } ${amount.toLocaleString()}`;
  }
}

function formatDateRange(
  startDate: string,
  endDate: string
): string {
  const start =
    new Date(`${startDate}T00:00:00`);

  const end =
    new Date(`${endDate}T00:00:00`);

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