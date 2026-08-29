"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, RefreshCw, Trash2 } from "lucide-react";

/**
 * The shareable contract link, for the Contract tab.
 *
 * The API, the token hashing and the public route were all already written.
 * Only this was missing, which meant the feature existed in the database and
 * nowhere a broker could reach it.
 *
 * WHY THE URL APPEARS ONLY ONCE
 *
 * Only the SHA-256 hash of the token is stored, so the plaintext URL comes
 * back from the create call and can never be read again. That is a deliberate
 * security property, not an oversight, and it shapes this component: the URL
 * is held in local state after creation, and once the broker navigates away
 * the only honest thing to offer is a replacement link.
 *
 * Saying so plainly matters. A copy button that silently stops working is
 * worse than one that explains why it cannot.
 */

type ContractLink = {
  id: string;
  charterId: string;
  isActive: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  lastOpenedAt: string | null;
  openedCount: number;
  createdAt: string;
  updatedAt: string;
};

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ContractShareLink({ charterId }: { charterId: string }) {
  const [link, setLink] = useState<ContractLink | null>(null);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/charters/${charterId}/contract-link`,
        { cache: "no-store" }
      );

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Could not load the link.");
      }

      setLink(payload.link ?? null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load the contract link."
      );
    } finally {
      setIsLoading(false);
    }
  }, [charterId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createLink() {
    setIsWorking(true);
    setError("");

    try {
      const response = await fetch(
        `/api/charters/${charterId}/contract-link`,
        { method: "POST" }
      );

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Could not create the link.");
      }

      setLink(payload.link);

      /*
       * Absolute, because the broker is going to paste this into WhatsApp or
       * an email where a relative path means nothing.
       */
      setFreshUrl(`${window.location.origin}${payload.url}`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create the contract link."
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function revokeLink() {
    setIsWorking(true);
    setError("");

    try {
      const response = await fetch(
        `/api/charters/${charterId}/contract-link`,
        { method: "DELETE" }
      );

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Could not revoke the link.");
      }

      setLink(null);
      setFreshUrl(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not revoke the contract link."
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function copyUrl() {
    if (!freshUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(freshUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Select the link and copy it manually.");
    }
  }

  return (
    <div className="ui-panel-soft mt-5 rounded-xl px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            Client link
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Sends the current agreement without an attachment. Works over any
            channel, and always shows the latest version.
          </p>
        </div>

        {link ? (
          <button
            type="button"
            onClick={() => void revokeLink()}
            disabled={isWorking}
            className="ui-secondary-button apple-transition inline-flex min-h-9 shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-60"
          >
            <Trash2 className="size-3.5" />
            Revoke
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="mt-4 text-xs text-muted-foreground">Checking…</p>
      ) : link ? (
        <div className="mt-4 space-y-3">
          {freshUrl ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="w-full min-w-0 flex-1 truncate rounded-lg border border-border bg-background/60 px-3 py-2 text-[11px] text-foreground sm:w-auto">
                {freshUrl}
              </code>

              <button
                type="button"
                onClick={() => void copyUrl()}
                className="ui-primary-button apple-transition inline-flex min-h-9 shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
              >
                {copied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            /*
             * The link exists but its plaintext is gone, because only the hash
             * was stored. Offering a replacement is the only real option, and
             * saying why avoids the broker hunting for a copy button that was
             * never going to be there.
             */
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2.5">
              <p className="text-[11px] leading-5 text-muted-foreground">
                A link is active but can only be shown once, when it is
                created. Replace it to get a new URL you can copy. The old one
                stops working straight away.
              </p>

              <button
                type="button"
                onClick={() => void createLink()}
                disabled={isWorking}
                className="ui-secondary-button apple-transition mt-2.5 inline-flex min-h-9 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-60"
              >
                <RefreshCw
                  className={`size-3.5 ${isWorking ? "animate-spin" : ""}`}
                />
                Replace link
              </button>
            </div>
          )}

          {/*
            One column until there is room for three. At a 390px viewport the
            card has roughly 300px of usable width, so three boxes get 95px
            each and "Last opened" plus a date does not fit in that, which is
            what pushed the row past the screen edge.
          */}
          <dl className="grid grid-cols-1 gap-2 text-center sm:grid-cols-3">
            <div className="rounded-lg border border-border px-2 py-2">
              <dt className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                Opens
              </dt>
              <dd className="mt-0.5 font-mono text-sm tabular-nums text-foreground">
                {link.openedCount}
              </dd>
            </div>

            <div className="rounded-lg border border-border px-2 py-2">
              <dt className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                Last opened
              </dt>
              <dd className="mt-0.5 text-[10px] leading-4 text-foreground">
                {formatDateTime(link.lastOpenedAt)}
              </dd>
            </div>

            <div className="rounded-lg border border-border px-2 py-2">
              <dt className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                Expires
              </dt>
              <dd className="mt-0.5 text-[10px] leading-4 text-foreground">
                {formatDateTime(link.expiresAt)}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void createLink()}
          disabled={isWorking}
          className="ui-primary-button apple-transition mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 px-4 py-2 text-xs font-semibold disabled:opacity-60 sm:w-auto"
        >
          <Link2 className="size-3.5" />
          {isWorking ? "Creating…" : "Create client link"}
        </button>
      )}

      {error ? (
        <p className="mt-3 text-xs leading-5 text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}