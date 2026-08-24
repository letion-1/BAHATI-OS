"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FileText,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { HeroCard } from "@/components/ui/hero-card";
import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PdfUploadPanel } from "@/components/data-sources/pdf-upload";

type SourceType =
  | "google_sheets"
  | "dropbox_excel"
  | "website"
  | "pdf";

type SyncSummary = {
  sheetCount?: number;
  sheetNames?: string[];
  rowCount?: number;
  populatedCellCount?: number;
  styledCellCount?: number;
  formulaCellCount?: number;
  mergeCount?: number;
  recordCount?: number;
  characterCount?: number;
  linkCount?: number;
  jsonLdCount?: number;
  yachtCount?: number;
  availabilityCount?: number;
  fleetInserted?: number;
  fleetUpdated?: number;
  availabilityInserted?: number;
  availabilitySkipped?: number;
  availabilityDeleted?: number;
};

type LastSyncConfiguration = {
  success?: boolean;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  connector_kind?: "workbook" | "website";
  summary?: SyncSummary;
  error?: string;
};

type DataSourceConfiguration = {
  last_sync?: LastSyncConfiguration;
  [key: string]: unknown;
};

type DataSource = {
  id: string;
  company_id: string;
  name: string;
  source_type: SourceType;
  source_url: string | null;
  external_reference?: string | null;
  status?: string | null;
  sync_frequency_minutes?: number | null;
  next_sync_at?: string | null;
  is_active?: boolean | null;
  // Written by every import path and returned by select("*"). The card
  // prefers configuration.last_sync.summary, but falls back to these so a
  // source that imported before last_sync was recorded still shows its work.
  yacht_count?: number | null;
  availability_count?: number | null;
  configuration?: DataSourceConfiguration | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type DataSourcesResponse = {
  data?: DataSource[];
  error?: string;
};

type SyncResponse = {
  success?: boolean;
  error?: string;

  source?: {
    id?: string;
    name?: string;
    type?: SourceType;
    url?: string | null;
  };

  sync?: {
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
    nextSyncAt?: string;
  };

  result?: {
    kind?: "workbook" | "website";
    summary?: SyncSummary;
    preview?: Record<string, unknown>;
    import?: {
      fleet?: {
        inserted?: number;
        updated?: number;
        total?: number;
      };
      availability?: {
        deleted?: number;
        inserted?: number;
        skipped?: number;
        total?: number;
      };
    } | null;
  };
};

type CreateSourceForm = {
  name: string;
  sourceType: SourceType;
  sourceUrl: string;
  syncFrequencyMinutes: number;
};

const emptyForm: CreateSourceForm = {
  name: "",
  sourceType: "google_sheets",
  sourceUrl: "",
  syncFrequencyMinutes: 15,
};

const sourceTypeLabels: Record<SourceType, string> = {
  google_sheets: "Google Sheets",
  dropbox_excel: "Dropbox Excel",
  website: "Website",
  pdf: "PDF",
};

function sourceIcon(sourceType: SourceType) {
  if (sourceType === "google_sheets") {
    return FileSpreadsheet;
  }

  if (sourceType === "dropbox_excel") {
    return Database;
  }

  if (sourceType === "pdf") {
    return FileText;
  }

  return Globe;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getLastSync(
  source: DataSource
): LastSyncConfiguration | null {
  const configuration = source.configuration;

  if (!configuration || typeof configuration !== "object") {
    return null;
  }

  const lastSync = configuration.last_sync;

  if (!lastSync || typeof lastSync !== "object") {
    return null;
  }

  return lastSync;
}

/*
 * Counts come from the last sync summary when there is one, and from the
 * source's own columns when there is not.
 *
 * Reading only the summary is what made an uploaded PDF render "0 links" on a
 * card whose yacht_count column held a real number: the upload path wrote a
 * flat configuration with no last_sync key, every field fell through to zero,
 * and the zero-yachts branch of the card printed the links line instead.
 */
function getImportCounts(source: DataSource) {
  const summary = getLastSync(source)?.summary;

  const yachts =
    typeof summary?.yachtCount === "number"
      ? summary.yachtCount
      : typeof source.yacht_count === "number"
        ? source.yacht_count
        : 0;

  const availability =
    typeof summary?.availabilityCount === "number"
      ? summary.availabilityCount
      : typeof source.availability_count === "number"
        ? source.availability_count
        : 0;

  return {
    yachts,
    availability,
    links:
      typeof summary?.linkCount === "number"
        ? summary.linkCount
        : 0,
  };
}

function getImportedCount(source: DataSource) {
  const counts = getImportCounts(source);

  return (
    counts.yachts +
    counts.availability +
    counts.links
  );
}

function getEffectiveStatus(source: DataSource) {
  const storedStatus =
    source.status?.toLowerCase();

  const lastSync =
    getLastSync(source);

  if (
    storedStatus === "syncing" &&
    lastSync?.success === true &&
    lastSync.finished_at
  ) {
    return "healthy";
  }

  return storedStatus ?? "unknown";
}

function statusLabel(source: DataSource) {
  const status = getEffectiveStatus(source);

  if (status === "healthy") {
    return "Healthy";
  }

  if (status === "syncing") {
    return "Syncing";
  }

  if (status === "error") {
    return "Needs attention";
  }

  if (status === "pending") {
    return "Pending";
  }

  return source.status || "Unknown";
}

function createSuccessfulLastSync(
  payload: SyncResponse,
  fallbackFinishedAt: string
): LastSyncConfiguration {
  return {
    success: true,
    started_at: payload.sync?.startedAt,
    finished_at:
      payload.sync?.finishedAt ?? fallbackFinishedAt,
    duration_ms: payload.sync?.durationMs,
    connector_kind: payload.result?.kind,
    summary: {
      ...(payload.result?.summary ?? {}),
      yachtCount:
        payload.result?.summary?.yachtCount ??
        payload.result?.import?.fleet?.total,
      availabilityCount:
        payload.result?.summary?.availabilityCount ??
        payload.result?.import?.availability?.inserted,
    },
  };
}

export default function DataSourcesPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [form, setForm] =
    useState<CreateSourceForm>(emptyForm);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [syncingIds, setSyncingIds] = useState<Set<string>>(
    () => new Set()
  );

  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(
    () => new Set()
  );

  /*
   * Store only the selected ID.
   *
   * The modal source is always derived from the latest sources state,
   * preventing it from holding an old "syncing" snapshot.
   */
  const [selectedSourceId, setSelectedSourceId] = useState<
    string | null
  >(null);

  const [lastSyncResult, setLastSyncResult] =
    useState<SyncResponse | null>(null);

  const selectedSource = useMemo(
    () =>
      selectedSourceId
        ? sources.find(
            (source) => source.id === selectedSourceId
          ) ?? null
        : null,
    [selectedSourceId, sources]
  );

  const loadSources = useCallback(async () => {
    setPageError("");

    try {
      const response = await fetch("/api/data-sources", {
        method: "GET",
        cache: "no-store",
      });

      const responseText = await response.text();

      let payload: DataSourcesResponse = {};

      if (responseText) {
        try {
          payload = JSON.parse(
            responseText
          ) as DataSourcesResponse;
        } catch {
          throw new Error(
            "The data-sources API returned an invalid response."
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          payload.error || "Could not load data sources."
        );
      }

      const normalizedSources = (payload.data ?? []).map(
        (source) =>
          getEffectiveStatus(source) === "healthy"
            ? {
                ...source,
                status: "healthy",
              }
            : source
      );

      setSources(normalizedSources);

      return normalizedSources;
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Could not load data sources."
      );

      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const attentionCount = useMemo(
    () =>
      sources.filter(
        (source) =>
          getEffectiveStatus(source) === "error"
      ).length,
    [sources]
  );

  const synchronizedCount = useMemo(
    () =>
      sources.reduce(
        (total, source) =>
          total + getImportedCount(source),
        0
      ),
    [sources]
  );

  async function createSource(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setCreateError("");
    setSuccessMessage("");
    setPageError("");
    setIsCreating(true);

    try {
      const response = await fetch("/api/data-sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const responseText = await response.text();

      let payload: {
        data?: DataSource;
        error?: string;
      } = {};

      if (responseText) {
        try {
          payload = JSON.parse(responseText) as {
            data?: DataSource;
            error?: string;
          };
        } catch {
          throw new Error(
            "The server returned an invalid response."
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "Could not add the data source."
        );
      }

      if (payload.data) {
        setSources((current) => [
          payload.data as DataSource,
          ...current,
        ]);
      } else {
        await loadSources();
      }

      setForm(emptyForm);
      setIsAddOpen(false);

      setSuccessMessage(
        "Data source added. It is ready for its first sync."
      );
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Could not add the data source."
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function requestSourceSync(
    source: DataSource
  ): Promise<SyncResponse> {
    const response = await fetch(
      `/api/data-sources/${source.id}/sync`,
      {
        method: "POST",
      }
    );

    const responseText = await response.text();

    let payload: SyncResponse = {};

    if (responseText) {
      try {
        payload = JSON.parse(responseText) as SyncResponse;
      } catch {
        throw new Error(
          "The synchronization API returned invalid JSON."
        );
      }
    }

    if (!response.ok || !payload.success) {
      throw new Error(
        payload.error || "Synchronization failed."
      );
    }

    return payload;
  }

  function markSourceSyncing(sourceId: string) {
    setSyncingIds((current) => {
      const next = new Set(current);
      next.add(sourceId);
      return next;
    });

    setSources((current) =>
      current.map((source) =>
        source.id === sourceId
          ? {
              ...source,
              status: "syncing",
            }
          : source
      )
    );
  }

  function clearSourceSyncing(sourceId: string) {
    setSyncingIds((current) => {
      const next = new Set(current);
      next.delete(sourceId);
      return next;
    });
  }

  function markSourceSuccessful(
    sourceId: string,
    payload: SyncResponse
  ) {
    const finishedAt =
      payload.sync?.finishedAt ??
      new Date().toISOString();

    setSources((current) =>
      current.map((source) =>
        source.id === sourceId
          ? {
              ...source,
              status: "healthy",
              next_sync_at:
                payload.sync?.nextSyncAt ??
                source.next_sync_at,
              configuration: {
                ...(source.configuration ?? {}),
                last_sync: createSuccessfulLastSync(
                  payload,
                  finishedAt
                ),
              },
              updated_at: finishedAt,
            }
          : source
      )
    );
  }

  function markSourceFailed(
    sourceId: string,
    message: string
  ) {
    const finishedAt = new Date().toISOString();

    setSources((current) =>
      current.map((source) =>
        source.id === sourceId
          ? {
              ...source,
              status: "error",
              configuration: {
                ...(source.configuration ?? {}),
                last_sync: {
                  success: false,
                  finished_at: finishedAt,
                  error: message,
                },
              },
              updated_at: finishedAt,
            }
          : source
      )
    );
  }

  async function deleteSource(source: DataSource) {
    const confirmed = window.confirm(
      "Are you sure you want to remove?"
    );

    if (!confirmed) {
      return;
    }

    setPageError("");
    setSuccessMessage("");

    setDeletingIds((current) => {
      const next = new Set(current);
      next.add(source.id);
      return next;
    });

    try {
      const response = await fetch(
        `/api/data-sources/${encodeURIComponent(source.id)}`,
        {
          method: "DELETE",
        }
      );

      const responseText = await response.text();

      let payload: {
        success?: boolean;
        error?: string;
      } = {};

      if (responseText) {
        try {
          payload = JSON.parse(responseText) as {
            success?: boolean;
            error?: string;
          };
        } catch {
          throw new Error(
            "The remove-source API returned an invalid response."
          );
        }
      }

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error || "Could not remove the data source."
        );
      }

      setSources((current) =>
        current.filter((item) => item.id !== source.id)
      );

      if (selectedSourceId === source.id) {
        setSelectedSourceId(null);
      }

      setSuccessMessage(
        `${source.name} and all imported data were removed.`
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Could not remove the data source."
      );
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(source.id);
        return next;
      });
    }
  }

  async function syncSource(source: DataSource) {
    setPageError("");
    setSuccessMessage("");
    setLastSyncResult(null);

    markSourceSyncing(source.id);

    try {
      const payload = await requestSourceSync(source);

      /*
       * Update local state immediately.
       * This stops the spinner before any background refresh.
       */
      markSourceSuccessful(source.id, payload);
      setLastSyncResult(payload);

      setSuccessMessage(
        `${source.name} synchronized successfully.`
      );

      /*
       * Refresh from Supabase afterward.
       *
       * We then reapply the confirmed successful state so a stale
       * "syncing" database response cannot restart the spinner.
       */
      await loadSources();
      markSourceSuccessful(source.id, payload);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Synchronization failed.";

      markSourceFailed(source.id, message);

      setPageError(`${source.name}: ${message}`);
    } finally {
      /*
       * The spinner is controlled only by syncingIds.
       * A stale database status cannot keep it spinning.
       */
      clearSourceSyncing(source.id);
    }
  }

  async function syncAllSources() {
    if (sources.length === 0 || isSyncingAll) {
      return;
    }

    /*
     * An uploaded file has no URL to poll. Sending it to the sync endpoint
     * anyway means fetchDataSource throws "The data source does not have a
     * source URL", the row is marked failed, and a PDF that imported
     * perfectly wears a Needs attention badge until someone deletes it.
     *
     * The per-source Sync now button already hides itself for these. Sync all
     * did not, which is how every upload in the workspace ended up red at
     * once.
     */
    const syncableSources = sources.filter(
      (source) => Boolean(source.source_url?.trim())
    );

    if (syncableSources.length === 0) {
      setPageError("");
      setSuccessMessage(
        "Nothing to synchronize. Uploaded files have no source to re-read."
      );
      return;
    }

    setIsSyncingAll(true);
    setPageError("");
    setSuccessMessage("");
    setLastSyncResult(null);

    const sourceSnapshot = syncableSources;

    setSyncingIds(
      new Set(sourceSnapshot.map((source) => source.id))
    );

    const syncingIdSet = new Set(
      sourceSnapshot.map((source) => source.id)
    );

    setSources((current) =>
      current.map((source) =>
        syncingIdSet.has(source.id)
          ? { ...source, status: "syncing" }
          : source
      )
    );

    const successfulResults = new Map<
      string,
      SyncResponse
    >();

    const failedResults = new Map<string, string>();

    try {
      for (const source of sourceSnapshot) {
        try {
          const payload = await requestSourceSync(source);

          successfulResults.set(source.id, payload);
          markSourceSuccessful(source.id, payload);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Synchronization failed.";

          failedResults.set(source.id, message);
          markSourceFailed(source.id, message);
        } finally {
          clearSourceSyncing(source.id);
        }
      }

      await loadSources();

      /*
       * Reapply final states after loading database records.
       * This prevents an old "syncing" value from returning.
       */
      for (const [sourceId, payload] of successfulResults) {
        markSourceSuccessful(sourceId, payload);
      }

      for (const [sourceId, message] of failedResults) {
        markSourceFailed(sourceId, message);
      }

      if (failedResults.size > 0) {
        setPageError(
          `${failedResults.size} source${
            failedResults.size === 1 ? "" : "s"
          } failed to synchronize.`
        );
      } else {
        setSuccessMessage(
          "All data sources synchronized successfully."
        );
      }
    } finally {
      setSyncingIds(new Set());
      setIsSyncingAll(false);
    }
  }

  return (
    <PageContainer>
      <div>
        <HeroCard
          eyebrow="Fleet intelligence"
          title="Data Sources"
          description="Connect Google Sheets, Dropbox workbooks, PDFs and live websites. Every source is scanned, normalized and folded into one private fleet database."
          actions={
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => setIsUploadOpen(true)}
                className="ui-secondary-button apple-transition h-11 px-5 text-sm font-semibold hover:-translate-y-0.5"
              >
                <FileText className="size-4" />
                Upload PDF
              </Button>

              <Button
                onClick={() => setIsAddOpen(true)}
                className="ui-primary-button apple-transition h-11 px-5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
              >
                <Plus className="size-4" />
                Add source
              </Button>
            </div>
          }
        />

        {pageError ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.08] p-4 text-sm text-red-700 dark:text-red-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{pageError}</span>
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.08] p-4 text-sm text-emerald-700 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        ) : null}

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <StatCard
            label="Connected"
            value={sources.length}
            subtitle="Active source connections"
            icon={<Database className="size-5" />}
            tone="cyan"
          />

          <StatCard
            label="Database"
            value={synchronizedCount}
            subtitle="Normalized imported records"
            icon={<FileSpreadsheet className="size-5" />}
            tone="violet"
          />

          <StatCard
            label="Health"
            value={
              sources.length === 0
                ? "—"
                : `${Math.round(
                    ((sources.length - attentionCount) /
                      sources.length) *
                      100
                  )}%`
            }
            subtitle={
              attentionCount === 0
                ? "All sources operating normally"
                : `${attentionCount} source${
                    attentionCount === 1 ? "" : "s"
                  } need attention`
            }
            icon={
              attentionCount === 0 ? (
                <CheckCircle2 className="size-5" />
              ) : (
                <AlertTriangle className="size-5" />
              )
            }
            tone={attentionCount === 0 ? "emerald" : "amber"}
          />
        </section>

        <section className="mt-10">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/75">
                Connected fleet feeds
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                Source connections
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Monitor sync health, inspect imported records and refresh data.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-2xl border-border bg-background/45 px-4 text-foreground/85 hover:bg-accent"
              onClick={() => void syncAllSources()}
              disabled={isSyncingAll || isLoading || sources.length === 0}
            >
              {isSyncingAll ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {isSyncingAll ? "Syncing all..." : "Sync all"}
            </Button>
          </div>

          {isLoading ? (
            <Card className="rounded-[24px] border-border bg-card text-card-foreground">
              <CardContent className="flex items-center justify-center gap-3 p-14 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                Loading data sources...
              </CardContent>
            </Card>
          ) : null}

          {!isLoading && sources.length === 0 ? (
            <Card className="rounded-[28px] border-dashed border-border bg-card text-foreground">
              <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="flex size-16 items-center justify-center rounded-[22px] border border-border bg-background/55 text-muted-foreground">
                  <Database className="size-7" />
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-[-0.02em]">
                  Connect your first fleet
                </h3>
                <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                  Add a Google Sheet, Dropbox workbook or website to begin building your synchronized charter database.
                </p>
                <Button
                  className="mt-7 h-11 rounded-2xl bg-white px-5 text-zinc-950 hover:opacity-90"
                  onClick={() => setIsAddOpen(true)}
                >
                  <Plus className="size-4" />
                  Add your first source
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <div className="space-y-4">
            {sources.map((source) => {
              const Icon = sourceIcon(source.source_type);
              const label = statusLabel(source);
              const syncing = syncingIds.has(source.id);
              const healthy =
                !syncing && getEffectiveStatus(source) === "healthy";
              const lastSync = getLastSync(source);
              const lastSyncDate = lastSync?.finished_at ?? source.updated_at;
              const displayedLabel = syncing ? "Syncing" : label;
              const counts = getImportCounts(source);

              return (
                <Card
                  key={source.id}
                  className="ui-panel apple-transition overflow-hidden rounded-[26px] hover:-translate-y-0.5 hover:border-ring/25"
                >
                  <CardContent className="p-0">
                    <div className="grid lg:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="flex min-w-0 items-start gap-4 p-5 sm:p-6">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-[18px] border border-border bg-background/55 text-foreground/80">
                          <Icon className="size-5" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <h3 className="text-base font-semibold tracking-[-0.02em]">
                              {source.name}
                            </h3>
                            <Badge
                              variant="outline"
                              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                syncing
                                  ? "border-amber-400/20 bg-amber-400/[0.08] text-amber-800 dark:text-amber-200"
                                  : healthy
                                    ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-700 dark:text-emerald-200"
                                    : "border-red-400/20 bg-red-400/[0.08] text-red-700 dark:text-red-200"
                              }`}
                            >
                              {syncing ? (
                                <Loader2 className="mr-1 size-3 animate-spin" />
                              ) : (
                                <span className={`mr-1 inline-block size-1.5 rounded-full ${healthy ? "bg-emerald-400" : "bg-red-400"}`} />
                              )}
                              {displayedLabel}
                            </Badge>
                          </div>

                          <p className="mt-1.5 text-sm text-muted-foreground">
                            {sourceTypeLabels[source.source_type]}
                          </p>

                          {lastSync?.error ? (
                            <p className="mt-3 max-w-xl rounded-xl border border-red-400/15 bg-red-400/[0.06] px-3 py-2 text-xs text-red-700 dark:text-red-200">
                              {lastSync.error}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid border-t border-border/80 lg:grid-cols-[150px_185px_auto] lg:border-l lg:border-t-0">
                        <div className="border-b border-border/80 px-5 py-4 lg:border-b-0 lg:border-r">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/75">
                            Imported
                          </p>
                          <div className="mt-2">
                            {counts.yachts > 0 || counts.availability > 0 ? (
                              <>
                                <p className="text-sm font-semibold">
                                  {counts.yachts} yacht{counts.yachts === 1 ? "" : "s"}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {counts.availability} windows
                                </p>
                              </>
                            ) : (
                              <p className="text-sm font-semibold">{counts.links} links</p>
                            )}
                          </div>
                        </div>

                        <div className="border-b border-border/80 px-5 py-4 lg:border-b-0 lg:border-r">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/75">
                            Last synchronized
                          </p>
                          <p className="mt-2 text-sm font-medium text-foreground/85">
                            {formatDate(lastSyncDate)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 px-5 py-4">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 flex-1 rounded-2xl border-border bg-transparent px-4 text-foreground/85 hover:bg-accent/70"
                            onClick={() => {
                              setSelectedSourceId(source.id);
                              setLastSyncResult(null);
                            }}
                          >
                            Manage
                          </Button>
                          {/*
                            An uploaded file has no URL to poll, so there is
                            nothing to re-sync. Offering the button anyway
                            produced "The data source does not have a source
                            URL" and a Needs attention badge on a source that
                            had imported perfectly well.
                          */}
                          {source.source_url ? (
                            <Button
                              type="button"
                              className="h-10 flex-1 rounded-2xl bg-white px-4 text-zinc-950 hover:opacity-90"
                              onClick={() => void syncSource(source)}
                              disabled={syncing || isSyncingAll || deletingIds.has(source.id)}
                            >
                              {syncing ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <RefreshCw className="size-4" />
                              )}
                              {syncing ? "Syncing" : "Sync now"}
                            </Button>
                          ) : (
                            <p className="flex-1 self-center text-xs text-muted-foreground">
                              Uploaded file, nothing to re-sync
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </div>

      {isUploadOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 dark:bg-black/80 p-4 backdrop-blur-md">
          {/*
            max-h + flex so the panel can cap its own height and scroll its
            middle. Without the cap a long extraction preview grows past the
            viewport and pushes the action buttons off screen, leaving no way
            to dismiss the dialog.
          */}
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-border bg-card shadow-[var(--strong-shadow)]">
            <PdfUploadPanel
              onClose={() => setIsUploadOpen(false)}
              onImported={() => void loadSources()}
            />
          </div>
        </div>
      ) : null}

      {isAddOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 dark:bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-border bg-card shadow-[var(--strong-shadow)]">
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">New connection</p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Add data source</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">Connect a public sharing URL to the import engine.</p>
              </div>
              <button
                type="button"
                className="rounded-2xl p-2 text-muted-foreground transition hover:bg-accent/70 hover:text-foreground"
                onClick={() => {
                  setIsAddOpen(false);
                  setCreateError("");
                }}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={createSource} className="space-y-5 p-6">
              <div>
                <label className="text-sm font-medium text-foreground/80">Source name</label>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="NOVI DAN availability"
                  className="mt-2 h-12 w-full rounded-2xl border border-border bg-background/55 px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/75 focus:border-cyan-300/40"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground/80">Source type</label>
                <select
                  value={form.sourceType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      sourceType: event.target.value as SourceType,
                    }))
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-border bg-popover px-4 text-sm text-foreground outline-none focus:border-cyan-300/40"
                >
                  <option value="google_sheets">Google Sheets</option>
                  <option value="dropbox_excel">Dropbox Excel</option>
                  <option value="website">Website</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground/80">Public source URL</label>
                <input
                  type="url"
                  value={form.sourceUrl}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, sourceUrl: event.target.value }))
                  }
                  placeholder={
                    form.sourceType === "google_sheets"
                      ? "https://docs.google.com/spreadsheets/d/..."
                      : form.sourceType === "dropbox_excel"
                        ? "https://www.dropbox.com/scl/fi/..."
                        : form.sourceType === "pdf"
                          ? "https://example.com/availability-2026.pdf"
                          : "https://example.com/fleet"
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-border bg-background/55 px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/75 focus:border-cyan-300/40"
                  required
                />
                <p className="mt-2 text-xs text-muted-foreground/75">The URL must be publicly accessible to the connector.</p>
                {form.sourceType === "pdf" ? (
                  <p className="mt-2 text-xs text-muted-foreground/75">
                    Have the file rather than a link?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddOpen(false);
                        setIsUploadOpen(true);
                      }}
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      Upload it directly
                    </button>
                    .
                  </p>
                ) : null}
              </div>

              <div>
                <label className="text-sm font-medium text-foreground/80">Sync frequency</label>
                <select
                  value={form.syncFrequencyMinutes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      syncFrequencyMinutes: Number(event.target.value),
                    }))
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-border bg-popover px-4 text-sm text-foreground outline-none focus:border-cyan-300/40"
                >
                  <option value={5}>Every 5 minutes</option>
                  <option value={15}>Every 15 minutes</option>
                  <option value={30}>Every 30 minutes</option>
                  <option value={60}>Every hour</option>
                  <option value={360}>Every 6 hours</option>
                  <option value={1440}>Every day</option>
                </select>
              </div>

              {createError ? (
                <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.08] p-4 text-sm text-red-700 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              ) : null}

              <div className="flex justify-end gap-3 border-t border-border pt-5">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl border-border bg-transparent px-5"
                  onClick={() => {
                    setIsAddOpen(false);
                    setCreateError("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCreating}
                  className="h-11 rounded-2xl bg-white px-5 text-zinc-950 hover:opacity-90"
                >
                  {isCreating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {isCreating ? "Adding..." : "Add source"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {selectedSource ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 dark:bg-black/80 p-4 backdrop-blur-md">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-border bg-card shadow-[var(--strong-shadow)]">
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Source management</p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{selectedSource.name}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{sourceTypeLabels[selectedSource.source_type]}</p>
              </div>
              <button
                type="button"
                className="rounded-2xl p-2 text-muted-foreground transition hover:bg-accent/70 hover:text-foreground"
                onClick={() => {
                  setSelectedSourceId(null);
                  setLastSyncResult(null);
                }}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div className="rounded-[22px] border border-border bg-background/45 p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/75">Source URL</p>
                <p className="mt-3 break-all text-sm leading-6 text-foreground/80">{selectedSource.source_url}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Status", syncingIds.has(selectedSource.id) ? "Syncing" : statusLabel(selectedSource)],
                  ["Last sync", formatDate(getLastSync(selectedSource)?.finished_at ?? selectedSource.updated_at)],
                  ["Yachts", getImportCounts(selectedSource).yachts],
                  ["Availability windows", getImportCounts(selectedSource).availability],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-[22px] border border-border bg-background/45 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/75">{label}</p>
                    <p className="mt-3 text-sm font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              {lastSyncResult ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-foreground/80">Latest sync response</p>
                  <pre className="max-h-96 overflow-auto rounded-[22px] border border-border bg-background/70 p-4 text-xs leading-6 text-muted-foreground">
                    {JSON.stringify(lastSyncResult, null, 2)}
                  </pre>
                </div>
              ) : null}

              <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl border-red-500/20 bg-red-500/[0.04] px-5 text-red-300 hover:bg-red-500/[0.08]"
                  onClick={() => void deleteSource(selectedSource)}
                  disabled={
                    syncingIds.has(selectedSource.id) ||
                    isSyncingAll ||
                    deletingIds.has(selectedSource.id)
                  }
                >
                  {deletingIds.has(selectedSource.id) ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Remove source
                </Button>

                <Button
                  className="h-11 rounded-2xl bg-white px-5 text-zinc-950 hover:opacity-90"
                  onClick={() => void syncSource(selectedSource)}
                  disabled={
                    syncingIds.has(selectedSource.id) ||
                    isSyncingAll ||
                    deletingIds.has(selectedSource.id)
                  }
                >
                  {syncingIds.has(selectedSource.id) ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {syncingIds.has(selectedSource.id) ? "Synchronizing..." : "Run synchronization"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
}