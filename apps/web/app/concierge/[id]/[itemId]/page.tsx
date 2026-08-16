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
  useRouter,
} from "next/navigation";

type Charter = {
  id: string;
  reference: string;
  clientName: string;
  clientEmail: string | null;
  yachtName: string;
  startDate: string | null;
  endDate: string | null;
  destination: string | null;
  embarkationPort: string | null;
  disembarkationPort: string | null;
  guests: number | null;
  currency: string;
  contractStatus: string;
  charterStatus: string;
};

type ConciergeItem = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  scheduledAt: string | null;
  location: string | null;
  vendorName: string | null;
  vendorContact: string | null;
  estimatedCost: number | null;
  currency: string;
  source: string;
  clientVisible: boolean;
  notes: string | null;
  assignedTo: string | null;
  assignedBy: string | null;
  assignedAt: string | null;
  dueAt: string | null;
  overdue: boolean;
  needsAttention: boolean;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceMember = {
  id: string;
  fullName: string;
  email: string | null;
  role: string | null;
};

type ApiResponse = {
  success: boolean;
  charter?: Charter;
  item?: ConciergeItem;
  members?: WorkspaceMember[];
  error?: string;
};

type EditForm = {
  category: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  scheduledAt: string;
  location: string;
  vendorName: string;
  vendorContact: string;
  estimatedCost: string;
  currency: string;
  source: string;
  clientVisible: boolean;
  notes: string;
  assignedTo: string;
  dueAt: string;
};

const categories = [
  ["transfer", "Transfer"],
  ["restaurant", "Restaurant"],
  ["provisioning", "Provisioning"],
  ["activity", "Activity"],
  ["special_request", "Special request"],
  ["crew_coordination", "Crew coordination"],
  ["other", "Other"],
] as const;

