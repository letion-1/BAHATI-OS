"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type GuestPortalResponse = {
  success: boolean;
  charter?: {
    id: string;
    reference: string;
    clientName: string;
    clientEmail: string | null;
    yachtName: string;
    startDate: string | null;
    endDate: string | null;
    destination: string | null;
    guests: number | null;
    contractStatus: string;
    charterStatus: string;
  };
  portal?: {
    id: string;
    status: string;
    tokenHint: string | null;
    expiresAt: string | null;
    sentAt: string | null;
    openedAt: string | null;
    openedCount: number;
    submittedAt: string | null;
    preferences: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  } | null;
  readiness?: {
    contractSigned: boolean;
    clientEmail: string | null;
    clientEmailAvailable: boolean;
    gmailConnected: boolean;
    gmailAddress: string | null;
    stableLinkAvailable?: boolean;
  };
  guestUrl?: string | null;
  sender?: string;
  revoked?: boolean;
  error?: string;
};

export default function CharterPortalManagementPage() {
  const params = useParams();

  const charterId =
    useMemo(() => {
      const value =
        params?.id;

      if (
        typeof value ===
        "string"
      ) {
        return value;
      }

      if (
        Array.isArray(value)
      ) {
        return value[0] ?? "";
      }

      return "";
    }, [params]);

  const [
    data,
    setData,
  ] =
    useState<GuestPortalResponse | null>(
      null
    );

  const [
    generatedUrl,
    setGeneratedUrl,
  ] =
    useState<string | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    busyAction,
    setBusyAction,
  ] =
    useState<string | null>(
      null
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const [
    message,
    setMessage,
  ] =
    useState<string | null>(
      null
    );

  const loadPortal =
    useCallback(async () => {
      if (!charterId) {
        return;
      }

      try {
        setError(null);

        const response =
          await fetch(
            `/api/charters/${encodeURIComponent(
              charterId
            )}/guest-portal`,
            {
              cache: "no-store",
            }
          );

        const result =
          (await response.json()) as GuestPortalResponse;

        if (
          !response.ok ||
          !result.success ||
          !result.charter
        ) {
          throw new Error(
            result.error ??
              "Could not load Charter Portal."
          );
        }

        setData(result);

        if (
          typeof result.guestUrl ===
            "string" &&
          result.guestUrl.trim()
            .length > 0
        ) {
          setGeneratedUrl(
            result.guestUrl
          );
        } else if (
          !result.portal ||
          result.portal.status ===
            "revoked"
        ) {
          setGeneratedUrl(
            null
          );
        }
      } catch (
        caughtError
      ) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load Charter Portal."
        );
      } finally {
        setLoading(false);
      }
    }, [charterId]);

  useEffect(() => {
    void loadPortal();
  }, [loadPortal]);

  useEffect(() => {
    if (!charterId) {
      return;
    }

    const refresh = () => {
      void loadPortal();
    };

    const interval =
      window.setInterval(
        refresh,
        15000
      );

    const handleFocus =
      () => {
        refresh();
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
      handleFocus
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    return () => {
      window.clearInterval(
        interval
      );

      window.removeEventListener(
        "focus",
        handleFocus
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, [
    charterId,
    loadPortal,
  ]);

  async function runAction(
    action:
      | "generate"
      | "send"
      | "revoke"
  ) {
    if (
      !charterId ||
      busyAction
    ) {
      return;
    }

    try {
      setBusyAction(action);
      setError(null);
      setMessage(null);

      const response =
        await fetch(
          `/api/charters/${encodeURIComponent(
            charterId
          )}/guest-portal`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                action,
              }),
          }
        );

      const result =
        (await response.json()) as GuestPortalResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not update Charter Portal."
        );
      }

      if (
        typeof result.guestUrl ===
          "string" &&
        result.guestUrl.trim()
          .length > 0
      ) {
        setGeneratedUrl(
          result.guestUrl
        );
      } else if (
        action ===
        "revoke"
      ) {
        setGeneratedUrl(
          null
        );
      }

      setMessage(
        action === "generate"
          ? "A new secure Charter Portal link is ready. The previous client link has been replaced."
          : action === "send"
            ? `Charter Portal sent to the client${
                result.sender
                  ? ` from ${result.sender}`
                  : ""
              }.`
            : "Charter Portal link revoked."
      );

      await loadPortal();
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update Charter Portal."
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function copyLink() {
    if (
      !generatedUrl
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        generatedUrl
      );

      setMessage(
        "Charter Portal link copied."
      );
    } catch {
      setError(
        "Could not copy the Charter Portal link."
      );
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="ui-panel h-72 animate-pulse rounded-[28px]" />
      </main>
    );
  }

  if (
    !data?.charter
  ) {
    return (
      <main className="mx-auto w-full max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-red-500/25 bg-red-500/10 p-6 text-sm text-red-800 dark:text-red-200">
          {error ??
            "Charter not found."}
        </div>
      </main>
    );
  }

  const charter =
    data.charter;

  const portal =
    data.portal;

  const readiness =
    data.readiness;

  const preferenceGroups =
    portal?.preferences
      ? buildPreferenceGroups(
          portal.preferences
        )
      : [];

  return (
    <main className="mx-auto w-full max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-5">
        <section className="ui-hero rounded-[30px] p-6 sm:p-8">
          <div className="relative grid gap-7 xl:grid-cols-[1fr_360px] xl:items-end">
            <div>
              <p className="ui-hero-accent text-xs font-semibold uppercase tracking-[0.22em]">
                Client Charter Portal
              </p>

              <h1 className="mt-5 text-5xl leading-none tracking-[0.04em] text-[var(--hero-foreground)] sm:text-6xl">
                {charter.yachtName}
              </h1>

              <p className="ui-hero-muted mt-4 max-w-3xl text-sm leading-7">
                One secure post-contract link for {charter.clientName}. The
                client sees the latest itinerary, concierge arrangements,
                guest preferences and approved charter documents in one place.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  href={`/charters/${encodeURIComponent(
                    charter.id
                  )}`}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-[var(--hero-foreground)]"
                >
                  Back to charter
                </Link>

                <Link
                  href={`/itineraries/${encodeURIComponent(
                    charter.id
                  )}`}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-[var(--hero-foreground)]"
                >
                  Itinerary
                </Link>

                <Link
                  href={`/concierge/${encodeURIComponent(
                    charter.id
                  )}`}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-[var(--hero-foreground)]"
                >
                  Concierge
                </Link>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-black/10 p-5">
              <p className="ui-hero-muted text-[10px] font-semibold uppercase tracking-[0.18em]">
                Client
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--hero-foreground)]">
                {charter.clientName}
              </p>
              <p className="ui-hero-muted mt-1 break-all text-xs">
                {charter.clientEmail ??
                  "No client email"}
              </p>

              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="ui-hero-muted text-[10px] font-semibold uppercase tracking-[0.18em]">
                  Charter
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--hero-foreground)]">
                  {formatDateRange(
                    charter.startDate,
                    charter.endDate
                  )}
                </p>
                <p className="ui-hero-muted mt-1 text-xs">
                  {charter.reference}
                </p>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            {message}
          </div>
        ) : null}

        {!readiness?.contractSigned ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-900 dark:text-amber-200">
            The Charter Agreement must be marked signed before the client
            Charter Portal can be activated.
          </div>
        ) : null}

        <section className="grid gap-3 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Portal status"
            value={
              portal
                ? formatLabel(
                    portal.status
                  )
                : "Not created"
            }
          />
          <Metric
            label="Sent"
            value={formatDateTime(
              portal?.sentAt ??
                null
            )}
          />
          <Metric
            label="Opens"
            value={String(
              portal?.openedCount ??
                0
            )}
          />
          <Metric
            label="Last opened"
            value={formatDateTime(
              portal?.openedAt ??
                null
            )}
          />
          <Metric
            label="Preferences"
            value={
              portal?.submittedAt
                ? "Submitted"
                : "Not submitted"
            }
          />
        </section>

        <section className="ui-panel rounded-[28px] p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Secure client access
              </p>

              <h2 className="mt-2 font-heading text-2xl text-foreground">
                Charter Portal
              </h2>

              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Bahari OS keeps the public lookup token hashed and stores the
                recoverable token encrypted at rest. Resending uses the same
                secure client URL. Rotate the link only when you intentionally
                want to invalidate and replace the previous URL.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-background/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
              <span className="font-semibold text-foreground">
                Delivery:
              </span>{" "}
              {readiness?.gmailConnected
                ? `Gmail connected${
                    readiness.gmailAddress
                      ? ` - ${readiness.gmailAddress}`
                      : ""
                  }`
                : "Gmail not connected"}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                void runAction(
                  "generate"
                )
              }
              disabled={
                Boolean(
                  busyAction
                ) ||
                !readiness
                  ?.contractSigned
              }
              className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {busyAction ===
              "generate"
                ? "Rotating..."
                : portal &&
                    portal.status !==
                      "revoked"
                  ? "Rotate secure link"
                  : "Generate secure link"}
            </button>

            <button
              type="button"
              onClick={() =>
                void runAction(
                  "send"
                )
              }
              disabled={
                Boolean(
                  busyAction
                ) ||
                !readiness
                  ?.contractSigned ||
                !readiness
                  ?.clientEmailAvailable ||
                !readiness
                  ?.gmailConnected
              }
              className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {busyAction ===
              "send"
                ? "Sending..."
                : portal?.sentAt
                  ? "Resend Charter Portal"
                  : "Send Charter Portal"}
            </button>

            {portal &&
            portal.status !==
              "revoked" ? (
              <button
                type="button"
                onClick={() =>
                  void runAction(
                    "revoke"
                  )
                }
                disabled={Boolean(
                  busyAction
                )}
                className="apple-transition inline-flex min-h-11 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-800 disabled:opacity-60 dark:text-red-200"
              >
                {busyAction ===
                "revoke"
                  ? "Revoking..."
                  : "Revoke link"}
              </button>
            ) : null}
          </div>

          {!readiness
            ?.clientEmailAvailable ? (
            <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">
              Add the client&apos;s email address before sending the Charter
              Portal.
            </p>
          ) : null}

          {!readiness
            ?.gmailConnected ? (
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
              Connect Gmail before sending the Charter Portal from Bahari OS.
            </p>
          ) : null}

          {generatedUrl ? (
            <div className="mt-6 rounded-2xl border border-border bg-background/50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    Active secure client URL
                  </p>

                  <p className="mt-2 break-all font-mono text-xs leading-6 text-foreground">
                    {generatedUrl}
                  </p>
                </div>

                {portal?.tokenHint ? (
                  <span className="shrink-0 rounded-full border border-border bg-background/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Token - {portal.tokenHint}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void copyLink()
                  }
                  className="ui-secondary-button inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm font-semibold"
                >
                  Copy link
                </button>

                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      generatedUrl,
                      "_blank",
                      "noopener,noreferrer"
                    )
                  }
                  className="ui-secondary-button inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm font-semibold"
                >
                  Open client view
                </button>
              </div>

              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                This URL remains the same when you resend it. Use Rotate secure
                link only if the previous client URL should stop being used.
              </p>
            </div>
          ) : portal &&
            portal.status !==
              "revoked" ? (
            <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-900 dark:text-amber-200">
              This is an older portal record without a recoverable encrypted
              token. Sending or rotating once will upgrade it to the stable-link
              Charter Portal workflow.
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 [&>*]:min-w-0 xl:grid-cols-4">
          <PortalArea
            title="Itinerary"
            description="Published day-by-day route, activities and guest-facing overnight details."
            status="Live portal section"
          />
          <PortalArea
            title="Concierge"
            description="Only client-visible confirmed or planning arrangements are exposed."
            status="Live portal section"
          />
          <PortalArea
            title="Preferences"
            description="Travel, dining, provisioning, activity and onboard requests."
            status={
              portal?.submittedAt
                ? "Client submitted"
                : "Awaiting client"
            }
          />
          <PortalArea
            title="Documents"
            description="Only approved client-safe charter document categories are shown."
            status="Controlled access"
          />
        </section>

        {portal?.submittedAt ? (
          <section className="ui-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Client submission
                </p>

                <h2 className="mt-2 font-heading text-2xl text-foreground">
                  Guest preferences
                </h2>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Latest submission from {charter.clientName}. Bahari OS also
                  synchronizes actionable sections into Concierge for broker
                  review.
                </p>
              </div>

              <div className="text-left sm:text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Last submitted
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatDateTime(
                    portal.submittedAt
                  )}
                </p>
              </div>
            </div>

            {preferenceGroups.length >
            0 ? (
              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                {preferenceGroups.map(
                  (group) => (
                    <div
                      key={
                        group.title
                      }
                      className="ui-panel-soft rounded-2xl p-4 sm:p-5"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                        {
                          group.title
                        }
                      </p>

                      <div className="mt-4 space-y-3">
                        {group.entries.map(
                          (
                            item
                          ) => (
                            <div
                              key={`${group.title}-${item.label}`}
                              className="rounded-xl border border-border bg-background/35 px-3 py-3"
                            >
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {
                                  item.label
                                }
                              </p>

                              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">
                                {
                                  item.value
                                }
                              </p>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-border bg-background/35 px-4 py-8 text-center text-sm text-muted-foreground">
                The client submitted the portal, but no preference fields
                contain values.
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}

type PreferenceEntry = {
  label: string;
  value: string;
};

type PreferenceGroup = {
  title: string;
  entries: PreferenceEntry[];
};

function buildPreferenceGroups(
  preferences: Record<string, unknown>
): PreferenceGroup[] {
  const travel =
    recordValue(
      preferences.travel
    );

  const dining =
    recordValue(
      preferences.dining
    );

  const activities =
    recordValue(
      preferences.activities
    );

  const provisioning =
    recordValue(
      preferences.provisioning
    );

  const celebration =
    recordValue(
      preferences.celebration
    );

  const guest =
    recordValue(
      preferences.guestPreferences
    );

  return [
    {
      title:
        "Travel & transfers",
      entries:
        compactEntries([
          entry(
            "Transfer requested",
            booleanLabel(
              travel.transferRequested
            )
          ),
          entry(
            "Preferred transfer",
            travel.transferType
          ),
          entry(
            "Flight number",
            travel.flightNumber
          ),
          entry(
            "Arrival airport",
            travel.arrivalAirport
          ),
          entry(
            "Arrival time",
            travel.arrivalTime
          ),
          entry(
            "Pickup",
            travel.pickupLocation
          ),
        ]),
    },
    {
      title: "Dining",
      entries:
        compactEntries([
          entry(
            "Reservations requested",
            booleanLabel(
              dining.restaurantsRequested
            )
          ),
          entry(
            "Dining requests",
            dining.restaurantNotes
          ),
        ]),
    },
    {
      title: "Activities",
      entries:
        compactEntries([
          entry(
            "Selected",
            arrayLabel(
              activities.selected
            )
          ),
          entry(
            "Notes",
            activities.notes
          ),
        ]),
    },
    {
      title:
        "Provisioning",
      entries:
        compactEntries([
          entry(
            "Dietary requirements",
            provisioning.dietaryRequirements
          ),
          entry(
            "Allergies",
            provisioning.allergies
          ),
          entry(
            "Food preferences",
            provisioning.foodPreferences
          ),
          entry(
            "Drinks",
            provisioning.drinks
          ),
        ]),
    },
    {
      title:
        "Celebration",
      entries:
        compactEntries([
          entry(
            "Occasion",
            celebration.type
          ),
          entry(
            "Preferred date",
            celebration.date
          ),
          entry(
            "Notes",
            celebration.notes
          ),
        ]),
    },
    {
      title:
        "Onboard preferences",
      entries:
        compactEntries([
          entry(
            "Cabins",
            guest.cabinPreferences
          ),
          entry(
            "Children",
            guest.childrenDetails
          ),
          entry(
            "Music",
            guest.musicPreferences
          ),
          entry(
            "Accessibility",
            guest.accessibilityRequirements
          ),
        ]),
    },
    {
      title:
        "Special requests",
      entries:
        compactEntries([
          entry(
            "Request",
            preferences.specialRequests
          ),
        ]),
    },
  ].filter(
    (group) =>
      group.entries.length >
      0
  );
}

function recordValue(
  value: unknown
): Record<string, unknown> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as Record<
        string,
        unknown
      >
    : {};
}

function entry(
  label: string,
  value: unknown
): PreferenceEntry | null {
  if (
    typeof value ===
      "string" &&
    value.trim().length >
      0
  ) {
    return {
      label,
      value:
        value.trim(),
    };
  }

  return null;
}

function compactEntries(
  values:
    Array<
      PreferenceEntry | null
    >
) {
  return values.filter(
    (
      value
    ): value is PreferenceEntry =>
      value !== null
  );
}

function booleanLabel(
  value: unknown
) {
  return value === true
    ? "Yes"
    : null;
}

function arrayLabel(
  value: unknown
) {
  if (!Array.isArray(value)) {
    return null;
  }

  const items =
    value.filter(
      (
        item
      ): item is string =>
        typeof item ===
          "string" &&
        item.trim().length >
          0
    );

  return items.length > 0
    ? items.join(", ")
    : null;
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="ui-panel rounded-2xl px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function PortalArea({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status: string;
}) {
  return (
    <div className="ui-panel rounded-[24px] p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
        {title}
      </p>

      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {description}
      </p>

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-xs font-semibold text-foreground">
          {status}
        </p>
      </div>
    </div>
  );
}

function formatDateTime(
  value: string | null
) {
  if (!value) {
    return "Not yet";
  }

  return new Date(
    value
  ).toLocaleString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function formatDateRange(
  start: string | null,
  end: string | null
) {
  return `${formatDate(
    start
  )} - ${formatDate(
    end
  )}`;
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "Date TBC";
  }

  const date =
    new Date(
      `${value.slice(
        0,
        10
      )}T12:00:00Z`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }
  );
}

function formatLabel(
  value: string
) {
  return value
    .split("_")
    .map(
      (word) =>
        word
          .charAt(0)
          .toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}