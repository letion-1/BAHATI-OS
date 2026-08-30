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

type Charter = {
  id: string;
  reference: string;
  yachtName: string;
  clientName: string;
  clientEmail: string | null;
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
  assignedAt: string | null;
  dueAt: string | null;
  overdue: boolean;
  needsAttention: boolean;
  createdAt: string;
  updatedAt: string;
};

type ConciergeResponse = {
  success: boolean;
  charter?: Charter;
  items?: ConciergeItem[];
  item?: ConciergeItem;
  error?: string;
};

type CreateForm = {
  category: string;
  title: string;
  description: string;
  priority: string;
  scheduledAt: string;
  location: string;
  vendorName: string;
  vendorContact: string;
  estimatedCost: string;
  clientVisible: boolean;
};

const categoryOptions = [
  {
    value: "transfer",
    label: "Transfer",
  },
  {
    value: "restaurant",
    label: "Restaurant",
  },
  {
    value: "provisioning",
    label: "Provisioning",
  },
  {
    value: "activity",
    label: "Activity",
  },
  {
    value: "special_request",
    label: "Special request",
  },
  {
    value: "crew_coordination",
    label: "Crew coordination",
  },
  {
    value: "other",
    label: "Other",
  },
];

const statusOptions = [
  "pending",
  "planning",
  "confirmed",
  "completed",
  "cancelled",
];