const statuses = [
  ["pending", "Pending"],
  ["planning", "Planning"],
  ["confirmed", "Confirmed"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
] as const;

const priorities = [
  ["normal", "Normal"],
  ["high", "High"],
  ["urgent", "Urgent"],
] as const;

const sources = [
  ["broker", "Broker"],
  ["client", "Client"],
  ["crew", "Crew"],
  ["owner", "Owner"],
  ["other", "Other"],
] as const;

export default function ConciergeRequestPage() {
  const params =
    useParams();
  const router =
    useRouter();

  const charterId =
    useMemo(
      () =>
        readParam(
          params?.id
        ),
      [params]
    );

  const itemId =
    useMemo(
      () =>
        readParam(
          params?.itemId
        ),
      [params]
    );

  const [
    charter,
    setCharter,
  ] =
    useState<Charter | null>(
      null
    );

  const [
    item,
    setItem,
  ] =
    useState<ConciergeItem | null>(
      null
    );

  const [
    members,
    setMembers,
  ] =
    useState<
      WorkspaceMember[]
    >([]);

  const [
    form,
    setForm,
  ] =
    useState<EditForm | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    deleting,
    setDeleting,
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
    savedMessage,
    setSavedMessage,
  ] =
    useState<string | null>(
      null
    );

  const loadRequest =
    useCallback(async () => {
      if (
        !charterId ||
        !itemId
      ) {
        return;
      }

      try {
        setError(null);

        const response =
          await fetch(
            `/api/concierge/${encodeURIComponent(
              charterId
            )}/${encodeURIComponent(
              itemId
            )}`,
            {
              cache:
                "no-store",
            }
          );

        const result =
          (await response.json()) as ApiResponse;

        if (
          !response.ok ||
          !result.success ||
          !result.charter ||
          !result.item
        ) {
          throw new Error(
            result.error ??
              "Could not load concierge request."
          );
        }

        setCharter(
          result.charter
        );
        setItem(
          result.item
        );
        setMembers(
          result.members ??
            []
        );
        setForm(
          toForm(
            result.item
          )
        );
      } catch (
        caughtError
      ) {
        setError(
          caughtError instanceof
            Error
            ? caughtError.message
            : "Could not load concierge request."
        );
      } finally {
        setLoading(
          false
        );
      }
    }, [
      charterId,
      itemId,
    ]);

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  async function saveRequest() {
    if (
      !form ||
      !charterId ||
      !itemId ||
      saving
    ) {
      return;
    }

    if (
      !form.title.trim()
    ) {
      setError(
        "The request title cannot be blank."
      );
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSavedMessage(
        null
      );

      const response =
        await fetch(
          `/api/concierge/${encodeURIComponent(
            charterId
          )}/${encodeURIComponent(
            itemId
          )}`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify(
                {
                  category:
                    form.category,
                  title:
                    form.title,
                  description:
                    blankToNull(
                      form.description
                    ),
                  status:
                    form.status,
                  priority:
                    form.priority,
                  scheduledAt:
                    blankToNull(
                      form.scheduledAt
                    ),
                  location:
                    blankToNull(
                      form.location
                    ),
                  vendorName:
                    blankToNull(
                      form.vendorName
                    ),
                  vendorContact:
                    blankToNull(
                      form.vendorContact
                    ),
                  estimatedCost:
                    numberOrNull(
                      form.estimatedCost
                    ),
                  currency:
                    form.currency,
                  source:
                    form.source,
                  clientVisible:
                    form.clientVisible,
                  assignedTo:
                    blankToNull(
                      form.assignedTo
                    ),
                  dueAt:
                    blankToNull(
                      form.dueAt
                    ),
                  notes:
                    blankToNull(
                      form.notes
                    ),
                }
              ),
          }
        );

      const result =
        (await response.json()) as ApiResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.item
      ) {
        throw new Error(
          result.error ??
            "Could not save concierge request."
        );
      }

      setItem(
        result.item
      );
      setForm(
        toForm(
          result.item
        )
      );
      setSavedMessage(
        "Concierge request saved."
      );
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : "Could not save concierge request."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteRequest() {
    if (
      !item ||
      !charterId ||
      !itemId ||
      deleting
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${item.title}"? This cannot be undone.`
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);

      const response =
        await fetch(
          `/api/concierge/${encodeURIComponent(
            charterId
          )}/${encodeURIComponent(
            itemId
          )}`,
          {
            method:
              "DELETE",
          }
        );

      const result =
        (await response.json()) as ApiResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not delete concierge request."
        );
      }

      router.push(
        `/concierge/${encodeURIComponent(
          charterId
        )}`
      );
      router.refresh();
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : "Could not delete concierge request."
      );
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1450px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="ui-panel animate-pulse rounded-[28px] p-6">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="mt-4 h-10 w-72 rounded bg-muted" />
          <div className="mt-8 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="h-[520px] rounded-2xl bg-muted" />
            <div className="h-[520px] rounded-2xl bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (
    !charter ||
    !item ||
    !form
  ) {
    return (
      <div className="mx-auto w-full max-w-[1450px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-red-500/25 bg-red-500/10 p-6 text-sm text-red-800 dark:text-red-200">
          {error ??
            "Concierge request not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1450px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-5">
        <section className="ui-panel rounded-[28px] p-5 sm:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  value={
                    item.category
                  }
                />
                <StatusBadge
                  value={
                    item.status
                  }
                />
                {item.priority !==
                "normal" ? (
                  <PriorityBadge
                    value={
                      item.priority
                    }
                  />
                ) : null}
                {item.overdue ? (
                  <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-red-800 dark:text-red-200">
                    Overdue
                  </span>
                ) : item.needsAttention ? (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-amber-900 dark:text-amber-200">
                    Needs attention
                  </span>
                ) : null}
              </div>

              <h1 className="mt-4 font-heading text-3xl tracking-[0.02em] text-foreground sm:text-4xl">
                {item.title}
              </h1>

              <p className="mt-2 text-sm text-muted-foreground">
                {charter.yachtName} ·{" "}
                {charter.clientName} ·{" "}
                {charter.reference}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/concierge"
                className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:bg-accent"
              >
                All concierge
              </Link>

              <Link
                href={`/concierge/${encodeURIComponent(
                  charter.id
                )}`}
                className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:bg-accent"
              >
                Charter workspace
              </Link>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {savedMessage ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            {savedMessage}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <section className="ui-panel rounded-[28px] p-5 sm:p-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Request details
              </p>
              <h2 className="mt-2 font-heading text-2xl text-foreground">
                Edit concierge request
              </h2>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <SelectField
                label="Category"
                value={
                  form.category
                }
                options={
                  categories
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    category:
                      value,
                  })
                }
              />

              <Field
                label="Title"
                value={
                  form.title
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    title:
                      value,
                  })
                }
              />

              <SelectField
                label="Status"
                value={
                  form.status
                }
                options={
                  statuses
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    status:
                      value,
                  })
                }
              />

              <SelectField
                label="Priority"
                value={
                  form.priority
                }
                options={
                  priorities
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    priority:
                      value,
                  })
                }
              />

              <Field
                label="Scheduled date / time"
                type="datetime-local"
                value={
                  form.scheduledAt
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    scheduledAt:
                      value,
                  })
                }
              />

              <Field
                label="Location"
                value={
                  form.location
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    location:
                      value,
                  })
                }
              />

              <Field
                label="Vendor / provider"
                value={
                  form.vendorName
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    vendorName:
                      value,
                  })
                }
              />

              <Field
                label="Vendor contact"
                value={
                  form.vendorContact
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    vendorContact:
                      value,
                  })
                }
              />

              <Field
                label="Estimated cost"
                type="number"
                value={
                  form.estimatedCost
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    estimatedCost:
                      value,
                  })
                }
              />

              <Field
                label="Currency"
                value={
                  form.currency
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    currency:
                      value
                        .toUpperCase()
                        .slice(
                          0,
                          3
                        ),
                  })
                }
              />

              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                  Assigned to
                </span>

                <select
                  value={
                    form.assignedTo
                  }
                  onChange={(
                    event
                  ) =>
                    setForm({
                      ...form,
                      assignedTo:
                        event.target
                          .value,
                    })
                  }
                  className="ui-input mt-2 w-full px-3.5 py-3 text-sm"
                >
                  <option value="">
                    Unassigned
                  </option>

                  {members.map(
                    (member) => (
                      <option
                        key={
                          member.id
                        }
                        value={
                          member.id
                        }
                      >
                        {member.fullName}
                        {member.role
                          ? ` · ${formatLabel(
                              member.role
                            )}`
                          : ""}
                      </option>
                    )
                  )}
                </select>
              </label>

              <Field
                label="Internal due date"
                type="datetime-local"
                value={
                  form.dueAt
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    dueAt:
                      value,
                  })
                }
              />

              <SelectField
                label="Request source"
                value={
                  form.source
                }
                options={
                  sources
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    source:
                      value,
                  })
                }
              />

              <label className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-4 py-3">
                <input
                  type="checkbox"
                  checked={
                    form.clientVisible
                  }
                  onChange={(
                    event
                  ) =>
                    setForm({
                      ...form,
                      clientVisible:
                        event
                          .target
                          .checked,
                    })
                  }
                />

                <span>
                  <span className="block text-sm font-semibold text-foreground">
                    Guest visible
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Allow this request to appear in the future guest portal.
                  </span>
                </span>
              </label>

              <label className="md:col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                  Guest / operational description
                </span>

                <textarea
                  value={
                    form.description
                  }
                  onChange={(
                    event
                  ) =>
                    setForm({
                      ...form,
                      description:
                        event.target
                          .value,
                    })
                  }
                  rows={5}
                  className="ui-input mt-2 w-full resize-y px-3.5 py-3 text-sm"
                />

                <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                  If the request is guest visible, keep this wording suitable for the charterer.
                </span>
              </label>

              <label className="md:col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                  Internal notes
                </span>

                <textarea
                  value={
                    form.notes
                  }
                  onChange={(
                    event
                  ) =>
                    setForm({
                      ...form,
                      notes:
                        event.target
                          .value,
                    })
                  }
                  rows={5}
                  className="ui-input mt-2 w-full resize-y px-3.5 py-3 text-sm"
                />

                <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                  Internal broker and operations notes. These are never exposed by the guest visibility flag.
                </span>
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() =>
                  void deleteRequest()
                }
                disabled={
                  deleting ||
                  saving
                }
                className="apple-transition inline-flex min-h-11 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-800 disabled:opacity-60 dark:text-red-200"
              >
                {deleting
                  ? "Deleting..."
                  : "Delete request"}
              </button>

              <button
                type="button"
                onClick={() =>
                  void saveRequest()
                }
                disabled={
                  saving ||
                  deleting
                }
                className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {saving
                  ? "Saving..."
                  : "Save changes"}
              </button>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="ui-panel rounded-[28px] p-5 sm:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Charter context
              </p>

              <div className="mt-4 space-y-3">
                <InfoLine
                  label="Yacht"
                  value={
                    charter.yachtName
                  }
                />
                <InfoLine
                  label="Client"
                  value={
                    charter.clientName
                  }
                />
                <InfoLine
                  label="Dates"
                  value={formatDateRange(
                    charter.startDate,
                    charter.endDate
                  )}
                />
                <InfoLine
                  label="Destination"
                  value={
                    charter.destination ??
                    "Not set"
                  }
                />
                <InfoLine
                  label="Guests"
                  value={
                    charter.guests !==
                    null
                      ? String(
                          charter.guests
                        )
                      : "Not set"
                  }
                />
              </div>
            </section>

            <section className="ui-panel rounded-[28px] p-5 sm:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Request snapshot
              </p>

              <div className="mt-4 space-y-3">
                <InfoLine
                  label="Scheduled"
                  value={formatDateTime(
                    item.scheduledAt
                  )}
                />
                <InfoLine
                  label="Estimated cost"
                  value={formatMoney(
                    item.estimatedCost,
                    item.currency
                  )}
                />
                <InfoLine
                  label="Source"
                  value={formatLabel(
                    item.source
                  )}
                />
                <InfoLine
                  label="Visibility"
                  value={
                    item.clientVisible
                      ? "Guest visible"
                      : "Internal only"
                  }
                />
                <InfoLine
                  label="Assigned to"
                  value={
                    memberName(
                      members,
                      item.assignedTo
                    )
                  }
                />
                <InfoLine
                  label="Internal due"
                  value={
                    item.dueAt
                      ? formatDateTime(
                          item.dueAt
                        )
                      : "Not set"
                  }
                />
                <InfoLine
                  label="Attention"
                  value={
                    item.overdue
                      ? "Overdue"
                      : item.needsAttention
                        ? "Needs attention"
                        : "On track"
                  }
                />
                <InfoLine
                  label="Last updated"
                  value={formatDateTime(
                    item.updatedAt
                  )}
                />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  type?:
    | "text"
    | "number"
    | "datetime-local";
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </span>

      <input
        type={type}
        step={
          type === "number"
            ? "any"
            : undefined
        }
        value={value}
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        className="ui-input mt-2 w-full px-3.5 py-3 text-sm"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options:
    readonly (
      readonly [
        string,
        string
      ]
    )[];
  onChange: (
    value: string
  ) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </span>

      <select
        value={value}
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        className="ui-input mt-2 w-full px-3.5 py-3 text-sm"
      >
        {options.map(
          ([
            optionValue,
            optionLabel,
          ]) => (
            <option
              key={
                optionValue
              }
              value={
                optionValue
              }
            >
              {optionLabel}
            </option>
          )
        )}
      </select>
    </label>
  );
}

