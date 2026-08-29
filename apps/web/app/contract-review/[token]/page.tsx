"use client";

import {
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  Ship,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

/**
 * What the client sees when they open a contract link.
 *
 * Kept plainer than the proposal review page on purpose. A proposal is a
 * pitch and is allowed to sell; a contract is a document someone is about to
 * be bound by, and the page around it should get out of the way. Enough
 * detail for them to confirm it is their charter, then the download.
 */

type ContractPayload = {
  success: true;
  charter: {
    reference: string;
    clientName: string;
    yachtName: string;
    startDate: string | null;
    endDate: string | null;
    destination: string | null;
    embarkationPort: string | null;
    disembarkationPort: string | null;
    guests: number | null;
    contractStatus: string | null;
  };
  document: {
    name: string;
    version: number;
    mimeType: string | null;
    createdAt: string;
    downloadUrl: string;
    expiresInSeconds: number;
  };
};

type ErrorPayload = {
  success: false;
  error: string;
  message: string;
};

export default function ContractReviewPage() {
  const params = useParams<{ token: string }>();

  const [data, setData] = useState<ContractPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = params?.token;

    if (typeof token !== "string") {
      setError("This link is not valid.");
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          `/api/public/contracts/${encodeURIComponent(token as string)}`,
          { cache: "no-store" }
        );

        const payload = (await response.json()) as
          | ContractPayload
          | ErrorPayload;

        if (cancelled) {
          return;
        }

        if (!payload.success) {
          setError(payload.message);
          return;
        }

        setData(payload);
      } catch {
        if (!cancelled) {
          setError(
            "This contract could not be loaded. Please check your connection and try again."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4 sm:px-8">
          <div className="flex size-10 items-center justify-center rounded-2xl border border-border bg-background">
            <Ship className="size-4 text-cyan-700 dark:text-cyan-300" />
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Charter agreement
            </p>
            <p className="mt-0.5 text-sm font-semibold">
              {data?.charter.reference ?? "Secure document"}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        {isLoading ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading your charter agreement
          </div>
        ) : null}

        {error && !isLoading ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-medium">Link unavailable</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {error}
              </p>
            </div>
          </div>
        ) : null}

        {data && !isLoading ? (
          <>
            <h1 className="text-balance text-3xl font-medium leading-tight tracking-[-0.03em] sm:text-4xl">
              {data.charter.yachtName}
            </h1>

            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Prepared for {data.charter.clientName}. Please review the
              agreement below and return a signed copy to your broker.
            </p>

            <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Detail
                label="Dates"
                value={formatRange(
                  data.charter.startDate,
                  data.charter.endDate
                )}
              />
              <Detail
                label="Destination"
                value={data.charter.destination ?? "Not specified"}
              />
              <Detail
                label="Guests"
                value={
                  data.charter.guests !== null
                    ? String(data.charter.guests)
                    : "Not specified"
                }
              />
              <Detail
                label="Embarkation"
                value={data.charter.embarkationPort ?? "To be confirmed"}
              />
              <Detail
                label="Disembarkation"
                value={data.charter.disembarkationPort ?? "To be confirmed"}
              />
              <Detail
                label="Reference"
                value={data.charter.reference}
              />
            </dl>

            <div className="mt-10 rounded-2xl border border-border bg-card px-5 py-5">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {data.document.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Version {data.document.version}
                  </p>
                </div>
              </div>

              <a
                href={data.document.downloadUrl}
                className="ui-primary-button apple-transition mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 px-6 text-sm font-semibold hover:opacity-90"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="size-4" />
                Download the agreement
              </a>

              {/*
                Stated rather than left to be discovered. The signed storage
                URL is short lived, so a client who leaves this tab open
                overnight and then clicks would otherwise get an opaque
                storage error with nothing telling them to refresh.
              */}
              <p className="mt-3 text-center text-xs text-muted-foreground">
                This download link is valid for a few minutes. Refresh this
                page if it stops working.
              </p>
            </div>

            <p className="mt-8 text-xs leading-6 text-muted-foreground">
              This page is private to you. Please do not forward it, as anyone
              with the link can view the agreement.
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function formatRange(start: string | null, end: string | null): string {
  if (!start || !end) {
    return "To be confirmed";
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return `${formatter.format(new Date(start))} to ${formatter.format(
    new Date(end)
  )}`;
}