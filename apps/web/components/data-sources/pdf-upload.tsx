"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  ScanLine,
  Upload,
  X,
} from "lucide-react";

/**
 * PDF upload with a preview step.
 *
 * The preview is not decoration. A misread supplier PDF is worse than no data
 * at all, because wrong availability reaches a client as though it were
 * checked. So this shows what was extracted and waits for the broker to
 * confirm before anything is written to the fleet.
 */

type ParsedYacht = {
  name?: string | null;
  sourceKey?: string | null;
};

type ParsedAvailability = {
  yachtName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
};

type PdfMeta = {
  pageCount: number;
  scannedPages: number[];
  lowConfidencePages: number[];
  requiresAiExtraction: boolean;
  bestConfidence: number;
};

type UploadResult =
  | {
      parsed: true;
      fileName: string | null;
      pdf: PdfMeta;
      layout: string;
      detectionConfidence: number;
      yachtCount: number;
      availabilityCount: number;
      yachts: ParsedYacht[];
      availability: ParsedAvailability[];
    }
  | {
      parsed: false;
      reason: "scanned" | "unstructured";
      pdf: PdfMeta;
      message: string;
    };

const MAX_BYTES = 25 * 1024 * 1024;

export function PdfUpload({
  onConfirm,
  onClose,
}: {
  /** Called when the broker accepts the extraction. */
  onConfirm?: (result: Extract<UploadResult, { parsed: true }>) => void;
  onClose?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function upload(file: File) {
    setError(null);
    setResult(null);
    setFileName(file.name);

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("That is not a PDF file.");
      return;
    }

    if (file.size > MAX_BYTES) {
      setError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 25MB.`
      );
      return;
    }

    setIsUploading(true);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/data-sources/pdf", {
        method: "POST",
        body,
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setError(payload.error ?? "Could not read that PDF.");
        return;
      }

      setResult(payload.data as UploadResult);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setIsUploading(false);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
    setFileName(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------- drop zone */}
      {!result ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);

            const file = event.dataTransfer.files[0];
            if (file) {
              void upload(file);
            }
          }}
          className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
            isDragging
              ? "border-cyan-300/60 bg-cyan-300/5"
              : "border-border bg-background/40"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void upload(file);
              }
            }}
          />

          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="size-7 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Reading {fileName}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="size-7 text-muted-foreground" />

              <div>
                <p className="text-sm font-medium text-foreground">
                  Drop an availability PDF here
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Or{" "}
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    browse for a file
                  </button>
                  . Up to 25MB, 60 pages.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* -------------------------------------------------------- error */}
      {error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {/* --------------------------------- could not parse: scan / prose */}
      {result && !result.parsed ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-4">
            <ScanLine className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />

            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {result.reason === "scanned"
                  ? "This looks like a scan"
                  : "No readable table found"}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                {result.message}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Pages" value={String(result.pdf.pageCount)} />
            <Stat
              label="Scanned"
              value={String(result.pdf.scannedPages.length)}
            />
            <Stat
              label="No table"
              value={String(result.pdf.lowConfidencePages.length)}
            />
          </dl>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={reset}
              className="ui-secondary-button apple-transition inline-flex min-h-11 items-center px-5 text-sm font-semibold"
            >
              Try another file
            </button>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------- parsed: the preview */}
      {result && result.parsed ? (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-4">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />

            <div>
              <p className="text-sm font-medium text-foreground">
                Read {result.fileName ?? "the PDF"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Check these look right before adding them to your fleet.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Yachts" value={String(result.yachtCount)} />
            <Stat
              label="Availability"
              value={String(result.availabilityCount)}
            />
            <Stat label="Pages" value={String(result.pdf.pageCount)} />
          </dl>

          {result.pdf.lowConfidencePages.length > 0 ||
          result.pdf.scannedPages.length > 0 ? (
            <p className="rounded-xl border border-border bg-background/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
              Some pages could not be read as tables (
              {[...result.pdf.scannedPages, ...result.pdf.lowConfidencePages]
                .sort((a, b) => a - b)
                .join(", ")}
              ). Anything on those pages is not included below.
            </p>
          ) : null}

          {/* Sample rows. The broker checks these against what they know. */}
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-background/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Yacht</th>
                  <th className="px-4 py-3 font-medium">From</th>
                  <th className="px-4 py-3 font-medium">To</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>

              <tbody>
                {result.availability.slice(0, 8).map((row, index) => (
                  <tr
                    key={`${row.yachtName}-${row.startDate}-${index}`}
                    className="border-t border-border/60"
                  >
                    <td className="px-4 py-3 text-foreground">
                      {row.yachtName ?? "Unknown"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.startDate ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.endDate ?? "\u2014"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.availabilityCount > 8 ? (
            <p className="text-xs text-muted-foreground">
              Showing 8 of {result.availabilityCount} rows.
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={reset}
              className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-5 text-sm font-semibold"
            >
              Discard
            </button>

            <button
              type="button"
              onClick={() => {
                onConfirm?.(result);
                onClose?.();
              }}
              className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center gap-2 px-6 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
            >
              <FileText className="size-4" />
              Add to fleet
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/40 px-4 py-4">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-heading text-2xl text-foreground">{value}</dd>
    </div>
  );
}

function StatusPill({ status }: { status?: string | null }) {
  const value = status ?? "unknown";

  // Available is the only status that leads to a quote, so it is the one that
  // has to be unmistakable at a glance.
  const tone =
    value === "available"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : value === "booked"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border bg-background/60 text-muted-foreground";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${tone}`}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function PdfUploadPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            New connection
          </p>
          <h2 className="mt-1 font-heading text-xl text-foreground">
            Upload a PDF
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            For availability sent as a file rather than a link.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="apple-transition rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <PdfUpload onClose={onClose} />
    </div>
  );
}