function Badge({
  value,
}: {
  value: string;
}) {
  return (
    <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-cyan-800 dark:text-cyan-200">
      {formatLabel(
        value
      )}
    </span>
  );
}

function PriorityBadge({
  value,
}: {
  value: string;
}) {
  return (
    <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-red-800 dark:text-red-200">
      {formatLabel(
        value
      )}
    </span>
  );
}

function StatusBadge({
  value,
}: {
  value: string;
}) {
  const positive =
    [
      "signed",
      "confirmed",
      "completed",
      "active",
    ].includes(value);

  const caution =
    [
      "pending",
      "planning",
      "contracting",
      "sent",
    ].includes(value);

  const negative =
    [
      "cancelled",
      "declined",
      "expired",
    ].includes(value);

  const className =
    positive
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
      : caution
        ? "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200"
        : negative
          ? "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-200"
          : "border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] ${className}`}
    >
      {formatLabel(
        value
      )}
    </span>
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
    <div className="rounded-xl border border-border bg-background/35 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 text-sm text-foreground">
        {value}
      </p>
    </div>
  );
}

function toForm(
  item: ConciergeItem
): EditForm {
  return {
    category:
      item.category,
    title:
      item.title,
    description:
      item.description ??
      "",
    status:
      item.status,
    priority:
      item.priority,
    scheduledAt:
      toLocalDateTimeInput(
        item.scheduledAt
      ),
    location:
      item.location ??
      "",
    vendorName:
      item.vendorName ??
      "",
    vendorContact:
      item.vendorContact ??
      "",
    estimatedCost:
      item.estimatedCost !==
      null
        ? String(
            item.estimatedCost
          )
        : "",
    currency:
      item.currency,
    source:
      item.source,
    clientVisible:
      item.clientVisible,
    notes:
      item.notes ??
      "",
    assignedTo:
      item.assignedTo ??
      "",
    dueAt:
      toLocalDateTimeInput(
        item.dueAt
      ),
  };
}

