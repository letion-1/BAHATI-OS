"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";

/**
 * Delete control for a single inquiry.
 *
 * Two-step by design. A single-click delete sitting next to "Open inquiry" is
 * a mis-tap away from destroying a client record, and there is no undo. The
 * confirmation names the client so the broker can see which one they are
 * about to remove.
 */
export function DeleteInquiryButton({
  inquiryId,
  clientName,
}: {
  inquiryId: string;
  clientName: string;
}) {
  const router = useRouter();

  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // createPortal needs `document`, which does not exist while the server
  // renders. Gate on mount so the markup matches on hydration.
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  async function remove() {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/inquiries/${inquiryId}`, {
        method: "DELETE",
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setError(payload.error ?? "Could not delete that inquiry.");
        return;
      }

      setIsConfirming(false);
      // Refresh rather than filtering locally, so the list reflects the
      // database rather than an optimistic guess about it.
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsDeleting(false);
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
        aria-label={`Delete inquiry from ${clientName}`}
        className="apple-transition inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border bg-transparent text-sm text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-4" />
        Delete
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
                    Delete this inquiry?
                  </h2>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    The inquiry from{" "}
                    <span className="font-medium text-foreground">
                      {clientName}
                    </span>{" "}
                    will be removed permanently. This cannot be undone.
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

            {error ? (
              <p
                role="alert"
                className="mt-5 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive"
              >
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsConfirming(false)}
                disabled={isDeleting}
                className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-5 text-sm font-semibold disabled:opacity-60"
              >
                Keep it
              </button>

              <button
                type="button"
                onClick={() => void remove()}
                disabled={isDeleting}
                className="apple-transition inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-destructive px-6 text-sm font-semibold text-destructive-foreground hover:-translate-y-0.5 hover:opacity-90 disabled:pointer-events-none disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Deleting
                  </>
                ) : (
                  <>
                    <Trash2 className="size-4" />
                    Delete inquiry
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
