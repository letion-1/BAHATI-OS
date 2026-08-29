"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ShieldOff } from "lucide-react";

import { SectionHeader } from "@/components/ui/section-header";

/**
 * The Art. 17 erasure control, for Settings.
 *
 * Two decisions here are about restraint rather than features.
 *
 * The confirmation asks for the workspace name typed exactly, not a checkbox
 * and not the word DELETE. A checkbox is one careless click, and DELETE
 * becomes muscle memory the second time someone sees it. Typing the name
 * forces the person to look at what they are about to erase.
 *
 * And the panel states plainly what will NOT be deleted. German retention law
 * keeps signed agreements and payment records for years regardless of the
 * request, and a broker who learns that afterwards has been misled by an
 * interface that promised more than the law allows.
 */

type DeletionRequest = {
  id: string;
  scope: string;
  status: string;
  requested_at: string;
  scheduled_for: string;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function daysUntil(value: string): number {
  const difference = new Date(value).getTime() - Date.now();

  return Math.max(0, Math.ceil(difference / 86_400_000));
}

export function AccountDeletionPanel({
  workspaceName,
  isOwner,
}: {
  workspaceName: string;
  isOwner: boolean;
}) {
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/account/deletion", {
        cache: "no-store",
      });

      const payload = await response.json();

      if (response.ok && payload.success) {
        setRequest(payload.request ?? null);
      }
    } catch {
      // Silent. A failure to read the pending request is not worth an alarm
      // on a settings page; the next load will show it.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setIsWorking(true);
    setError("");

    try {
      const response = await fetch("/api/account/deletion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "company",
          confirmation,
          reason: reason.trim() || undefined,
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Could not schedule the deletion.");
      }

      setRequest(payload.request);
      setIsOpen(false);
      setConfirmation("");
      setReason("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not schedule the deletion."
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function cancel() {
    setIsWorking(true);
    setError("");

    try {
      const response = await fetch("/api/account/deletion", {
        method: "DELETE",
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Could not cancel the request.");
      }

      setRequest(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not cancel the request."
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section className="ui-panel rounded-[28px] border-red-500/20 p-6">
      <SectionHeader
        eyebrow="Data protection"
        title="Delete this workspace"
        subtitle="Erases the account and its personal data under Article 17 GDPR. Some records are kept by law; the detail is below."
      />

      {request ? (
        <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/5 px-5 py-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
            Deletion scheduled
          </p>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Requested {formatDate(request.requested_at)}. The workspace will be
            erased on {formatDate(request.scheduled_for)}, in{" "}
            {daysUntil(request.scheduled_for)} days. You can cancel until then.
          </p>

          <button
            type="button"
            onClick={() => void cancel()}
            disabled={isWorking || request.status !== "pending"}
            className="ui-secondary-button apple-transition mt-4 inline-flex min-h-10 items-center px-4 py-2 text-xs font-semibold hover:bg-accent disabled:opacity-60"
          >
            {request.status === "pending"
              ? "Cancel deletion"
              : "Deletion in progress"}
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {/*
            Set out before the button, not after it. Someone reading this is
            deciding, and the retention rules change the decision.
          */}
          <div className="rounded-2xl border border-border px-5 py-5">
            <p className="text-sm font-semibold text-foreground">
              What happens
            </p>

            <ul className="mt-3 space-y-2.5 text-sm leading-6 text-muted-foreground">
              <li>
                <span className="text-foreground">Erased immediately:</span>{" "}
                guest health data, dietary and accessibility notes, and every
                live share link. These have no retention basis.
              </li>
              <li>
                <span className="text-foreground">
                  Erased after 30 days:
                </span>{" "}
                inquiries, notifications, connected mailboxes and drafts.
              </li>
              <li>
                <span className="text-foreground">Kept, but locked away:</span>{" "}
                signed agreements, invoices and payment records. German tax law
                (§147 AO, §257 HGB) requires between six and ten years. They
                disappear from Bahari OS and remain available only to the tax
                authority.
              </li>
              <li>
                <span className="text-foreground">Anonymised:</span> client
                records attached to a retained charter keep the charter
                coherent without keeping a name, email or phone number.
              </li>
            </ul>
          </div>

          {isOwner ? (
            isOpen ? (
              <div className="rounded-2xl border border-red-500/25 bg-red-500/5 px-5 py-5">
                <label className="block text-sm font-medium text-foreground">
                  Type <span className="font-semibold">{workspaceName}</span> to
                  confirm
                  <input
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"
                    autoComplete="off"
                  />
                </label>

                <label className="mt-4 block text-sm font-medium text-foreground">
                  Reason (optional)
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={2}
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"
                  />
                </label>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={
                      isWorking ||
                      confirmation.trim().toLowerCase() !==
                        workspaceName.trim().toLowerCase()
                    }
                    className="apple-transition inline-flex min-h-10 items-center rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {isWorking ? "Scheduling…" : "Schedule deletion"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      setConfirmation("");
                      setError("");
                    }}
                    className="ui-secondary-button apple-transition inline-flex min-h-10 items-center px-4 py-2 text-xs font-semibold hover:bg-accent"
                  >
                    Keep my workspace
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="apple-transition inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-500/30 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-500/10 dark:text-red-300"
              >
                <ShieldOff className="size-3.5" />
                Request deletion
              </button>
            )
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              Only the workspace owner can delete the account. To have your own
              personal data erased, ask them to remove your membership.
            </p>
          )}
        </div>
      )}

      {error ? (
        <p className="mt-4 text-sm leading-6 text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </section>
  );
}