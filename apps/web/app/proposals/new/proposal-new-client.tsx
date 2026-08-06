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

type YachtDetailResponse = {
  success: boolean;
  yacht: {
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
  weeklyRate: string;
  currency: string;
  notes: string;
};

type FormErrors = Partial<Record<keyof ProposalFormState, string>>;

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
  weeklyRate: "",
  currency: "EUR",
  notes: "",
};

export default function NewProposalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const yachtId = searchParams.get("yachtId");
  const inquiryId = searchParams.get("inquiryId");

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

  const [data, setData] =
    useState<YachtDetailResponse | null>(null);

  const [inquiry, setInquiry] =
    useState<InquiryListItem | null>(null);

  const [form, setForm] =
    useState<ProposalFormState>(() => ({
      ...initialForm,
      startDate: requestedStartDate,
      endDate: requestedEndDate,
      guests: requestedGuests,
      weeklyRate: requestedWeeklyRate,
      currency: requestedCurrency,
    }));

  const [errors, setErrors] = useState<FormErrors>({});

  const [isYachtLoading, setIsYachtLoading] =
    useState(Boolean(yachtId));

  const [isInquiryLoading, setIsInquiryLoading] =
    useState(Boolean(inquiryId));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const loadYacht = useCallback(async () => {
    if (!yachtId) {
      setIsYachtLoading(false);
      return;
    }

    try {
      setIsYachtLoading(true);
      setPageError(null);

      const response = await fetch(
        `/api/fleet/${encodeURIComponent(yachtId)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result = (await response.json()) as YachtDetailResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Could not load yacht.");
      }

      setData(result);

      const firstAvailableWindow = result.yacht.availability.find(
        (window) => window.status === "available" && !window.isPast
      );

      const suggestedRate =
        firstAvailableWindow?.weeklyRate ??
        result.yacht.rates.lowestWeeklyRate;

      setForm((current) => ({
        ...current,
        startDate:
          current.startDate ||
          firstAvailableWindow?.startDate ||
          "",
        endDate:
          current.endDate ||
          firstAvailableWindow?.endDate ||
          "",
        weeklyRate:
          current.weeklyRate ||
          (suggestedRate !== null &&
          suggestedRate !== undefined
            ? String(suggestedRate)
            : ""),
        currency:
          current.currency ||
          firstAvailableWindow?.currency ||
          result.yacht.rates.currency ||
          "EUR",
      }));
    } catch (loadError) {
      setPageError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load yacht."
      );
    } finally {
      setIsYachtLoading(false);
    }
  }, [yachtId]);

  useEffect(() => {
    void loadYacht();
  }, [loadYacht]);

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
        currency:
          matchedInquiry.currency ??
          current.currency,
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

  const availableWindows = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.yacht.availability.filter(
      (window) => window.status === "available" && !window.isPast
    );
  }, [data]);

  const estimatedTotal = useMemo(() => {
    const weeklyRate = Number(form.weeklyRate);

    if (
      !Number.isFinite(weeklyRate) ||
      weeklyRate <= 0 ||
      !form.startDate ||
      !form.endDate
    ) {
      return null;
    }

    const start = new Date(`${form.startDate}T00:00:00`);
    const end = new Date(`${form.endDate}T00:00:00`);
    const duration = end.getTime() - start.getTime();

    if (duration <= 0) {
      return null;
    }

    const days = Math.ceil(duration / 86_400_000);
    return weeklyRate * (days / 7);
  }, [form.endDate, form.startDate, form.weeklyRate]);

  function updateField(field: keyof ProposalFormState, value: string) {
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

  function selectAvailabilityWindow(windowId: string) {
    const selectedWindow = availableWindows.find(
      (window) => window.id === windowId
    );

    if (!selectedWindow) {
      return;
    }

    setForm((current) => ({
      ...current,
      startDate: selectedWindow.startDate,
      endDate: selectedWindow.endDate,
      weeklyRate:
        selectedWindow.weeklyRate !== null
          ? String(selectedWindow.weeklyRate)
          : current.weeklyRate,
      currency: selectedWindow.currency || current.currency,
    }));

    setErrors((current) => ({
      ...current,
      startDate: undefined,
      endDate: undefined,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateProposalForm(form);
    setErrors(nextErrors);
    setPageError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (!yachtId || !data) {
      setPageError("A yacht must be selected before saving the proposal.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          yachtId,
          inquiryId: inquiryId || null,
          clientName: form.clientName.trim(),
          clientEmail: form.clientEmail.trim(),
          clientPhone: form.clientPhone.trim() || null,
          startDate: form.startDate,
          endDate: form.endDate,
          guests: Number(form.guests),
          weeklyRate: form.weeklyRate.trim()
            ? Number(form.weeklyRate)
            : null,
          estimatedTotal,
          currency: form.currency,
          notes: form.notes.trim() || null,
        }),
      });

      const result = (await response.json()) as CreateProposalResponse;

      if (!response.ok || !result.success) {
        if (result.fieldErrors) {
          setErrors(mapServerFieldErrors(result.fieldErrors));
        }

        throw new Error(result.error ?? "Could not save proposal.");
      }

      if (!result.proposal?.id) {
        throw new Error(
          "The proposal was saved, but no record ID was returned."
        );
      }

      router.push(
        `/proposals?created=${encodeURIComponent(result.proposal.id)}`
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

  return (
    <main className="min-h-full bg-[#05070b] px-5 py-7 text-white sm:px-7 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href={
              inquiryId
                ? `/workspace/inquiry/${inquiryId}`
                : yachtId
                  ? `/fleet/${yachtId}`
                  : "/proposals"
            }
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-white"
          >
            <span>←</span>
            {inquiryId
              ? "Back to inquiry"
              : yachtId
                ? "Back to yacht"
                : "Back to proposals"}
          </Link>

          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
            Draft
          </span>
        </div>

        <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#102034] via-[#09121d] to-[#05070b] p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.8)]" />
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-400">
                Proposal Builder
              </p>
            </div>

            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl xl:text-5xl">
              Create a charter proposal
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              Prepare the yacht, charter period, client information and
              commercial details before generating the final proposal.
            </p>
          </div>
        </section>

        {pageError ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {pageError}
          </div>
        ) : null}

        {!yachtId ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6">
            <h2 className="font-semibold text-amber-100">
              No yacht selected
            </h2>
            <p className="mt-2 text-sm leading-6 text-amber-200/70">
              Open a yacht from Fleet Intelligence and select Create proposal.
            </p>
            <Link
              href="/fleet"
              className="mt-5 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-slate-200"
            >
              Browse fleet
            </Link>
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="grid gap-6 xl:grid-cols-[1fr_420px]"
        >
          <div className="space-y-6">
            <FormPanel
              title="Client information"
              description="Who will receive this proposal?"
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  label="Client name"
                  value={form.clientName}
                  onChange={(value) => updateField("clientName", value)}
                  placeholder="Jane Thompson"
                  error={errors.clientName}
                  required
                />

                <TextField
                  label="Client email"
                  value={form.clientEmail}
                  onChange={(value) => updateField("clientEmail", value)}
                  placeholder="jane@example.com"
                  type="email"
                  error={errors.clientEmail}
                  required
                />

                <TextField
                  label="Client phone"
                  value={form.clientPhone}
                  onChange={(value) => updateField("clientPhone", value)}
                  placeholder="+44 7700 900000"
                />

                <TextField
                  label="Number of guests"
                  value={form.guests}
                  onChange={(value) => updateField("guests", value)}
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
              description="Choose an imported window or enter custom dates."
            >
              {availableWindows.length > 0 ? (
                <div>
                  <label className="text-sm font-medium text-slate-300">
                    Imported available windows
                  </label>
                  <select
                    defaultValue=""
                    onChange={(event) =>
                      selectAvailabilityWindow(event.target.value)
                    }
                    className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-[#080b10] px-4 text-sm text-slate-300 outline-none transition focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/10"
                  >
                    <option value="">Select an available window</option>
                    {availableWindows.map((window) => (
                      <option key={window.id} value={window.id}>
                        {formatDateRange(window.startDate, window.endDate)} ·{" "}
                        {formatRate(window.weeklyRate, window.currency)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100">
                  This yacht has no future available windows. Custom dates may
                  still be entered.
                </div>
              )}

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <TextField
                  label="Start date"
                  value={form.startDate}
                  onChange={(value) => updateField("startDate", value)}
                  type="date"
                  error={errors.startDate}
                  required
                />

                <TextField
                  label="End date"
                  value={form.endDate}
                  onChange={(value) => updateField("endDate", value)}
                  type="date"
                  min={form.startDate || undefined}
                  error={errors.endDate}
                  required
                />
              </div>
            </FormPanel>

            <FormPanel
              title="Commercial details"
              description="Review the imported rate or enter a custom offer."
            >
              <div className="grid gap-5 sm:grid-cols-[1fr_160px]">
                <TextField
                  label="Weekly charter rate"
                  value={form.weeklyRate}
                  onChange={(value) => updateField("weeklyRate", value)}
                  placeholder="18500"
                  type="number"
                  min="0"
                  step="0.01"
                  error={errors.weeklyRate}
                />

                <SelectField
                  label="Currency"
                  value={form.currency}
                  onChange={(value) => updateField("currency", value)}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="CHF">CHF</option>
                </SelectField>
              </div>

              <div className="mt-5">
                <label className="text-sm font-medium text-slate-300">
                  Proposal notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                  rows={7}
                  placeholder="Add itinerary ideas, special requirements, exclusions or broker notes..."
                  className="mt-2 w-full resize-y rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-700 focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/10"
                />
              </div>
            </FormPanel>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <FormPanel
              title="Proposal summary"
              description="Review the selected commercial details."
            >
              <div className="space-y-4">
                <SummaryRow
                  label="Yacht"
                  value={data?.yacht.name ?? "No yacht selected"}
                />
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
                      ? formatDateRange(form.startDate, form.endDate)
                      : "Not selected"
                  }
                />
                <SummaryRow
                  label="Weekly rate"
                  value={
                    form.weeklyRate
                      ? formatRate(Number(form.weeklyRate), form.currency)
                      : "Rate on request"
                  }
                />

                <div className="border-t border-white/[0.07] pt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">
                    Estimated charter total
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {estimatedTotal !== null
                      ? formatRate(estimatedTotal, form.currency)
                      : "Not calculated"}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">
                    Taxes, APA and additional fees are not included.
                  </p>
                </div>
              </div>
            </FormPanel>

            {data ? (
              <FormPanel
                title="Selected yacht"
                description="Imported fleet information"
              >
                <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-[#122031] via-[#0c141f] to-[#080b10]">
                  <YachtIllustration />
                </div>
                <p className="mt-4 text-xl font-semibold text-white">
                  {data.yacht.name}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {data.yacht.sources[0]?.name ?? "No connected source"}
                </p>
              </FormPanel>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || !yachtId || !data}
              className="inline-flex min-h-13 w-full items-center justify-center rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting ? "Saving proposal..." : "Save proposal draft"}
            </button>

            <p className="text-center text-xs leading-5 text-slate-700">
              This proposal will be stored in the workspace database.
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
    <section className="rounded-2xl border border-white/[0.08] bg-[#0b0f16] p-5 shadow-xl shadow-black/10 sm:p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
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
      <span className="text-sm font-medium text-slate-300">
        {label}
        {required ? <span className="ml-1 text-sky-400">*</span> : null}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        min={min}
        step={step}
        required={required}
        className={`mt-2 h-12 w-full rounded-xl border bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-slate-700 focus:ring-2 ${
          error
            ? "border-red-400/40 focus:border-red-400/60 focus:ring-red-400/10"
            : "border-white/[0.08] focus:border-sky-400/40 focus:ring-sky-400/10"
        }`}
      />

      {error ? (
        <span className="mt-2 block text-xs text-red-300">{error}</span>
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
      <span className="text-sm font-medium text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-[#080b10] px-4 text-sm text-slate-300 outline-none transition focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/10"
      >
        {children}
      </select>
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-5">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="max-w-[220px] text-right text-sm font-semibold text-slate-300">
        {value}
      </p>
    </div>
  );
}

function ProposalSkeleton() {
  return (
    <main className="min-h-full bg-[#05070b] px-5 py-7 sm:px-7 lg:px-8">
      <div className="mx-auto max-w-[1500px] animate-pulse space-y-7">
        <div className="h-10 w-40 rounded-xl bg-white/[0.04]" />
        <div className="h-64 rounded-[28px] bg-white/[0.04]" />
        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            <div className="h-72 rounded-2xl bg-white/[0.04]" />
            <div className="h-72 rounded-2xl bg-white/[0.04]" />
          </div>
          <div className="h-[520px] rounded-2xl bg-white/[0.04]" />
        </div>
      </div>
    </main>
  );
}

function YachtIllustration() {
  return (
    <svg
      viewBox="0 0 300 140"
      fill="none"
      className="relative h-28 w-60 text-sky-300"
      aria-hidden="true"
    >
      <path
        d="M32 93h232l-22 28H62L32 93Z"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M82 93V51h105l44 42"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M110 51V26h52v25"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M0 130c32-9 53-9 85 0 32 9 53 9 85 0 32-9 53-9 85 0 16 5 29 6 45 4"
        stroke="currentColor"
        strokeWidth="3"
      />
    </svg>
  );
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

function validateProposalForm(form: ProposalFormState): FormErrors {
  const errors: FormErrors = {};

  if (!form.clientName.trim()) {
    errors.clientName = "Enter the client's name.";
  }

  if (!form.clientEmail.trim()) {
    errors.clientEmail = "Enter the client's email address.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.clientEmail.trim())) {
    errors.clientEmail = "Enter a valid email address.";
  }

  const guests = Number(form.guests);

  if (!form.guests.trim()) {
    errors.guests = "Enter the number of guests.";
  } else if (!Number.isInteger(guests) || guests < 1) {
    errors.guests = "Guests must be a whole number above zero.";
  }

  if (!form.startDate) {
    errors.startDate = "Select a start date.";
  }

  if (!form.endDate) {
    errors.endDate = "Select an end date.";
  }

  if (form.startDate && form.endDate && form.endDate <= form.startDate) {
    errors.endDate = "The end date must be after the start date.";
  }

  if (
    form.weeklyRate &&
    (!Number.isFinite(Number(form.weeklyRate)) || Number(form.weeklyRate) < 0)
  ) {
    errors.weeklyRate = "Enter a valid weekly rate.";
  }

  return errors;
}

function mapServerFieldErrors(
  fieldErrors: Record<string, string>
): FormErrors {
  const mapped: FormErrors = {};

  const supportedFields: Array<keyof ProposalFormState> = [
    "clientName",
    "clientEmail",
    "clientPhone",
    "startDate",
    "endDate",
    "guests",
    "weeklyRate",
    "currency",
    "notes",
  ];

  for (const field of supportedFields) {
    if (fieldErrors[field]) {
      mapped[field] = fieldErrors[field];
    }
  }

  return mapped;
}

function formatRate(amount: number | null, currency: string): string {
  if (amount === null || !Number.isFinite(amount)) {
    return "Rate on request";
  }

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency || "EUR"} ${amount.toLocaleString()}`;
  }
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  return `${start.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })} – ${end.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}