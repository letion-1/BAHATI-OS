"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Doc = {
  id: string;
  name: string;
  category: string;
  mimeType: string;
  fileSize: number;
  version: number;
  status: string;
  clientId: string | null;
  inquiryId: string | null;
  proposalId: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiResponse = {
  success: boolean;
  documents?: Doc[];
  document?: Doc;
  url?: string;
  error?: string;
};

const categories = [
  ["proposal", "Proposal"],
  ["charter_agreement", "Charter Agreement"],
  ["invoice", "Invoice"],
  ["apa", "APA"],
  ["passport", "Passport"],
  ["manifest", "Manifest"],
  ["preference_form", "Preference Form"],
  ["insurance", "Insurance"],
  ["crew_document", "Crew Document"],
  ["payment_receipt", "Payment Receipt"],
  ["other", "Other"],
] as const;

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("other");
  const [clientId, setClientId] = useState("");
  const [inquiryId, setInquiryId] = useState("");
  const [proposalId, setProposalId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/documents", {
        cache: "no-store",
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ?? "Could not load documents."
        );
      }

      setDocuments(result.documents ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load documents."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return documents.filter((document) => {
      const matchesCategory =
        categoryFilter === "all" ||
        document.category === categoryFilter;

      return (
        matchesCategory &&
        (!query ||
          `${document.name} ${document.category}`
            .toLowerCase()
            .includes(query))
      );
    });
  }, [documents, search, categoryFilter]);

  const totalSize = documents.reduce(
    (sum, document) => sum + document.fileSize,
    0
  );

  async function upload(event: FormEvent) {
    event.preventDefault();

    if (!file) {
      setError("Choose a file first.");
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setMessage(null);

      const form = new FormData();
      form.append("file", file);
      form.append("category", category);

      if (clientId.trim()) {
        form.append("clientId", clientId.trim());
      }

      if (inquiryId.trim()) {
        form.append("inquiryId", inquiryId.trim());
      }

      if (proposalId.trim()) {
        form.append("proposalId", proposalId.trim());
      }

      const response = await fetch("/api/documents", {
        method: "POST",
        body: form,
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ?? "Could not upload document."
        );
      }

      setFile(null);
      setCategory("other");
      setClientId("");
      setInquiryId("");
      setProposalId("");
      setShowUpload(false);
      setMessage("Document uploaded.");
      await loadDocuments();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload document."
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function openDocument(document: Doc) {
    try {
      const response = await fetch(
        `/api/documents/${document.id}/download`,
        { cache: "no-store" }
      );

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.success || !result.url) {
        throw new Error(
          result.error ?? "Could not open document."
        );
      }

      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "Could not open document."
      );
    }
  }

  async function renameDocument(document: Doc) {
    const name = window.prompt(
      "New document name:",
      document.name
    );

    if (!name?.trim()) {
      return;
    }

    const response = await fetch(
      `/api/documents/${document.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: name.trim() }),
      }
    );

    const result = (await response.json()) as ApiResponse;

    if (!response.ok || !result.success) {
      setError(result.error ?? "Could not rename document.");
      return;
    }

    setMessage("Document renamed.");
    await loadDocuments();
  }

  async function deleteDocument(document: Doc) {
    if (
      !window.confirm(
        `Delete "${document.name}"? This cannot be undone.`
      )
    ) {
      return;
    }

    const response = await fetch(
      `/api/documents/${document.id}`,
      { method: "DELETE" }
    );

    const result = (await response.json()) as ApiResponse;

    if (!response.ok || !result.success) {
      setError(result.error ?? "Could not delete document.");
      return;
    }

    setMessage("Document deleted.");
    await loadDocuments();
  }

  function onFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    setFile(event.target.files?.[0] ?? null);
  }

  return (
    <main className="ui-page min-h-full px-5 py-7 sm:px-7 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-7">
        <section className="ui-hero rounded-[30px] p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="ui-hero-accent text-xs font-semibold uppercase tracking-[0.26em]">
                Secure Document Vault
              </p>
              <h1 className="mt-5 font-heading text-5xl leading-none tracking-[0.055em] text-[var(--hero-foreground)] sm:text-6xl xl:text-7xl">
                Brokerage documents
              </h1>
              <p className="ui-hero-muted mt-3 max-w-3xl text-sm leading-7 sm:text-base">
                Store proposals, agreements, invoices, passports
                and operational records in one private workspace.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="ui-primary-button apple-transition min-h-12 px-5 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90"
            >
              + Upload document
            </button>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-700 dark:text-emerald-200">
            {message}
          </div>
        ) : null}

        <section className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Documents" value={documents.length} />
          <Stat
            label="Proposal PDFs"
            value={
              documents.filter(
                (document) =>
                  document.category === "proposal"
              ).length
            }
          />
          <Stat
            label="Client linked"
            value={
              documents.filter((document) =>
                Boolean(document.clientId)
              ).length
            }
          />
          <Stat
            label="Storage used"
            value={formatBytes(totalSize)}
          />
        </section>

        <section className="ui-panel rounded-[24px] p-5 sm:p-6">
          <div className="grid gap-3 [&>*]:min-w-0 lg:grid-cols-[1fr_260px_auto]">
            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search documents..."
              className="ui-input h-12 px-4 text-sm"
            />

            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value)
              }
              className="ui-input h-12 px-4 text-sm"
            >
              <option value="all">All categories</option>
              {categories.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCategoryFilter("all");
              }}
              className="ui-secondary-button apple-transition h-12 px-5 text-sm font-semibold hover:bg-accent"
            >
              Clear
            </button>
          </div>
        </section>

        {isLoading ? (
          <div className="h-72 animate-pulse rounded-[24px] bg-muted" />
        ) : filtered.length === 0 ? (
          <section className="ui-panel rounded-[28px] border-dashed px-6 py-20 text-center">
            <h2 className="font-heading text-3xl leading-none tracking-[0.05em] text-foreground">
              No documents stored
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Upload your first proposal, agreement or client file.
            </p>
          </section>
        ) : (
          <section className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((document) => (
              <article
                key={document.id}
                className="ui-panel apple-transition rounded-[24px] p-5 hover:-translate-y-0.5 hover:border-ring/25"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate font-heading text-2xl leading-none tracking-[0.045em] text-foreground">
                      {document.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {labelFor(document.category)}
                    </p>
                  </div>
                  <span className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                    v{document.version}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Metric
                    label="Size"
                    value={formatBytes(document.fileSize)}
                  />
                  <Metric
                    label="Updated"
                    value={formatRelative(document.updatedAt)}
                  />
                  <Metric
                    label="Client"
                    value={
                      document.clientId
                        ? "Linked"
                        : "Not linked"
                    }
                  />
                  <Metric
                    label="Status"
                    value={document.status}
                  />
                </div>

                <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() =>
                      void openDocument(document)
                    }
                    className="ui-primary-button apple-transition rounded-lg px-3 py-2 text-xs font-semibold hover:opacity-90"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void renameDocument(document)
                    }
                    className="ui-secondary-button apple-transition rounded-lg px-3 py-2 text-xs font-semibold hover:bg-accent"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void deleteDocument(document)
                    }
                    className="apple-transition rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-500/15 dark:text-red-200"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {showUpload ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-10 backdrop-blur-sm dark:bg-black/75">
          <form
            onSubmit={upload}
            className="ui-panel w-full max-w-3xl rounded-[28px] p-6 sm:p-8"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-300">
                  Document Vault
                </p>
                <h2 className="mt-3 font-heading text-4xl leading-none tracking-[0.05em] text-foreground">
                  Upload document
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="ui-secondary-button apple-transition px-3 py-2 text-sm hover:bg-accent"
              >
                Close
              </button>
            </div>

            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={onFileChange}
              className="mt-7 block w-full rounded-[22px] border border-dashed border-border bg-background/45 p-8 text-sm text-muted-foreground"
            />

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label>
                <span className="text-sm font-medium text-foreground">
                  Category
                </span>
                <select
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value)
                  }
                  className="ui-input mt-2 h-12 px-4 text-sm"
                >
                  {categories.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <Field
                label="Client ID (optional)"
                value={clientId}
                onChange={setClientId}
              />
              <Field
                label="Inquiry ID (optional)"
                value={inquiryId}
                onChange={setInquiryId}
              />
              <Field
                label="Proposal ID (optional)"
                value={proposalId}
                onChange={setProposalId}
              />
            </div>

            <div className="mt-7 flex justify-end gap-3 border-t border-border pt-6">
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="ui-secondary-button apple-transition px-5 py-3 text-sm font-semibold hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUploading}
                className="ui-primary-button apple-transition px-5 py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
              >
                {isUploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="text-sm font-medium text-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="ui-input mt-2 h-12 px-4 text-sm"
      />
    </label>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <article className="ui-panel apple-transition rounded-[24px] p-5 hover:-translate-y-0.5 hover:border-ring/25">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-3 font-heading text-5xl leading-none tracking-[0.045em] text-foreground">
        {value}
      </p>
    </article>
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
    <div className="ui-panel-soft rounded-xl p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function labelFor(category: string): string {
  return (
    categories.find(([value]) => value === category)?.[1] ??
    category
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / 1024 ** index).toFixed(1)} ${
    units[index]
  }`;
}

function formatRelative(value: string): string {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Unknown";

  const difference = timestamp - Date.now();
  const abs = Math.abs(difference);
  const formatter = new Intl.RelativeTimeFormat("en", {
    numeric: "auto",
  });

  if (abs < 60_000) return "Just now";
  if (abs < 3_600_000) {
    return formatter.format(
      Math.round(difference / 60_000),
      "minute"
    );
  }
  if (abs < 86_400_000) {
    return formatter.format(
      Math.round(difference / 3_600_000),
      "hour"
    );
  }
  return formatter.format(
    Math.round(difference / 86_400_000),
    "day"
  );
}