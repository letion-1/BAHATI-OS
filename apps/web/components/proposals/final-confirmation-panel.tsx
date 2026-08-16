"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

type ConfirmationStatus =
  | "not_started"
  | "confirmation_required"
  | "confirmation_requested"
  | "owner_approval_pending"
  | "manager_confirmation_pending"
  | "confirmed"
  | "declined"
  | "expired"
  | "cancelled"
  | "blocked";

type ConfirmationDecision = {
  confirmationType:
    | "internal_confirmation"
    | "owner_approval"
    | "manager_confirmation"
    | "reference_only";
  initialStatus: ConfirmationStatus;
  canProceed: boolean;
  title: string;
  description: string;
  primaryActionLabel: string | null;
  reason: string;
};

type ConfirmationSelection = {
  id: string;
  proposalYachtId: string;
  fleetId: string | null;
  yachtName: string;
  selectedAt: string;
  updatedAt: string;
  accessType: string | null;
  calendarAuthority: string | null;
  bookingModel: string | null;
};

type ConfirmationRecord = {
  id: string;
  proposalId: string;
  proposalYachtId: string | null;
  fleetId: string | null;
  confirmationType: string;
  status: ConfirmationStatus;
  requestedAt: string | null;
  requestedBy: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  declinedAt: string | null;
  declinedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  contactName: string | null;
  contactEmail: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type ConfirmationResponse = {
  success: boolean;
  selection?: ConfirmationSelection | null;
  decision?: ConfirmationDecision | null;
  confirmation?: ConfirmationRecord | null;
  selectionChanged?: boolean;
  error?: string;
  message?: string;
};

type CharterTransitionResponse = {
  success: boolean;
  created?: boolean;
  charter?: {
    id: string;
    reference: string;
  } | null;
  error?: string;
};

export function FinalConfirmationPanel({
  proposalId,
}: {
  proposalId: string;
}) {
  const router = useRouter();

  const [data, setData] =
    useState<ConfirmationResponse | null>(null);
  const [isLoading, setIsLoading] =
    useState(true);
  const [isSubmitting, setIsSubmitting] =
    useState(false);
  const [isLoadingCharter, setIsLoadingCharter] =
    useState(false);
  const [isOpeningContract, setIsOpeningContract] =
    useState(false);
  const [charterId, setCharterId] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  const loadConfirmation =
    useCallback(async () => {
      if (!proposalId) {
        return;
      }

      try {
        setError(null);

        const response = await fetch(
          `/api/proposals/${encodeURIComponent(
            proposalId
          )}/confirmation`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result =
          (await response.json()) as ConfirmationResponse;

        if (!response.ok || !result.success) {
          throw new Error(
            result.error ??
              "Could not load final confirmation."
          );
        }

        setData(result);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load final confirmation."
        );
      } finally {
        setIsLoading(false);
      }
    }, [proposalId]);

  const loadCharterTransition =
    useCallback(async () => {
      if (!proposalId) {
        return;
      }

      try {
        setIsLoadingCharter(true);

        const response = await fetch(
          `/api/proposals/${encodeURIComponent(
            proposalId
          )}/charter`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const result =
          (await response.json()) as CharterTransitionResponse;

        if (!response.ok || !result.success) {
          throw new Error(
            result.error ??
              "Could not load charter state."
          );
        }

        setCharterId(
          result.charter?.id ?? null
        );
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load charter state."
        );
      } finally {
        setIsLoadingCharter(false);
      }
    }, [proposalId]);

  useEffect(() => {
    void loadConfirmation();
  }, [loadConfirmation]);

  useEffect(() => {
    const interval = window.setInterval(
      () => {
        void loadConfirmation();
      },
      20_000
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [loadConfirmation]);

  useEffect(() => {
    if (
      data?.confirmation?.status ===
      "confirmed"
    ) {
      void loadCharterTransition();
    } else {
      setCharterId(null);
    }
  }, [
    data?.confirmation?.status,
    loadCharterTransition,
  ]);

  async function performAction(
    action:
      | "request"
      | "confirm"
      | "decline"
      | "cancel"
      | "reset"
  ) {
    if (!proposalId || isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(
        `/api/proposals/${encodeURIComponent(
          proposalId
        )}/confirmation`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action,
          }),
        }
      );

      const result =
        (await response.json()) as ConfirmationResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ??
            "Could not update final confirmation."
        );
      }

      setData(result);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update final confirmation."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function proceedToContract() {
    if (!proposalId || isOpeningContract) {
      return;
    }

    if (charterId) {
      router.push(
        `/charters/${encodeURIComponent(
          charterId
        )}`
      );
      return;
    }

    try {
      setIsOpeningContract(true);
      setError(null);

      const response = await fetch(
        `/api/proposals/${encodeURIComponent(
          proposalId
        )}/charter`,
        {
          method: "POST",
        }
      );

      const result =
        (await response.json()) as CharterTransitionResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.charter?.id
      ) {
        throw new Error(
          result.error ??
            "Could not create the charter workspace."
        );
      }

      setCharterId(result.charter.id);

      router.push(
        `/charters/${encodeURIComponent(
          result.charter.id
        )}`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not open the contract workspace."
      );
    } finally {
      setIsOpeningContract(false);
    }
  }

  if (isLoading) {
    return (
      <section className="ui-panel rounded-[24px] p-5 sm:p-6">
        <div className="animate-pulse">
          <div className="h-3 w-36 rounded bg-muted" />
          <div className="mt-4 h-8 w-64 rounded bg-muted" />
          <div className="mt-4 h-16 rounded bg-muted" />
          <div className="mt-5 h-11 w-48 rounded-xl bg-muted" />
        </div>
      </section>
    );
  }

  if (!data?.selection || !data.decision) {
    return null;
  }

  const decision = data.decision;
  const confirmation =
    data.confirmation ?? null;

  const status =
    confirmation?.status ??
    decision.initialStatus;

  const statusView =
    getStatusView(status);

  const isConfirmed =
    status === "confirmed";
  const isPending =
    status === "owner_approval_pending" ||
    status ===
      "manager_confirmation_pending" ||
    status === "confirmation_requested";
  const isTerminalNegative =
    status === "declined" ||
    status === "cancelled" ||
    status === "expired";
  const isBlocked =
    status === "blocked" ||
    !decision.canProceed;

  return (
    <section
      className={`overflow-hidden rounded-[24px] border ${
        isConfirmed
          ? "border-emerald-500/30 bg-emerald-500/[0.07]"
          : isBlocked ||
              isTerminalNegative
            ? "border-red-500/25 bg-red-500/[0.06]"
            : isPending
              ? "border-amber-500/25 bg-amber-500/[0.06]"
              : "border-border bg-card"
      }`}
    >
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                Final confirmation
              </p>

              <span
                className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] ${statusView.badgeClass}`}
              >
                {statusView.label}
              </span>

              {isConfirmed && charterId ? (
                <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-cyan-800 dark:text-cyan-200">
                  Contract created
                </span>
              ) : null}
            </div>

            <h2 className="mt-3 font-heading text-3xl tracking-[0.04em] text-foreground">
              {data.selection.yachtName}
            </h2>

            <p className="mt-2 text-lg font-semibold text-foreground">
              {decision.title}
            </p>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {decision.description}
            </p>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
            {renderActions({
              status,
              confirmationType:
                decision.confirmationType,
              canProceed:
                decision.canProceed,
              isSubmitting,
              isLoadingCharter,
              isOpeningContract,
              charterId,
              onAction:
                performAction,
              onProceedToContract:
                proceedToContract,
              primaryActionLabel:
                decision.primaryActionLabel,
            })}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ConfirmationMetric
            label="Approval path"
            value={formatConfirmationType(
              decision.confirmationType
            )}
          />

          <ConfirmationMetric
            label="Access"
            value={formatValue(
              data.selection.accessType
            )}
          />

          <ConfirmationMetric
            label="Booking model"
            value={formatValue(
              data.selection.bookingModel
            )}
          />

          <ConfirmationMetric
            label="Calendar authority"
            value={formatValue(
              data.selection.calendarAuthority
            )}
          />
        </div>

        {confirmation ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ConfirmationMetric
              label="Requested"
              value={formatDateTime(
                confirmation.requestedAt
              )}
            />

            <ConfirmationMetric
              label="Confirmed"
              value={formatDateTime(
                confirmation.confirmedAt
              )}
            />

            <ConfirmationMetric
              label="Declined"
              value={formatDateTime(
                confirmation.declinedAt
              )}
            />

            <ConfirmationMetric
              label="Last updated"
              value={formatDateTime(
                confirmation.updatedAt
              )}
            />
          </div>
        ) : null}

        {data.selectionChanged ? (
          <div className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-900 dark:text-amber-200">
            The client changed their preferred yacht. The previous confirmation state was not carried over.
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-border bg-background/45 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Why this approval path?
          </p>

          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {decision.reason}
          </p>
        </div>
      </div>
    </section>
  );
}

function renderActions({
  status,
  confirmationType,
  canProceed,
  isSubmitting,
  isLoadingCharter,
  isOpeningContract,
  charterId,
  onAction,
  onProceedToContract,
  primaryActionLabel,
}: {
  status: ConfirmationStatus;
  confirmationType: ConfirmationDecision["confirmationType"];
  canProceed: boolean;
  isSubmitting: boolean;
  isLoadingCharter: boolean;
  isOpeningContract: boolean;
  charterId: string | null;
  onAction: (
    action:
      | "request"
      | "confirm"
      | "decline"
      | "cancel"
      | "reset"
  ) => Promise<void>;
  onProceedToContract: () => Promise<void>;
  primaryActionLabel: string | null;
}) {
  if (!canProceed || status === "blocked") {
    return (
      <span className="inline-flex min-h-11 items-center justify-center rounded-[0.9rem] border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-800 dark:text-red-200">
        Cannot proceed
      </span>
    );
  }

  if (status === "confirmed") {
    return (
      <>
        <button
          type="button"
          onClick={() =>
            void onProceedToContract()
          }
          disabled={
            isOpeningContract ||
            isLoadingCharter
          }
          className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-60"
        >
          {isOpeningContract
            ? "Opening contract..."
            : isLoadingCharter
              ? "Checking contract..."
              : charterId
                ? "Open contract"
                : "Proceed to contract"}
        </button>

        {charterId ? (
          <span className="inline-flex min-h-11 items-center justify-center rounded-[0.9rem] border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            Charter created
          </span>
        ) : (
          <button
            type="button"
            onClick={() =>
              void onAction("reset")
            }
            disabled={
              isSubmitting ||
              isLoadingCharter
            }
            className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:bg-accent disabled:opacity-60"
          >
            Reopen confirmation
          </button>
        )}
      </>
    );
  }

  if (
    status === "declined" ||
    status === "cancelled" ||
    status === "expired"
  ) {
    return (
      <button
        type="button"
        onClick={() =>
          void onAction("reset")
        }
        disabled={isSubmitting}
        className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-60"
      >
        Restart confirmation
      </button>
    );
  }

  if (
    status === "owner_approval_pending" ||
    status ===
      "manager_confirmation_pending" ||
    status === "confirmation_requested"
  ) {
    return (
      <>
        <button
          type="button"
          onClick={() =>
            void onAction("confirm")
          }
          disabled={isSubmitting}
          className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-60"
        >
          {isSubmitting
            ? "Saving..."
            : confirmationType ===
                  "owner_approval"
              ? "Mark approved"
              : "Mark confirmed"}
        </button>

        <button
          type="button"
          onClick={() =>
            void onAction("decline")
          }
          disabled={isSubmitting}
          className="apple-transition inline-flex min-h-11 items-center justify-center rounded-[0.9rem] border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-500/15 disabled:opacity-60 dark:text-red-200"
        >
          Mark declined
        </button>

        <button
          type="button"
          onClick={() =>
            void onAction("cancel")
          }
          disabled={isSubmitting}
          className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:bg-accent disabled:opacity-60"
        >
          Cancel
        </button>
      </>
    );
  }

  if (
    confirmationType ===
    "internal_confirmation"
  ) {
    return (
      <button
        type="button"
        onClick={() =>
          void onAction("confirm")
        }
        disabled={isSubmitting}
        className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-60"
      >
        {isSubmitting
          ? "Confirming..."
          : primaryActionLabel ??
            "Confirm charter availability"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() =>
        void onAction("request")
      }
      disabled={isSubmitting}
      className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-60"
    >
      {isSubmitting
        ? "Sending..."
        : primaryActionLabel ??
          "Begin confirmation"}
    </button>
  );
}

function ConfirmationMetric({
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

function getStatusView(
  status: ConfirmationStatus
) {
  switch (status) {
    case "confirmed":
      return {
        label: "Confirmed",
        badgeClass:
          "border-emerald-500/25 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
      };

    case "owner_approval_pending":
      return {
        label: "Owner approval pending",
        badgeClass:
          "border-amber-500/25 bg-amber-500/15 text-amber-900 dark:text-amber-200",
      };

    case "manager_confirmation_pending":
      return {
        label: "Manager confirmation pending",
        badgeClass:
          "border-amber-500/25 bg-amber-500/15 text-amber-900 dark:text-amber-200",
      };

    case "confirmation_requested":
      return {
        label: "Confirmation requested",
        badgeClass:
          "border-amber-500/25 bg-amber-500/15 text-amber-900 dark:text-amber-200",
      };

    case "declined":
      return {
        label: "Declined",
        badgeClass:
          "border-red-500/25 bg-red-500/15 text-red-800 dark:text-red-200",
      };

    case "cancelled":
      return {
        label: "Cancelled",
        badgeClass:
          "border-red-500/25 bg-red-500/15 text-red-800 dark:text-red-200",
      };

    case "expired":
      return {
        label: "Expired",
        badgeClass:
          "border-red-500/25 bg-red-500/15 text-red-800 dark:text-red-200",
      };

    case "blocked":
      return {
        label: "Blocked",
        badgeClass:
          "border-red-500/25 bg-red-500/15 text-red-800 dark:text-red-200",
      };

    case "not_started":
    case "confirmation_required":
    default:
      return {
        label: "Confirmation required",
        badgeClass:
          "border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200",
      };
  }
}

function formatConfirmationType(
  value: ConfirmationDecision["confirmationType"]
) {
  switch (value) {
    case "internal_confirmation":
      return "Internal confirmation";
    case "owner_approval":
      return "Owner approval";
    case "manager_confirmation":
      return "Manager confirmation";
    case "reference_only":
      return "Reference only";
  }
}

function formatValue(
  value: string | null
) {
  if (!value) {
    return "Not classified";
  }

  return value
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

function formatDateTime(
  value: string | null
) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}