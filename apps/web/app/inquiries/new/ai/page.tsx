"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { HeroCard } from "@/components/ui/hero-card";
import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";

type ExtractedInquiry = {
  client_name: string | null;
  client_type: string | null;
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
  source: string | null;
  extraction_confidence: number;
  missing_information: string[];
  suggested_question: string | null;
};

const emptyInquiry: ExtractedInquiry = {
  client_name: null,
  client_type: null,
  email: null,
  phone: null,
  destination: null,
  start_date: null,
  end_date: null,
  guests: null,
  budget_min: null,
  budget_max: null,
  currency: null,
  preferences: null,
  source: null,
  extraction_confidence: 0,
  missing_information: [],
  suggested_question: null,
};

const sampleInquiry = `Hi, my name is Daniel Morgan.

I am looking for a yacht in Croatia from 12 August 2027 until 19 August 2027 for 8 guests.

Our budget is between €70,000 and €90,000.

We would prefer a modern yacht with a jacuzzi, jet skis, and a large beach club.

You can reach me at daniel@example.com.`;

function normalizeConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  const percentage =
    value <= 1 ? value * 100 : value;

  return Math.round(
    Math.min(100, Math.max(0, percentage))
  );
}

export default function AIImportPage() {
  const router = useRouter();

  const [inquiryText, setInquiryText] =
    useState("");

  const [result, setResult] =
    useState<ExtractedInquiry | null>(null);

  const [draft, setDraft] =
    useState<ExtractedInquiry>(emptyInquiry);

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] =
    useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [isEditing, setIsEditing] =
    useState(false);

  const preferences = useMemo(() => {
    if (!draft.preferences) {
      return [];
    }

    return draft.preferences
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }, [draft.preferences]);

  const confidencePercentage =
    normalizeConfidence(
      draft.extraction_confidence
    );

  const canExtract =
    inquiryText.trim().length >= 20 &&
    !isLoading;

  const canSave =
    Boolean(draft.client_name?.trim()) &&
    Boolean(draft.destination?.trim()) &&
    !isSaving;

  async function handleExtract() {
    setError("");
    setResult(null);
    setIsLoading(true);
    setIsEditing(false);

    try {
      const response = await fetch(
        "/api/inquiries/extract",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inquiryText,
          }),
        }
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Could not extract inquiry."
        );
      }

      if (!payload.data) {
        throw new Error(
          "The extraction returned no data."
        );
      }

      const extracted =
        payload.data as ExtractedInquiry;

      setResult(extracted);
      setDraft(extracted);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while extracting the inquiry."
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateInquiry() {
    setError("");
    setIsSaving(true);

    try {
      const response = await fetch(
        "/api/inquiries/create",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inquiry: draft,
            original_inquiry: inquiryText,
          }),
        }
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            "Could not create inquiry."
        );
      }

      if (!payload.id) {
        throw new Error(
          "Inquiry was saved, but no inquiry ID was returned."
        );
      }

      router.push(
        `/workspace/inquiry/${payload.id}`
      );

      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while saving the inquiry."
      );
    } finally {
      setIsSaving(false);
    }
  }

  function updateField<
    K extends keyof ExtractedInquiry
  >(
    field: K,
    value: ExtractedInquiry[K]
  ) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetImport() {
    setInquiryText("");
    setResult(null);
    setDraft(emptyInquiry);
    setError("");
    setIsEditing(false);
  }

  return (
    <PageContainer contentClassName="max-w-[1500px] space-y-7">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Link
          href="/inquiries"
          className="apple-transition hover:text-foreground"
        >
          Inquiries
        </Link>

        <span>/</span>

        <Link
          href="/inquiries/new"
          className="apple-transition hover:text-foreground"
        >
          New inquiry
        </Link>

        <span>/</span>

        <span className="font-medium text-foreground">
          AI import
        </span>
      </div>

      <HeroCard
        eyebrow="AI inquiry intake"
        title="Turn messages into structured inquiries"
        description="Paste an email, WhatsApp message or copied conversation. Bahari OS extracts the client, destination, dates, budget and preferences for broker review."
        actions={
          <>
            <Link
              href="/inquiries/new/manual"
              className="apple-transition inline-flex min-h-11 items-center justify-center rounded-[0.9rem] border border-current/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-[var(--hero-foreground)] hover:-translate-y-0.5 hover:bg-white/10"
            >
              Manual entry
            </Link>

            {result ? (
              <button
                type="button"
                onClick={resetImport}
                className="ui-primary-button apple-transition min-h-11 px-5 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
              >
                New import
              </button>
            ) : null}
          </>
        }
      />

      {error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(520px,1.1fr)]">
        <section className="ui-panel overflow-hidden rounded-[26px]">
          <div className="flex items-center justify-between border-b border-border px-6 py-5">
            <div>
              <p className="font-heading text-2xl leading-none tracking-[0.05em] text-foreground">
                Source message
              </p>

              <p className="mt-2 text-xs text-muted-foreground">
                Email, WhatsApp, form or copied conversation
              </p>
            </div>

            <span className="rounded-full border border-border bg-muted/55 px-3 py-1.5 text-xs text-muted-foreground">
              {inquiryText.length.toLocaleString()}{" "}
              characters
            </span>
          </div>

          <div className="p-6">
            <textarea
              value={inquiryText}
              onChange={(event) =>
                setInquiryText(
                  event.target.value
                )
              }
              placeholder="Paste the client inquiry here..."
              className="ui-input min-h-[430px] resize-none px-5 py-5 text-[15px] leading-7"
            />

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() =>
                  setInquiryText(sampleInquiry)
                }
                disabled={isLoading}
                className="apple-transition text-left text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                Use example inquiry
              </button>

              <button
                type="button"
                onClick={handleExtract}
                disabled={!canExtract}
                className="ui-primary-button apple-transition inline-flex min-w-[190px] items-center justify-center gap-2 px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {isLoading
                  ? "Extracting..."
                  : "✦ Extract inquiry"}
              </button>
            </div>
          </div>
        </section>

        <section className="ui-panel min-h-[620px] overflow-hidden rounded-[26px]">
          {!result && !isLoading ? (
            <EmptyState />
          ) : null}

          {isLoading ? (
            <LoadingState />
          ) : null}

          {result ? (
            <div>
              <div className="flex flex-col gap-4 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-heading text-2xl leading-none tracking-[0.05em] text-foreground">
                    Extraction complete
                  </p>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Review and correct the fields before saving
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-800 dark:text-cyan-200">
                    {confidencePercentage}%
                    confidence
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setIsEditing(
                        (current) => !current
                      )
                    }
                    className="ui-secondary-button apple-transition px-4 py-2 text-sm font-medium hover:bg-accent"
                  >
                    {isEditing
                      ? "Finish editing"
                      : "Edit fields"}
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(100vh-240px)] overflow-y-auto px-6 py-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditableTextField
                    label="Client name"
                    value={draft.client_name}
                    editing={isEditing}
                    onChange={(value) =>
                      updateField(
                        "client_name",
                        value
                      )
                    }
                  />

                  <EditableTextField
                    label="Client type"
                    value={draft.client_type}
                    editing={isEditing}
                    onChange={(value) =>
                      updateField(
                        "client_type",
                        value
                      )
                    }
                  />

                  <EditableTextField
                    label="Email"
                    value={draft.email}
                    editing={isEditing}
                    inputType="email"
                    onChange={(value) =>
                      updateField("email", value)
                    }
                  />

                  <EditableTextField
                    label="Phone"
                    value={draft.phone}
                    editing={isEditing}
                    inputType="tel"
                    onChange={(value) =>
                      updateField("phone", value)
                    }
                  />

                  <EditableTextField
                    label="Destination"
                    value={draft.destination}
                    editing={isEditing}
                    onChange={(value) =>
                      updateField(
                        "destination",
                        value
                      )
                    }
                  />

                  <EditableNumberField
                    label="Guests"
                    value={draft.guests}
                    editing={isEditing}
                    onChange={(value) =>
                      updateField("guests", value)
                    }
                  />

                  <EditableDateField
                    label="Start date"
                    value={draft.start_date}
                    editing={isEditing}
                    onChange={(value) =>
                      updateField(
                        "start_date",
                        value
                      )
                    }
                  />

                  <EditableDateField
                    label="End date"
                    value={draft.end_date}
                    editing={isEditing}
                    onChange={(value) =>
                      updateField(
                        "end_date",
                        value
                      )
                    }
                  />

                  <EditableNumberField
                    label="Budget minimum"
                    value={draft.budget_min}
                    editing={isEditing}
                    onChange={(value) =>
                      updateField(
                        "budget_min",
                        value
                      )
                    }
                  />

                  <EditableNumberField
                    label="Budget maximum"
                    value={draft.budget_max}
                    editing={isEditing}
                    onChange={(value) =>
                      updateField(
                        "budget_max",
                        value
                      )
                    }
                  />

                  <EditableTextField
                    label="Currency"
                    value={draft.currency}
                    editing={isEditing}
                    onChange={(value) =>
                      updateField(
                        "currency",
                        value
                          ? value.toUpperCase()
                          : null
                      )
                    }
                  />

                  <EditableTextField
                    label="Source"
                    value={draft.source}
                    editing={isEditing}
                    onChange={(value) =>
                      updateField("source", value)
                    }
                  />
                </div>

                <ReviewSection title="Preferences">
                  {isEditing ? (
                    <textarea
                      value={
                        draft.preferences ?? ""
                      }
                      onChange={(event) =>
                        updateField(
                          "preferences",
                          event.target.value ||
                            null
                        )
                      }
                      placeholder="Modern yacht, jacuzzi, jet skis..."
                      className="ui-input mt-3 min-h-24 resize-none p-3 text-sm"
                    />
                  ) : preferences.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {preferences.map(
                        (preference) => (
                          <span
                            key={preference}
                            className="rounded-full border border-border bg-accent/70 px-3 py-1.5 text-xs text-foreground/80"
                          >
                            {preference}
                          </span>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No preferences provided.
                    </p>
                  )}
                </ReviewSection>

                <ReviewSection title="Missing information">
                  {draft.missing_information
                    .length ? (
                    <div className="mt-4 space-y-2">
                      {draft.missing_information.map(
                        (item) => (
                          <div
                            key={item}
                            className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
                          >
                            {item}
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-emerald-800 dark:text-emerald-200">
                      No important information appears to be missing.
                    </p>
                  )}
                </ReviewSection>

                {draft.suggested_question ? (
                  <ReviewSection title="Suggested follow-up">
                    <p className="mt-4 text-base leading-7 text-foreground/85">
                      “
                      {
                        draft.suggested_question
                      }
                      ”
                    </p>
                  </ReviewSection>
                ) : null}

                <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row">
                  <button
                    type="button"
                    onClick={() =>
                      setIsEditing(true)
                    }
                    className="ui-secondary-button apple-transition flex-1 px-5 py-3 text-sm font-semibold hover:bg-accent"
                  >
                    Edit fields
                  </button>

                  <button
                    type="button"
                    onClick={
                      handleCreateInquiry
                    }
                    disabled={!canSave}
                    className="ui-primary-button apple-transition flex-1 px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isSaving
                      ? "Creating inquiry..."
                      : "Create inquiry"}
                  </button>
                </div>

                {!draft.client_name?.trim() ||
                !draft.destination?.trim() ? (
                  <p className="mt-3 text-center text-xs text-amber-900 dark:text-amber-200">
                    Client name and destination are required before saving.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </PageContainer>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-[620px] items-center justify-center px-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex size-16 items-center justify-center rounded-[22px] border border-border bg-accent/60 text-2xl text-foreground">
          ✦
        </div>

        <h2 className="mt-6 font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
          Ready to read the inquiry
        </h2>

        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The extracted charter details will appear here for broker review.
        </p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[620px] items-center justify-center px-8 text-center">
      <div>
        <div className="mx-auto size-12 animate-spin rounded-full border-4 border-border border-t-primary" />

        <h2 className="mt-6 font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
          Reading the inquiry
        </h2>

        <p className="mt-3 text-sm text-muted-foreground">
          Extracting client, destination, dates, guests, budget and preferences.
        </p>
      </div>
    </div>
  );
}

function EditableTextField({
  label,
  value,
  editing,
  inputType = "text",
  onChange,
}: {
  label: string;
  value: string | null;
  editing: boolean;
  inputType?: "text" | "email" | "tel";
  onChange: (value: string | null) => void;
}) {
  return (
    <FieldShell label={label}>
      {editing ? (
        <input
          type={inputType}
          value={value ?? ""}
          onChange={(event) =>
            onChange(
              event.target.value || null
            )
          }
          className="ui-input mt-2 h-10 px-3 text-sm"
        />
      ) : (
        <p
          className={`mt-2 truncate text-sm font-medium ${
            value
              ? "text-foreground"
              : "text-muted-foreground/55"
          }`}
        >
          {value || "Not provided"}
        </p>
      )}
    </FieldShell>
  );
}

function EditableNumberField({
  label,
  value,
  editing,
  onChange,
}: {
  label: string;
  value: number | null;
  editing: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <FieldShell label={label}>
      {editing ? (
        <input
          type="number"
          min="0"
          value={value ?? ""}
          onChange={(event) =>
            onChange(
              event.target.value
                ? Number(event.target.value)
                : null
            )
          }
          className="ui-input mt-2 h-10 px-3 text-sm"
        />
      ) : (
        <p
          className={`mt-2 text-sm font-medium ${
            value !== null
              ? "text-foreground"
              : "text-muted-foreground/55"
          }`}
        >
          {value !== null
            ? value.toLocaleString()
            : "Not provided"}
        </p>
      )}
    </FieldShell>
  );
}

function EditableDateField({
  label,
  value,
  editing,
  onChange,
}: {
  label: string;
  value: string | null;
  editing: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <FieldShell label={label}>
      {editing ? (
        <input
          type="date"
          value={value ?? ""}
          onChange={(event) =>
            onChange(
              event.target.value || null
            )
          }
          className="ui-input mt-2 h-10 px-3 text-sm"
        />
      ) : (
        <p
          className={`mt-2 text-sm font-medium ${
            value
              ? "text-foreground"
              : "text-muted-foreground/55"
          }`}
        >
          {value || "Not provided"}
        </p>
      )}
    </FieldShell>
  );
}

function FieldShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ui-panel-soft rounded-2xl p-4">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}

function ReviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ui-panel-soft mt-5 rounded-2xl p-5">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  );
}

function SectionLabel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}