export default function CharterConciergePage() {
  const params =
    useParams();

  const charterId =
    useMemo(() => {
      const value =
        params?.id;

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
    }, [params]);

  const [
    charter,
    setCharter,
  ] =
    useState<Charter | null>(
      null
    );

  const [
    items,
    setItems,
  ] =
    useState<
      ConciergeItem[]
    >([]);

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true);

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

  const [
    activeCategory,
    setActiveCategory,
  ] =
    useState("all");
  const [
    viewMode,
    setViewMode,
  ] =
    useState<"cards" | "timeline">(
      "cards"
    );

  const [
    showCreate,
    setShowCreate,
  ] =
    useState(false);

  const [
    isCreating,
    setIsCreating,
  ] =
    useState(false);

  const [
    busyItemId,
    setBusyItemId,
  ] =
    useState<string | null>(
      null
    );

  const [
    form,
    setForm,
  ] =
    useState<CreateForm>({
      category:
        "transfer",
      title: "",
      description: "",
      priority: "normal",
      scheduledAt: "",
      location: "",
      vendorName: "",
      vendorContact: "",
      estimatedCost: "",
      clientVisible: false,
    });

  const loadWorkspace =
    useCallback(async () => {
      if (!charterId) {
        return;
      }

      try {
        setError(null);

        const response =
          await fetch(
            `/api/concierge/${encodeURIComponent(
              charterId
            )}`,
            {
              method:
                "GET",
              cache:
                "no-store",
            }
          );

        const result =
          (await response.json()) as ConciergeResponse;

        if (
          !response.ok ||
          !result.success ||
          !result.charter
        ) {
          throw new Error(
            result.error ??
              "Could not load concierge workspace."
          );
        }

        setCharter(
          result.charter
        );

        setItems(
          result.items ??
            []
        );
      } catch (
        caughtError
      ) {
        setError(
          caughtError instanceof
            Error
            ? caughtError.message
            : "Could not load concierge workspace."
        );
      } finally {
        setIsLoading(
          false
        );
      }
    }, [charterId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const filteredItems =
    useMemo(() => {
      if (
        activeCategory ===
        "all"
      ) {
        return items;
      }

      return items.filter(
        (item) =>
          item.category ===
          activeCategory
      );
    }, [
      activeCategory,
      items,
    ]);

  const timelineGroups =
    useMemo(() => {
      const scheduled =
        filteredItems
          .filter(
            (item) =>
              Boolean(
                item.scheduledAt
              )
          )
          .sort(
            (left, right) =>
              (
                left.scheduledAt ??
                ""
              ).localeCompare(
                right.scheduledAt ??
                  ""
              )
          );

      const groups =
        new Map<
          string,
          ConciergeItem[]
        >();

      for (
        const item of scheduled
      ) {
        const key =
          timelineDateKey(
            item.scheduledAt
          );

        const existing =
          groups.get(key) ??
          [];

        existing.push(item);

        groups.set(
          key,
          existing
        );
      }

      const unscheduled =
        filteredItems.filter(
          (item) =>
            !item.scheduledAt
        );

      return {
        scheduled:
          Array.from(
            groups.entries()
          ),
        unscheduled,
      };
    }, [filteredItems]);

  const stats =
    useMemo(() => {
      const active =
        items.filter(
          (item) =>
            ![
              "completed",
              "cancelled",
            ].includes(
              item.status
            )
        ).length;

      const confirmed =
        items.filter(
          (item) =>
            item.status ===
            "confirmed"
        ).length;

      const completed =
        items.filter(
          (item) =>
            item.status ===
            "completed"
        ).length;

      const urgent =
        items.filter(
          (item) =>
            item.priority ===
              "urgent" &&
            ![
              "completed",
              "cancelled",
            ].includes(
              item.status
            )
        ).length;

      return {
        active,
        confirmed,
        completed,
        urgent,
      };
    }, [items]);

  async function createItem() {
    if (
      !charterId ||
      isCreating
    ) {
      return;
    }

    if (
      !form.title.trim()
    ) {
      setError(
        "Add a title before creating the concierge item."
      );
      return;
    }

    try {
      setIsCreating(
        true
      );
      setError(null);
      setSavedMessage(
        null
      );

      const response =
        await fetch(
          `/api/concierge/${encodeURIComponent(
            charterId
          )}`,
          {
            method:
              "POST",
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
                    charter?.currency ??
                    "EUR",
                  source:
                    "broker",
                  clientVisible:
                    form.clientVisible,
                }
              ),
          }
        );

      const result =
        (await response.json()) as ConciergeResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.item
      ) {
        throw new Error(
          result.error ??
            "Could not create concierge item."
        );
      }

      setItems(
        (current) =>
          [
            result.item!,
            ...current,
          ].sort(
            compareItems
          )
      );

      setForm({
        category:
          "transfer",
        title: "",
        description: "",
        priority:
          "normal",
        scheduledAt: "",
        location: "",
        vendorName: "",
        vendorContact: "",
        estimatedCost: "",
        clientVisible: false,
      });

      setShowCreate(
        false
      );

      setSavedMessage(
        "Concierge item added."
      );
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : "Could not create concierge item."
      );
    } finally {
      setIsCreating(
        false
      );
    }
  }

  async function updateItem(
    item: ConciergeItem,
    patch:
      Record<
        string,
        unknown
      >
  ) {
    if (
      !charterId ||
      busyItemId
    ) {
      return;
    }

    try {
      setBusyItemId(
        item.id
      );
      setError(null);
      setSavedMessage(
        null
      );

      const response =
        await fetch(
          `/api/concierge/${encodeURIComponent(
            charterId
          )}/${encodeURIComponent(
            item.id
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
                patch
              ),
          }
        );

      const result =
        (await response.json()) as ConciergeResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.item
      ) {
        throw new Error(
          result.error ??
            "Could not update concierge item."
        );
      }

      setItems(
        (current) =>
          current
            .map(
              (candidate) =>
                candidate.id ===
                result.item!.id
                  ? result.item!
                  : candidate
            )
            .sort(
              compareItems
            )
      );
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : "Could not update concierge item."
      );
    } finally {
      setBusyItemId(
        null
      );
    }
  }

  async function deleteItem(
    item: ConciergeItem
  ) {
    if (
      !charterId ||
      busyItemId
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${item.title}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setBusyItemId(
        item.id
      );
      setError(null);

      const response =
        await fetch(
          `/api/concierge/${encodeURIComponent(
            charterId
          )}/${encodeURIComponent(
            item.id
          )}`,
          {
            method:
              "DELETE",
          }
        );

      const result =
        (await response.json()) as ConciergeResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not delete concierge item."
        );
      }

      setItems(
        (current) =>
          current.filter(
            (candidate) =>
              candidate.id !==
              item.id
          )
      );

      setSavedMessage(
        "Concierge item deleted."
      );
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
          Error
          ? caughtError.message
          : "Could not delete concierge item."
      );
    } finally {
      setBusyItemId(
        null
      );
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="ui-panel animate-pulse rounded-[28px] p-6">
          <div className="h-3 w-40 rounded bg-muted" />
          <div className="mt-4 h-10 w-72 rounded bg-muted" />
          <div className="mt-6 h-32 rounded-2xl bg-muted" />
        </div>
      </main>
    );
  }

  if (
    error &&
    !charter
  ) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-red-500/25 bg-red-500/10 p-6 text-red-800 dark:text-red-200">
          {error}
        </div>
      </main>
    );
  }

  if (!charter) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-5">
        <section className="ui-panel overflow-hidden rounded-[28px]">
          <div className="p-5 sm:p-7">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                    Concierge charter workspace
                  </p>

                  <StatusBadge
                    value={
                      charter.contractStatus
                    }
                  />

                  <StatusBadge
                    value={
                      charter.charterStatus
                    }
                  />
                </div>

                <h1 className="mt-3 font-heading text-3xl tracking-[0.04em] text-foreground sm:text-4xl">
                  {charter.yachtName}
                </h1>

                <p className="mt-2 text-sm text-muted-foreground">
                  {charter.reference} ·{" "}
                  {charter.clientName}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    label="Charter"
                    value={formatDateRange(
                      charter.startDate,
                      charter.endDate
                    )}
                  />
                  <Metric
                    label="Destination"
                    value={
                      charter.destination ??
                      "Not set"
                    }
                  />
                  <Metric
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
                  <Metric
                    label="Active requests"
                    value={String(
                      stats.active
                    )}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/concierge"
                  className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:bg-accent"
                >
                  All concierge
                </Link>

                <Link
                  href={`/charters/${encodeURIComponent(
                    charter.id
                  )}`}
                  className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:bg-accent"
                >
                  Back to charter
                </Link>

                <button
                  type="button"
                  onClick={() =>
                    setShowCreate(
                      (current) =>
                        !current
                    )
                  }
                  className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold"
                >
                  {showCreate
                    ? "Close"
                    : "Add concierge item"}
                </button>
              </div>
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

        {charter.contractStatus !==
        "signed" ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-900 dark:text-amber-200">
            The contract is not marked signed yet. You can prepare concierge work now, but confirmed guest-facing arrangements should normally follow contract execution.
          </div>
        ) : null}

        <section className="grid gap-3 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Active"
            value={stats.active}
          />
          <StatCard
            label="Confirmed"
            value={
              stats.confirmed
            }
          />
          <StatCard
            label="Completed"
            value={
              stats.completed
            }
          />
          <StatCard
            label="Urgent"
            value={stats.urgent}
          />
        </section>

        {showCreate ? (
          <section className="ui-panel rounded-[28px] p-5 sm:p-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                New request
              </p>
              <h2 className="mt-2 font-heading text-2xl text-foreground">
                Add concierge item
              </h2>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <SelectField
                label="Category"
                value={
                  form.category
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
                options={
                  categoryOptions
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
                label="Priority"
                value={
                  form.priority
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
                options={[
                  {
                    value:
                      "normal",
                    label:
                      "Normal",
                  },
                  {
                    value:
                      "high",
                    label:
                      "High",
                  },
                  {
                    value:
                      "urgent",
                    label:
                      "Urgent",
                  },
                ]}
              />

              <Field
                label="Scheduled"
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
                label={`Estimated cost (${charter.currency})`}
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

              <label className="md:col-span-2 xl:col-span-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                  Description
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
                        event
                          .target
                          .value,
                    })
                  }
                  rows={4}
                  className="ui-input mt-2 w-full resize-y px-3.5 py-3 text-sm"
                />
              </label>

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
                <span className="text-sm text-foreground">
                  Visible later in guest portal
                </span>
              </label>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  void createItem()
                }
                disabled={
                  isCreating
                }
                className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {isCreating
                  ? "Adding..."
                  : "Add item"}
              </button>
            </div>
          </section>
        ) : null}

        <section className="ui-panel rounded-[28px] p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Charter service plan
              </p>
              <h2 className="mt-2 font-heading text-2xl text-foreground">
                Requests & arrangements
              </h2>
            </div>

            <div className="flex flex-col gap-3 xl:items-end">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setViewMode(
                      "cards"
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    viewMode ===
                    "cards"
                      ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200"
                      : "border-border bg-background/40 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  Cards
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setViewMode(
                      "timeline"
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    viewMode ===
                    "timeline"
                      ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200"
                      : "border-border bg-background/40 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  Timeline
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <FilterButton
                  active={
                    activeCategory ===
                    "all"
                  }
                  onClick={() =>
                    setActiveCategory(
                      "all"
                    )
                  }
                >
                  All
                </FilterButton>

                {categoryOptions.map(
                  (category) => (
                    <FilterButton
                      key={
                        category.value
                      }
                      active={
                        activeCategory ===
                        category.value
                      }
                      onClick={() =>
                        setActiveCategory(
                          category.value
                        )
                      }
                    >
                      {
                        category.label
                      }
                    </FilterButton>
                  )
                )}
              </div>
            </div>
          </div>

          {filteredItems.length >
          0 ? (
            viewMode ===
            "cards" ? (
              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                {filteredItems.map(
                  (item) => (
                    <ConciergeCard
                      key={item.id}
                      charterId={charter.id}
                      item={item}
                      busy={
                        busyItemId ===
                        item.id
                      }
                      onStatus={(
                        status
                      ) =>
                        void updateItem(
                          item,
                          {
                            status,
                          }
                        )
                      }
                      onToggleVisibility={() =>
                        void updateItem(
                          item,
                          {
                            clientVisible:
                              !item.clientVisible,
                          }
                        )
                      }
                      onDelete={() =>
                        void deleteItem(
                          item
                        )
                      }
                    />
                  )
                )}
              </div>
            ) : (
              <ConciergeTimeline
                charterId={
                  charter.id
                }
                groups={
                  timelineGroups
                }
              />
            )
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-background/35 px-4 py-12 text-center text-sm leading-6 text-muted-foreground">
              No concierge items in this view yet.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ConciergeTimeline({
  charterId,
  groups,
}: {
  charterId: string;
  groups: {
    scheduled: Array<
      [
        string,
        ConciergeItem[]
      ]
    >;
    unscheduled: ConciergeItem[];
  };
}) {
  return (
    <div className="mt-7 space-y-8">
      {groups.scheduled.map(
        ([
          dateKey,
          dayItems,
        ]) => (
          <section
            key={dateKey}
            className="relative"
          >
            <div className="sticky top-24 z-10 mb-4 flex items-center gap-3 bg-background/85 py-2 backdrop-blur-xl">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-500/25 bg-cyan-500/10 text-sm font-bold text-cyan-800 dark:text-cyan-200">
                {timelineDayNumber(
                  dateKey
                )}
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Charter day
                </p>
                <h3 className="mt-0.5 text-base font-semibold text-foreground">
                  {formatTimelineDate(
                    dateKey
                  )}
                </h3>
              </div>
            </div>

            <div className="relative ml-[1.35rem] border-l border-border pl-7 sm:ml-[1.4rem] sm:pl-8">
              <div className="space-y-4">
                {dayItems.map(
                  (item) => (
                    <TimelineItem
                      key={
                        item.id
                      }
                      charterId={
                        charterId
                      }
                      item={
                        item
                      }
                    />
                  )
                )}
              </div>
            </div>
          </section>
        )
      )}

      {groups.unscheduled.length >
      0 ? (
        <section>
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Needs scheduling
            </p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">
              Unscheduled requests
            </h3>
          </div>

          <div className="grid gap-3 [&>*]:min-w-0 xl:grid-cols-2">
            {groups.unscheduled.map(
              (item) => (
                <Link
                  key={
                    item.id
                  }
                  href={`/concierge/${encodeURIComponent(
                    charterId
                  )}/${encodeURIComponent(
                    item.id
                  )}`}
                  className="ui-panel-soft apple-transition rounded-2xl p-4 hover:-translate-y-0.5 hover:bg-accent/40"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <CategoryBadge
                      value={
                        item.category
                      }
                    />
                    <StatusBadge
                      value={
                        item.status
                      }
                    />
                  </div>

                  <p className="mt-3 font-semibold text-foreground">
                    {
                      item.title
                    }
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Add a scheduled date/time to place this request on the charter timeline.
                  </p>
                </Link>
              )
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TimelineItem({
  charterId,
  item,
}: {
  charterId: string;
  item: ConciergeItem;
}) {
  return (
    <Link
      href={`/concierge/${encodeURIComponent(
        charterId
      )}/${encodeURIComponent(
        item.id
      )}`}
      className="ui-panel-soft apple-transition relative block rounded-2xl p-4 hover:-translate-y-0.5 hover:bg-accent/40 sm:p-5"
    >
      <span className="absolute -left-[2.15rem] top-6 size-3 rounded-full border-2 border-background bg-cyan-500 shadow-sm" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-foreground">
              {formatTimelineTime(
                item.scheduledAt
              )}
            </span>

            <CategoryBadge
              value={
                item.category
              }
            />

            <StatusBadge
              value={
                item.status
              }
            />

            {item.overdue ? (
              <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-red-800 dark:text-red-200">
                Overdue
              </span>
            ) : item.needsAttention ? (
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-amber-900 dark:text-amber-200">
                Needs attention
              </span>
            ) : null}
          </div>

          <h4 className="mt-3 text-base font-semibold text-foreground">
            {
              item.title
            }
          </h4>

          {item.description ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {
                item.description
              }
            </p>
          ) : null}
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <p className="text-xs font-semibold text-foreground">
            {
              item.location ??
              "Location not set"
            }
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {item.assignedTo
              ? "Assigned"
              : "Unassigned"}{" "}
            ·{" "}
            {item.clientVisible
              ? "Guest visible"
              : "Internal"}
          </p>
        </div>
      </div>
    </Link>
  );
}

function ConciergeCard({
  charterId,
  item,
  busy,
  onStatus,
  onToggleVisibility,
  onDelete,
}: {
  charterId: string;
  item: ConciergeItem;
  busy: boolean;
  onStatus: (
    status: string
  ) => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="ui-panel-soft rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge
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
              <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-red-800 dark:text-red-200">
                Overdue
              </span>
            ) : item.needsAttention ? (
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-amber-900 dark:text-amber-200">
                Needs attention
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 text-lg font-semibold text-foreground">
            {item.title}
          </h3>

          {item.description ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {
                item.description
              }
            </p>
          ) : null}
        </div>

        <div className="text-left sm:text-right">
          <p className="text-sm font-semibold text-foreground">
            {formatMoney(
              item.estimatedCost,
              item.currency
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {
              item.clientVisible
                ? "Guest portal"
                : "Internal"
            }
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <InfoLine
          label="Scheduled"
          value={formatDateTime(
            item.scheduledAt
          )}
        />
        <InfoLine
          label="Location"
          value={
            item.location ??
            "Not set"
          }
        />
        <InfoLine
          label="Vendor"
          value={
            item.vendorName ??
            "Not assigned"
          }
        />
        <InfoLine
          label="Contact"
          value={
            item.vendorContact ??
            "Not set"
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
          label="Ownership"
          value={
            item.assignedTo
              ? "Assigned"
              : "Unassigned"
          }
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {statusOptions
          .filter(
            (status) =>
              status !==
              item.status
          )
          .slice(0, 3)
          .map(
            (status) => (
              <button
                key={status}
                type="button"
                disabled={busy}
                onClick={() =>
                  onStatus(
                    status
                  )
                }
                className="ui-secondary-button apple-transition inline-flex min-h-9 items-center justify-center px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-60"
              >
                {formatLabel(
                  status
                )}
              </button>
            )
          )}

        <Link
          href={`/concierge/${encodeURIComponent(
            charterId
          )}/${encodeURIComponent(
            item.id
          )}`}
          className="ui-primary-button apple-transition inline-flex min-h-9 items-center justify-center px-3 py-1.5 text-xs font-semibold"
        >
          Open request
        </Link>

        <button
          type="button"
          disabled={busy}
          onClick={
            onToggleVisibility
          }
          className="ui-secondary-button apple-transition inline-flex min-h-9 items-center justify-center px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-60"
        >
          {item.clientVisible
            ? "Make internal"
            : "Show to guest"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={
            onDelete
          }
          className="apple-transition inline-flex min-h-9 items-center justify-center rounded-[0.9rem] border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-800 disabled:opacity-60 dark:text-red-200"
        >
          Delete
        </button>
      </div>
    </article>
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
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
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
          (option) => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {
                option.label
              }
            </option>
          )
        )}
      </select>
    </label>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children:
    React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200"
          : "border-border bg-background/40 text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="ui-panel-soft rounded-xl px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="ui-panel rounded-2xl px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">
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

function CategoryBadge({
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

function compareItems(
  left: ConciergeItem,
  right: ConciergeItem
) {
  if (
    left.scheduledAt &&
    right.scheduledAt
  ) {
    return left.scheduledAt.localeCompare(
      right.scheduledAt
    );
  }

  if (
    left.scheduledAt
  ) {
    return -1;
  }

  if (
    right.scheduledAt
  ) {
    return 1;
  }

  return right.createdAt.localeCompare(
    left.createdAt
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

function timelineDateKey(
  value: string | null
) {
  if (!value) {
    return "unscheduled";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "unscheduled";
  }

  const year =
    date.getFullYear();
  const month =
    String(
      date.getMonth() +
        1
    ).padStart(
      2,
      "0"
    );
  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}

function timelineDayNumber(
  dateKey: string
) {
  const parts =
    dateKey.split("-");

  return (
    parts[2] ??
    "--"
  );
}

function formatTimelineDate(
  dateKey: string
) {
  const date =
    new Date(
      `${dateKey}T12:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return dateKey;
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  );
}

function formatTimelineTime(
  value: string | null
) {
  if (!value) {
    return "Time not set";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Time not set";
  }

  return date.toLocaleTimeString(
    "en-GB",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  );
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
    return "Cost not set";
  }

  try {
    return new Intl.NumberFormat(
      "en-GB",
      {
        style: "currency",
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