function memberName(
  members: WorkspaceMember[],
  userId: string | null
) {
  if (!userId) {
    return "Unassigned";
  }

  return (
    members.find(
      (member) =>
        member.id ===
        userId
    )?.fullName ??
    "Workspace member"
  );
}

function readParam(
  value:
    | string
    | string[]
    | undefined
) {
  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  if (
    Array.isArray(value)
  ) {
    return (
      value[0] ?? ""
    );
  }

  return "";
}

function blankToNull(
  value: string
) {
  const cleaned =
    value.trim();

  return cleaned.length > 0
    ? cleaned
    : null;
}

function numberOrNull(
  value: string
) {
  const cleaned =
    value.trim();

  if (!cleaned) {
    return null;
  }

  const parsed =
    Number(cleaned);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : null;
}

function toLocalDateTimeInput(
  value: string | null
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const local =
    new Date(
      date.getTime() -
        date.getTimezoneOffset() *
          60_000
    );

  return local
    .toISOString()
    .slice(
      0,
      16
    );
}

function formatLabel(
  value: string
) {
  return value
    .split("_")
    .map(
      (word) =>
        word
          .charAt(0)
          .toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

function formatDateRange(
  start: string | null,
  end: string | null
) {
  if (!start && !end) {
    return "Dates not set";
  }

  return `${formatDate(
    start
  )} → ${formatDate(
    end
  )}`;
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "Not set";
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
    return "Not scheduled";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Not scheduled";
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

function formatMoney(
  value: number | null,
  currency: string
) {
  if (value === null) {
    return "Not set";
  }

  try {
    return new Intl.NumberFormat(
      "en-GB",
      {
        style:
          "currency",
        currency,
        maximumFractionDigits: 2,
      }
    ).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(
      "en-GB"
    )}`;
  }
}