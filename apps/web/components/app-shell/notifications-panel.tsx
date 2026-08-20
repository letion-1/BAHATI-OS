"use client";

import Link from "next/link";
import {
  Bell,
  CheckCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  href: string | null;
  priority: string;
  readAt: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  success: boolean;
  notifications?: NotificationItem[];
  unreadCount?: number;
  error?: string;
};

export function NotificationsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] =
    useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const [
    toastNotification,
    setToastNotification,
  ] =
    useState<NotificationItem | null>(
      null
    );

  const triggerRef =
    useRef<HTMLButtonElement | null>(null);

  const panelRef =
    useRef<HTMLElement | null>(null);

  const [
    mounted,
    setMounted,
  ] =
    useState(false);

  const initializedRef =
    useRef(false);

  const knownIdsRef =
    useRef<Set<string>>(
      new Set()
    );

  const loadNotifications = useCallback(async (
    announceNew = true
  ) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        "/api/notifications?limit=50",
        { cache: "no-store" }
      );

      const text = await response.text();

      let result: NotificationsResponse | null = null;

      if (text.trim()) {
        try {
          result = JSON.parse(
            text
          ) as NotificationsResponse;
        } catch {
          throw new Error(
            `Notifications returned invalid JSON (${response.status}).`
          );
        }
      }

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error ??
            `Could not load notifications (${response.status}).`
        );
      }

      const nextNotifications =
        result.notifications ??
        [];

      if (
        initializedRef.current &&
        announceNew
      ) {
        const newestUnread =
          nextNotifications.find(
            (notification) =>
              !notification.readAt &&
              !knownIdsRef.current.has(
                notification.id
              )
          );

        if (newestUnread) {
          setToastNotification(
            newestUnread
          );
        }
      }

      knownIdsRef.current =
        new Set(
          nextNotifications.map(
            (notification) =>
              notification.id
          )
        );

      initializedRef.current =
        true;

      setNotifications(
        nextNotifications
      );

      setUnreadCount(
        result.unreadCount ??
        0
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load notifications."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    void loadNotifications(
      false
    );

    const interval =
      window.setInterval(
        () => {
          void loadNotifications(
            true
          );
        },
        15_000
      );

    return () =>
      window.clearInterval(
        interval
      );
  }, [loadNotifications]);

  useEffect(() => {
    const refresh = () => {
      void loadNotifications(
        true
      );
    };

    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          refresh();
        }
      };

    window.addEventListener(
      "focus",
      refresh
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    return () => {
      window.removeEventListener(
        "focus",
        refresh
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!toastNotification) {
      return;
    }

    const timeout =
      window.setTimeout(
        () => {
          setToastNotification(
            null
          );
        },
        7_000
      );

    return () =>
      window.clearTimeout(
        timeout
      );
  }, [toastNotification]);

  useEffect(() => {
    if (isOpen) {
      void loadNotifications(
        false
      );
    }
  }, [isOpen, loadNotifications]);

  useEffect(() => {
    if (
      !isOpen ||
      typeof window ===
        "undefined" ||
      !window.matchMedia(
        "(max-width: 639px)"
      ).matches
    ) {
      return;
    }

    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(
      event: PointerEvent
    ) {
      const target =
        event.target as Node;

      const clickedTrigger =
        triggerRef.current?.contains(
          target
        ) ?? false;

      const clickedPanel =
        panelRef.current?.contains(
          target
        ) ?? false;

      if (
        !clickedTrigger &&
        !clickedPanel
      ) {
        setIsOpen(false);
      }
    }

    window.addEventListener(
      "pointerdown",
      handlePointerDown
    );

    return () =>
      window.removeEventListener(
        "pointerdown",
        handlePointerDown
      );
  }, [isOpen]);

  async function markAllRead() {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
    });

    if (response.ok) {
      const now = new Date().toISOString();

      setNotifications((current) =>
        current.map((item) => ({
          ...item,
          readAt: item.readAt ?? now,
        }))
      );

      setUnreadCount(0);
      return;
    }

    await loadNotifications();
  }

  async function markRead(id: string) {
    const item = notifications.find(
      (notification) => notification.id === id
    );

    if (!item || item.readAt) {
      return;
    }

    const response = await fetch(
      `/api/notifications/${id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          read: true,
        }),
      }
    );

    if (response.ok) {
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id
            ? {
                ...notification,
                readAt: new Date().toISOString(),
              }
            : notification
        )
      );

      setUnreadCount((current) =>
        Math.max(0, current - 1)
      );
    }
  }

  async function removeNotification(id: string) {
    const removed = notifications.find(
      (notification) => notification.id === id
    );

    const response = await fetch(
      `/api/notifications/${id}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      await loadNotifications();
      return;
    }

    setNotifications((current) =>
      current.filter(
        (notification) => notification.id !== id
      )
    );

    if (removed && !removed.readAt) {
      setUnreadCount((current) =>
        Math.max(0, current - 1)
      );
    }
  }

  const toast =
    mounted &&
    toastNotification &&
    !isOpen
      ? createPortal(
          <div className="ui-panel fixed inset-x-3 top-[5.25rem] z-[200] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-cyan-500/25 bg-card/98 shadow-[var(--strong-shadow)] backdrop-blur-xl dark:border-sky-400/20 dark:bg-[#0b0f16]/98 sm:left-auto sm:right-5 sm:w-[min(360px,calc(100vw-2rem))]">
            <div className="flex items-start gap-3 p-4">
              <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-700 dark:text-sky-300">
                <Bell className="size-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-sky-400">
                  {humanize(
                    toastNotification.type
                  )}
                </p>

                <p className="mt-1 text-sm font-semibold text-foreground dark:text-white">
                  {
                    toastNotification.title
                  }
                </p>

                {toastNotification.message ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {
                      toastNotification.message
                    }
                  </p>
                ) : null}

                <div className="mt-3 flex items-center gap-2">
                  {toastNotification.href ? (
                    <Link
                      href={
                        toastNotification.href
                      }
                      onClick={() => {
                        void markRead(
                          toastNotification.id
                        );
                        setToastNotification(
                          null
                        );
                      }}
                      className="text-xs font-semibold text-cyan-700 hover:underline dark:text-sky-300"
                    >
                      Open
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(true);
                        setToastNotification(
                          null
                        );
                      }}
                      className="text-xs font-semibold text-cyan-700 hover:underline dark:text-sky-300"
                    >
                      View notifications
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setToastNotification(
                        null
                      )
                    }
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setToastNotification(
                    null
                  )
                }
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
                aria-label="Dismiss notification"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  const panel =
    mounted && isOpen
      ? createPortal(
          <section
            ref={panelRef}
            className="ui-panel fixed inset-x-3 bottom-3 top-[5.25rem] z-[200] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/98 shadow-[var(--strong-shadow)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0b0f16]/98 dark:shadow-2xl dark:shadow-black/60 sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-[5.25rem] sm:max-h-[calc(100dvh-6rem)] sm:w-[min(390px,calc(100vw-2rem))]"
            role="dialog"
            aria-modal="false"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between gap-4 border-b border-border p-4 dark:border-white/[0.08]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-sky-400">
                  Workspace alerts
                </p>
                <h2 className="mt-1 font-semibold text-foreground dark:text-white">
                  Notifications
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void markAllRead()
                  }
                  disabled={
                    unreadCount === 0
                  }
                  className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:text-slate-500 dark:hover:bg-white/[0.04] dark:hover:text-white"
                  aria-label="Mark all read"
                  title="Mark all read"
                >
                  <CheckCheck className="size-4" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setIsOpen(false)
                  }
                  className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground dark:border-white/[0.08] dark:text-slate-500 dark:hover:bg-white/[0.04] dark:hover:text-white"
                  aria-label="Close notifications"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {isLoading &&
              notifications.length === 0 ? (
                <div className="space-y-2">
                  {Array.from({
                    length: 4,
                  }).map(
                    (_, index) => (
                      <div
                        key={index}
                        className="h-24 animate-pulse rounded-xl bg-muted/70 dark:bg-white/[0.04]"
                      />
                    )
                  )}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-100">
                  {error}
                </div>
              ) : null}

              {!isLoading &&
              !error &&
              notifications.length ===
                0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background/45 px-5 py-12 text-center dark:border-white/10 dark:bg-black/20">
                  <Bell className="mx-auto size-5 text-muted-foreground dark:text-slate-600" />
                  <p className="mt-4 text-sm font-semibold text-foreground dark:text-slate-300">
                    You&apos;re all caught up
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground dark:text-slate-600">
                    New inquiry, proposal and system alerts will appear here.
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                {notifications.map(
                  (
                    notification
                  ) => (
                    <NotificationCard
                      key={
                        notification.id
                      }
                      notification={
                        notification
                      }
                      onOpen={() => {
                        void markRead(
                          notification.id
                        );
                        setIsOpen(false);
                      }}
                      onDelete={() =>
                        void removeNotification(
                          notification.id
                        )
                      }
                    />
                  )
                )}
              </div>
            </div>

            <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground dark:border-white/[0.08] dark:text-slate-700">
              Refreshes every 15 seconds and when you return to Yacht OS
            </div>
          </section>,
          document.body
        )
      : null;

  return (
    <>
      <div className="relative z-50 shrink-0">
        <button
          ref={triggerRef}
          type="button"
          onPointerDown={(
            event
          ) =>
            event.stopPropagation()
          }
          onClick={() =>
            setIsOpen(
              (current) =>
                !current
            )
          }
          className="relative z-50 inline-flex size-9 shrink-0 pointer-events-auto items-center justify-center rounded-md border border-border bg-card/50 text-muted-foreground transition hover:bg-accent hover:text-foreground dark:border-white/10 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white"
          aria-label="Open notifications"
          aria-expanded={
            isOpen
          }
          aria-haspopup="dialog"
          title="Notifications"
        >
          <Bell className="size-4" />

          {unreadCount > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 99
                ? "99+"
                : unreadCount}
            </span>
          ) : null}
        </button>
      </div>

      {toast}
      {panel}
    </>
  );

}

