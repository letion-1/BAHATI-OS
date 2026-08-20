"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";

/**
 * Withdraw control for a proposal.
 *
 * The wording matters here. A proposal is not a separate record: it is an
 * inquiry with proposal fields filled in. So this removes the proposal and
 * returns the inquiry to the pipeline, and the dialog says exactly that,
 * because a broker who expects the client to disappear and finds them still
 * in Inquiries will assume the delete failed.
 *
 * Sent and accepted proposals can still be withdrawn, but the warning is
 * sharper: the client already holds the PDF, and withdrawing here does not
 * reach into their inbox.
 */
export function WithdrawProposalButton({
  proposalId,
  clientName,
  proposalStatus,
  onWithdrawn,
}: {
  proposalId: string;
  clientName: string;
  proposalStatus: string | null;
  /** Called after a successful withdraw, so the list can refresh. */
  onWithdrawn?: () => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // createPortal needs `document`, which does not exist while the server
  // renders. Gate on mount so the markup matches on hydration.
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const status = (proposalStatus ?? "").toLowerCase();
  const alreadyWithClient = status === "sent" || status === "accepted";

  async function withdraw() {
    setIsWorking(true);
    setError(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}`, {
        method: "DELETE",
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setError(payload.error ?? "Could not withdraw that proposal.");
        return;
      }

      setIsConfirming(false);
      onWithdrawn?.();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setIsConfirming(true);
        }}
        aria-label={`Withdraw proposal for ${clientName}`}
        className="apple-transition inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-4" />
        Withdraw
      </button>

      {isConfirming && isMounted
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-md dark:bg-black/80">
          <div className="w-full max-w-md rounded-[24px] border border-border bg-card p-6 shadow-[var(--strong-shadow)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-destructive/25 bg-destructive/10 text-destructive">
                  <AlertTriangle className="size-4" />
                </div>

                <div>
                  <h2 className="font-heading text-lg text-foreground">
                    Withdraw this proposal?
                  </h2>

                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    The proposal for{" "}
                    <span className="font-medium text-foreground">
                      {clientName}
                    </span>{" "}
                    will be removed, along with its yacht selection and PDF.
                  </p>

                  <p className="mt-2.5 text-sm leading-6 text-muted-foreground">
                    Their inquiry stays in your pipeline and returns to
                    qualified, so you can build a new proposal for them.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                aria-label="Cancel"
                className="apple-transition rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {alreadyWithClient ? (
              <p className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-foreground">
                This proposal was already{" "}
                <span className="font-medium">{status}</span>. The client has
                their copy, and withdrawing it here does not recall it from
                their inbox.
              </p>
            ) : null}

            {error ? (
              <p
                role="alert"
                className="mt-4 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive"
              >
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                disabled={isWorking}
                className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-5 text-sm font-semibold disabled:opacity-60"
              >
                Keep it
              </button>

              <button
                type="button"
                onClick={() => void withdraw()}
                disabled={isWorking}
                className="apple-transition inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-destructive px-6 text-sm font-semibold text-destructive-foreground hover:-translate-y-0.5 hover:opacity-90 disabled:pointer-events-none disabled:opacity-60"
              >
                {isWorking ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Withdrawing
                  </>
                ) : (
                  <>
                    <Trash2 className="size-4" />
                    Withdraw proposal
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null}
    </>
  );
}
