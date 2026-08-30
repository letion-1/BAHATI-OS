"use client";

import {
  Archive,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  Send,
  Unplug,
} from "lucide-react";
import {
  useSearchParams,
  useRouter,
} from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { HeroCard } from "@/components/ui/hero-card";
import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";

type EmailStatus =
  | "draft"
  | "sent"
  | "received"
  | "failed"
  | "archived";

type EmailDraft = {
  id: string;
  inquiryId: string | null;
  yachtId: string | null;
  managerContactId: string | null;
  purpose: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  body: string;
  startDate: string | null;
  endDate: string | null;
  status: EmailStatus;
  provider: string | null;
  externalMessageId: string | null;
  externalThreadId: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
};

type EmailDraftsResponse = {
  success: boolean;
  drafts?: EmailDraft[];
  draft?: EmailDraft | null;
  error?: string;
};

type GmailConnection = {
  connected: boolean;
  emailAddress: string | null;
  status: string;
  tokenExpiresAt?: string | null;
  updatedAt?: string | null;
};

type GmailStatusResponse = {
  success: boolean;
  connection?: GmailConnection;
  error?: string;
};

type DraftForm = {
  toEmail: string;
  toName: string;
  subject: string;
  body: string;
};

export default function EmailPage() {
  return (
    <Suspense fallback={<EmailPageSkeleton />}>
      <EmailWorkspace />
    </Suspense>
  );
}

function EmailWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const requestedDraftId =
    searchParams.get("draft");

  const connectedProvider =
    searchParams.get("connected");

  const oauthError =
    searchParams.get("oauthError");

  const [drafts, setDrafts] =
    useState<EmailDraft[]>([]);

  const [selectedId, setSelectedId] =
    useState<string | null>(
      requestedDraftId
    );

  const [form, setForm] =
    useState<DraftForm>({
      toEmail: "",
      toName: "",
      subject: "",
      body: "",
    });

  const [isLoading, setIsLoading] =
    useState(true);

  const [isRefreshing, setIsRefreshing] =
    useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [isMarkingSent, setIsMarkingSent] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState<string | null>(null);

  const [gmailConnection, setGmailConnection] =
    useState<GmailConnection>({
      connected: false,
      emailAddress: null,
      status: "disconnected",
    });

  const [isLoadingConnection, setIsLoadingConnection] =
    useState(true);

  const [isDisconnectingGmail, setIsDisconnectingGmail] =
    useState(false);

  const [isSendingGmail, setIsSendingGmail] =
    useState(false);

  const selectedDraft = useMemo(
    () =>
      drafts.find(
        (draft) => draft.id === selectedId
      ) ?? null,
    [drafts, selectedId]
  );

  const overview = useMemo(() => {
    return {
      total: drafts.length,
      draft: drafts.filter(
        (item) => item.status === "draft"
      ).length,
      sent: drafts.filter(
        (item) => item.status === "sent"
      ).length,
      pending: drafts.filter(
        (item) =>
          item.status === "sent" &&
          item.purpose ===
            "availability_verification"
      ).length,
    };
  }, [drafts]);

  const loadGmailStatus = useCallback(
    async () => {
      setIsLoadingConnection(true);

      try {
        const response = await fetch(
          "/api/email/google/status",
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const payload =
          (await response.json()) as GmailStatusResponse;

        if (
          !response.ok ||
          !payload.success ||
          !payload.connection
        ) {
          throw new Error(
            payload.error ??
              "Could not load Gmail connection."
          );
        }

        setGmailConnection(
          payload.connection
        );
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load Gmail connection."
        );
      } finally {
        setIsLoadingConnection(false);
      }
    },
    []
  );

  const loadDrafts = useCallback(
    async (refreshing = false) => {
      try {
        refreshing
          ? setIsRefreshing(true)
          : setIsLoading(true);

        setError(null);

        const response = await fetch(
          "/api/email-drafts",
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const payload =
          (await response.json()) as EmailDraftsResponse;

        if (!response.ok || !payload.success) {
          throw new Error(
            payload.error ??
              "Could not load email drafts."
          );
        }

        const loaded = payload.drafts ?? [];
        setDrafts(loaded);

        const nextSelectedId =
          requestedDraftId &&
          loaded.some(
            (draft) =>
              draft.id === requestedDraftId
          )
            ? requestedDraftId
            : selectedId &&
                loaded.some(
                  (draft) =>
                    draft.id === selectedId
                )
              ? selectedId
              : loaded[0]?.id ?? null;

        setSelectedId(nextSelectedId);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load email drafts."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [requestedDraftId, selectedId]
  );

  useEffect(() => {
    void loadDrafts(false);
    void loadGmailStatus();
  }, [loadDrafts, loadGmailStatus]);

  useEffect(() => {
    if (connectedProvider === "gmail") {
      setMessage(
        "Gmail connected. Bahari OS can now send approved drafts from this mailbox."
      );
    }

    if (oauthError) {
      setError(oauthError);
    }
  }, [connectedProvider, oauthError]);

  useEffect(() => {
    if (!selectedDraft) {
      setForm({
        toEmail: "",
        toName: "",
        subject: "",
        body: "",
      });
      return;
    }

    setForm({
      toEmail: selectedDraft.toEmail,
      toName:
        selectedDraft.toName ?? "",
      subject: selectedDraft.subject,
      body: selectedDraft.body,
    });
  }, [selectedDraft]);

  function selectDraft(id: string) {
    setSelectedId(id);
    setMessage(null);
    setError(null);

    router.replace(
      `/email?draft=${encodeURIComponent(id)}`
    );
  }

  function updateField(
    field: keyof DraftForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setMessage(null);
    setError(null);
  }

  async function saveDraft() {
    if (!selectedDraft) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        "/api/email-drafts",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: selectedDraft.id,
            toEmail: form.toEmail,
            toName: form.toName,
            subject: form.subject,
            body: form.body,
          }),
        }
      );

      const payload =
        (await response.json()) as EmailDraftsResponse;

      if (
        !response.ok ||
        !payload.success ||
        !payload.draft
      ) {
        throw new Error(
          payload.error ??
            "Could not save the draft."
        );
      }

      replaceDraft(payload.draft);
      setMessage("Draft saved.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save the draft."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function sendWithGmail() {
    if (!selectedDraft) {
      return;
    }

    setIsSendingGmail(true);
    setError(null);
    setMessage(null);

    try {
      const saveResponse = await fetch(
        "/api/email-drafts",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: selectedDraft.id,
            toEmail: form.toEmail,
            toName: form.toName,
            subject: form.subject,
            body: form.body,
          }),
        }
      );

      const savedPayload =
        (await saveResponse.json()) as EmailDraftsResponse;

      if (
        !saveResponse.ok ||
        !savedPayload.success ||
        !savedPayload.draft
      ) {
        throw new Error(
          savedPayload.error ??
            "Could not save the draft before sending."
        );
      }

      replaceDraft(
        savedPayload.draft
      );

      const sendResponse = await fetch(
        "/api/email/google/send",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draftId: selectedDraft.id,
          }),
        }
      );

      const sendPayload =
        (await sendResponse.json()) as EmailDraftsResponse & {
          sender?: string;
        };

      if (
        !sendResponse.ok ||
        !sendPayload.success ||
        !sendPayload.draft
      ) {
        throw new Error(
          sendPayload.error ??
            "Gmail could not send the draft."
        );
      }

      replaceDraft(
        sendPayload.draft
      );

      setMessage(
        `Sent from ${
          sendPayload.sender ??
          gmailConnection.emailAddress ??
          "Gmail"
        }. Manager verification is now pending.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not send with Gmail."
      );
    } finally {
      setIsSendingGmail(false);
    }
  }

  async function disconnectGmail() {
    setIsDisconnectingGmail(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        "/api/email/google/disconnect",
        {
          method: "POST",
        }
      );

      const payload =
        (await response.json()) as {
          success: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !payload.success
      ) {
        throw new Error(
          payload.error ??
            "Could not disconnect Gmail."
        );
      }

      setGmailConnection({
        connected: false,
        emailAddress: null,
        status: "disconnected",
      });

      setMessage(
        "Gmail disconnected from Bahari OS."
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not disconnect Gmail."
      );
    } finally {
      setIsDisconnectingGmail(false);
    }
  }

  function openInMailApp() {
    if (!selectedDraft) {
      return;
    }

    const mailto =
      `mailto:${encodeURIComponent(
        form.toEmail
      )}` +
      `?subject=${encodeURIComponent(
        form.subject
      )}` +
      `&body=${encodeURIComponent(
        form.body
      )}`;

    window.location.href = mailto;
  }

  async function markSent() {
    if (!selectedDraft) {
      return;
    }

    setIsMarkingSent(true);
    setError(null);
    setMessage(null);

    try {
      const saveResponse = await fetch(
        "/api/email-drafts",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: selectedDraft.id,
            toEmail: form.toEmail,
            toName: form.toName,
            subject: form.subject,
            body: form.body,
            status: "sent",
            provider: "manual",
          }),
        }
      );

      const payload =
        (await saveResponse.json()) as EmailDraftsResponse;

      if (
        !saveResponse.ok ||
        !payload.success ||
        !payload.draft
      ) {
        throw new Error(
          payload.error ??
            "Could not mark the email as sent."
        );
      }

      replaceDraft(payload.draft);
      setMessage(
        "Marked as sent. Manager verification is now pending."
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not mark the email as sent."
      );
    } finally {
      setIsMarkingSent(false);
    }
  }

  function replaceDraft(
    updated: EmailDraft
  ) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === updated.id
          ? updated
          : draft
      )
    );
  }

  if (isLoading) {
    return <EmailPageSkeleton />;
  }

  return (
    <PageContainer contentClassName="space-y-7">
      <HeroCard
        eyebrow="Broker communications"
        title="Email"
        description="Prepare charter-manager availability requests, keep them attached to the inquiry and add Gmail or Outlook as the sending layer."
        actions={
          <button
            type="button"
            onClick={() =>
              void loadDrafts(true)
            }
            disabled={isRefreshing}
            className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </button>
        }
      />

      <section className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Workspace emails"
          value={overview.total}
          subtitle="All Bahari OS email records"
          tone="cyan"
        />

        <StatCard
          label="Drafts"
          value={overview.draft}
          subtitle="Prepared but not sent"
          tone="amber"
        />

        <StatCard
          label="Sent"
          value={overview.sent}
          subtitle="Recorded outbound emails"
          tone="emerald"
        />

        <StatCard
          label="Awaiting replies"
          value={overview.pending}
          subtitle="Verification emails sent"
          tone="violet"
        />
      </section>

      <section className="ui-panel rounded-[26px] p-5 sm:p-6">
        <SectionHeader
          eyebrow="Email connections"
          title="Connect the broker's mailbox here"
          subtitle="This is the transport layer. Bahari OS drafts remain internal, then Gmail or Outlook can send and sync replies through OAuth."
          className="mb-5"
        />

        <div className="grid gap-4 [&>*]:min-w-0 md:grid-cols-2">
          <ConnectionCard
            name="Gmail"
            detail={
              gmailConnection.connected
                ? `Connected as ${
                    gmailConnection.emailAddress ??
                    "Google account"
                  }. Bahari OS can send approved email drafts from this mailbox.`
                : "Connect a Google mailbox so Bahari OS can send approved Charter Manager verification emails directly."
            }
            connected={
              gmailConnection.connected
            }
            account={
              gmailConnection.emailAddress
            }
            loading={
              isLoadingConnection
            }
            connectHref="/api/email/google/connect"
            disconnecting={
              isDisconnectingGmail
            }
            onDisconnect={() =>
              void disconnectGmail()
            }
          />

          <ConnectionCard
            name="Microsoft Outlook"
            detail="Microsoft 365 OAuth is the next provider after Gmail."
            disabled
          />
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-800 dark:text-emerald-200">
          {message}
        </div>
      ) : null}

      <section className="grid min-h-[650px] gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="ui-panel min-w-0 overflow-hidden rounded-[26px]">
          <div className="border-b border-border p-5">
            <SectionHeader
              eyebrow="Mailbox"
              title="Email activity"
              subtitle="Drafts and sent verification requests"
            />
          </div>

          <div className="max-h-[650px] overflow-y-auto p-3">
            {drafts.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Inbox className="mx-auto size-7 text-muted-foreground" />

                <p className="mt-3 text-sm font-semibold text-foreground">
                  No Bahari OS emails yet
                </p>

                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Open an inquiry, match a yacht and choose Email manager.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {drafts.map((draft) => (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() =>
                      selectDraft(draft.id)
                    }
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedId === draft.id
                        ? "border-cyan-500/35 bg-cyan-500/[0.07]"
                        : "border-border bg-background/35 hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-xs font-semibold text-foreground">
                        {draft.toName ||
                          draft.toEmail}
                      </span>

                      <StatusPill
                        status={draft.status}
                      />
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-foreground/85">
                      {draft.subject}
                    </p>

                    <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {formatTimestamp(
                        draft.updatedAt
                      )}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <div className="ui-panel min-w-0 overflow-hidden rounded-[26px]">
          {!selectedDraft ? (
            <div className="flex min-h-[650px] flex-col items-center justify-center px-6 text-center">
              <Mail className="size-9 text-muted-foreground" />

              <p className="mt-4 text-base font-semibold text-foreground">
                Select an email
              </p>

              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Availability requests created from Match Yachts will open here as editable drafts.
              </p>
            </div>
          ) : (
            <>
              <div className="border-b border-border p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {selectedDraft.purpose ===
                      "availability_verification"
                        ? "Availability verification"
                        : "Email draft"}
                    </p>

                    <h2 className="mt-2 text-xl font-semibold text-foreground">
                      Compose
                    </h2>
                  </div>

                  <StatusPill
                    status={
                      selectedDraft.status
                    }
                  />
                </div>
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      To
                    </span>
                    <input
                      type="email"
                      value={form.toEmail}
                      onChange={(event) =>
                        updateField(
                          "toEmail",
                          event.target.value
                        )
                      }
                      className="ui-input mt-2 h-11 w-full rounded-xl px-3 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Recipient name
                    </span>
                    <input
                      value={form.toName}
                      onChange={(event) =>
                        updateField(
                          "toName",
                          event.target.value
                        )
                      }
                      className="ui-input mt-2 h-11 w-full rounded-xl px-3 text-sm"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Subject
                  </span>
                  <input
                    value={form.subject}
                    onChange={(event) =>
                      updateField(
                        "subject",
                        event.target.value
                      )
                    }
                    className="ui-input mt-2 h-11 w-full rounded-xl px-3 text-sm"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Message
                  </span>
                  <textarea
                    value={form.body}
                    onChange={(event) =>
                      updateField(
                        "body",
                        event.target.value
                      )
                    }
                    rows={17}
                    className="ui-input mt-2 w-full resize-y rounded-xl px-4 py-4 text-sm leading-7"
                  />
                </label>

                {selectedDraft.startDate &&
                selectedDraft.endDate ? (
                  <div className="rounded-2xl border border-border bg-background/45 px-4 py-3 text-xs text-muted-foreground">
                    Charter window:{" "}
                    <span className="font-semibold text-foreground">
                      {selectedDraft.startDate} →{" "}
                      {selectedDraft.endDate}
                    </span>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3 border-t border-border pt-5">
                  <button
                    type="button"
                    onClick={() =>
                      void saveDraft()
                    }
                    disabled={isSaving}
                    className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold hover:bg-accent disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Save draft
                  </button>

                  <button
                    type="button"
                    onClick={openInMailApp}
                    className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold hover:bg-accent"
                  >
                    <ExternalLink className="size-4" />
                    Open in email app
                  </button>

                  {selectedDraft.status ===
                  "draft" ? (
                    gmailConnection.connected ? (
                      <button
                        type="button"
                        onClick={() =>
                          void sendWithGmail()
                        }
                        disabled={isSendingGmail}
                        className="ui-primary-button apple-transition ml-auto inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-50"
                      >
                        {isSendingGmail ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Send className="size-4" />
                        )}
                        Send with Gmail
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          void markSent()
                        }
                        disabled={isMarkingSent}
                        className="ui-primary-button apple-transition ml-auto inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-50"
                      >
                        {isMarkingSent ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Send className="size-4" />
                        )}
                        Mark sent manually
                      </button>
                    )
                  ) : (
                    <div className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                      <CheckCircle2 className="size-4" />
                      Sent
                    </div>
                  )}
                </div>

                <p className="text-xs leading-5 text-muted-foreground">
                  When Gmail is connected, “Send with Gmail” sends the approved draft directly from the connected mailbox. “Open in email app” and manual sent tracking remain available as fallbacks.
                </p>
              </div>
            </>
          )}
        </div>
      </section>
    </PageContainer>
  );
}

function ConnectionCard({
  name,
  detail,
  connected = false,
  account = null,
  loading = false,
  connectHref,
  disconnecting = false,
  onDisconnect,
  disabled = false,
}: {
  name: string;
  detail: string;
  connected?: boolean;
  account?: string | null;
  loading?: boolean;
  connectHref?: string;
  disconnecting?: boolean;
  onDisconnect?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-[22px] border border-border bg-background/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-background/60">
            <Mail className="size-4 text-muted-foreground" />
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {name}
            </p>

            {account ? (
              <p className="mt-1 truncate text-xs font-semibold text-foreground/80">
                {account}
              </p>
            ) : null}

            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {detail}
            </p>
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
            connected
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "border-border bg-background/55 text-muted-foreground"
          }`}
        >
          {loading
            ? "Checking"
            : connected
              ? "Connected"
              : "Not connected"}
        </span>
      </div>

      {connected ? (
        <button
          type="button"
          onClick={onDisconnect}
          disabled={disconnecting}
          className="ui-secondary-button mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 px-4 text-xs font-semibold hover:bg-accent disabled:opacity-50"
        >
          {disconnecting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Unplug className="size-3.5" />
          )}
          Disconnect
        </button>
      ) : connectHref && !disabled ? (
        <a
          href={connectHref}
          className="ui-primary-button apple-transition mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 px-4 text-xs font-semibold hover:-translate-y-0.5 hover:opacity-90"
        >
          <Mail className="size-3.5" />
          Connect {name}
        </a>
      ) : (
        <button
          type="button"
          disabled
          className="ui-secondary-button mt-4 min-h-10 w-full cursor-not-allowed px-4 text-xs font-semibold opacity-50"
        >
          Coming next
        </button>
      )}
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: EmailStatus;
}) {
  const classes: Record<
    EmailStatus,
    string
  > = {
    draft:
      "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    sent:
      "border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    received:
      "border-cyan-500/20 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200",
    failed:
      "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-200",
    archived:
      "border-border bg-background/60 text-muted-foreground",
  };

  const labels: Record<
    EmailStatus,
    string
  > = {
    draft: "Draft",
    sent: "Sent",
    received: "Reply",
    failed: "Failed",
    archived: "Archived",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${classes[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function formatTimestamp(
  value: string
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}

function EmailPageSkeleton() {
  return (
    <PageContainer contentClassName="space-y-7">
      <div className="h-48 animate-pulse rounded-[28px] border border-border bg-muted/30" />

      <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({
          length: 4,
        }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-[22px] border border-border bg-muted/30"
          />
        ))}
      </div>

      <div className="h-[650px] animate-pulse rounded-[26px] border border-border bg-muted/30" />
    </PageContainer>
  );
}