function NotificationCard({
  notification,
  onOpen,
  onDelete,
}: {
  notification: NotificationItem;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const content = (
    <div
      className={`rounded-xl border p-4 transition ${
        notification.readAt
          ? "border-border bg-background/45 dark:border-white/[0.05] dark:bg-black/20"
          : "border-cyan-500/25 bg-cyan-500/[0.07] dark:border-sky-400/20 dark:bg-sky-400/[0.06]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-sky-400">
              {humanize(notification.type)}
            </p>

            <PriorityBadge
              priority={notification.priority}
            />
          </div>

          <h3 className="mt-2 text-sm font-semibold text-foreground dark:text-white">
            {notification.title}
          </h3>

          {notification.message ? (
            <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground dark:text-slate-500">
              {notification.message}
            </p>
          ) : null}

          <p className="mt-3 text-[11px] text-muted-foreground dark:text-slate-700">
            {formatRelativeTime(
              notification.createdAt
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete();
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-500/10 hover:text-red-700 dark:text-slate-700 dark:hover:text-red-300"
          aria-label="Delete notification"
          title="Delete notification"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );

  if (!notification.href) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={notification.href}
      onClick={onOpen}
      className="block"
    >
      {content}
    </Link>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: string;
}) {
  if (
    priority === "normal" ||
    priority === "low"
  ) {
    return null;
  }

  const classes =
    priority === "critical"
      ? "border-red-500/20 bg-red-500/10 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300"
      : "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300";

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${classes}`}
    >
      {priority}
    </span>
  );
}

function humanize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "Unknown time";
  }

  const difference = timestamp - Date.now();
  const absolute = Math.abs(difference);

  if (absolute < 60_000) {
    return "Just now";
  }

  const formatter =
    new Intl.RelativeTimeFormat("en", {
      numeric: "auto",
    });

  if (absolute < 3_600_000) {
    return formatter.format(
      Math.round(difference / 60_000),
      "minute"
    );
  }

  if (absolute < 86_400_000) {
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