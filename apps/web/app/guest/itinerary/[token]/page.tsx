"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useParams,
} from "next/navigation";

const FALLBACK_HERO_IMAGE =
  "/proposal-yacht/hero-exterior.png";

type PublicItineraryResponse = {
  success: boolean;
  hero?: {
    imageUrl: string;
    fallbackImageUrl: string;
    source:
      | "custom"
      | "placeholder";
  };
  charter?: {
    id: string;
    reference: string;
    clientName: string;
    yachtName: string;
    startDate: string | null;
    endDate: string | null;
    destination: string | null;
    embarkationPort: string | null;
    disembarkationPort: string | null;
    guests: number | null;
  };
  itinerary?: {
    id: string;
    title: string;
    status: string;
  };
  days?: Day[];
  error?: string;
};

type Day = {
  id: string;
  position: number;
  charterDate: string;
  title: string;
  destinationName: string | null;
  overnightType: string;
  overnightName: string | null;
  summary: string | null;
  guestNotes: string | null;
  activities: Activity[];
  routeLegs: Array<{
    id: string;
    position: number;
    fromName: string;
    toName: string;
    distanceNm: number | null;
    departureTime: string | null;
    arrivalTime: string | null;
    notes: string | null;
  }>;
};

type Activity = {
  id: string;
  position: number;
  activityType: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  description: string | null;
  status: string;
};

export default function PublicItineraryPage() {
  const params =
    useParams();

  const token =
    useMemo(() => {
      const value =
        params?.token;

      return typeof value ===
        "string"
        ? value
        : Array.isArray(value)
          ? value[0] ?? ""
          : "";
    }, [params]);

  const [
    data,
    setData,
  ] =
    useState<PublicItineraryResponse | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    imageFailed,
    setImageFailed,
  ] =
    useState(false);

  const load =
    useCallback(async () => {
      if (!token) {
        return;
      }

      try {
        const response =
          await fetch(
            `/api/public/guest/itinerary/${encodeURIComponent(
              token
            )}`,
            {
              cache:
                "no-store",
            }
          );

        const result =
          (await response.json()) as PublicItineraryResponse;

        setData(result);
      } catch {
        setData({
          success: false,
          error:
            "This itinerary could not be loaded.",
        });
      } finally {
        setLoading(false);
      }
    }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f3f1eb] p-4 sm:p-6">
        <div className="mx-auto max-w-6xl">
          <div className="h-[520px] animate-pulse rounded-[32px] bg-slate-200" />
        </div>
      </main>
    );
  }

  if (
    !data?.success ||
    !data.charter ||
    !data.itinerary
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3f1eb] px-4 py-12 text-slate-950">
        <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-7 text-center shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Intrigue Yacht OS
          </p>

          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">
            Itinerary unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            {data?.error ??
              "This secure itinerary link is unavailable."}
          </p>
        </div>
      </main>
    );
  }

  const charter =
    data.charter;

  const days =
    data.days ?? [];

  const hero =
    imageFailed
      ? data.hero
          ?.fallbackImageUrl ??
        FALLBACK_HERO_IMAGE
      : data.hero?.imageUrl ??
        FALLBACK_HERO_IMAGE;

  return (
    <main className="min-h-screen bg-[#f3f1eb] text-slate-950">
      <section className="relative min-h-[72vh] overflow-hidden bg-slate-950">
        <img
          src={hero}
          alt={`${charter.yachtName} charter`}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() =>
            setImageFailed(true)
          }
        />

        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/30" />

        <div className="relative z-10 mx-auto flex min-h-[72vh] max-w-6xl flex-col justify-between px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
                Intrigue Yacht OS
              </p>
              <p className="mt-1 text-xs font-semibold text-white">
                Private charter itinerary
              </p>
            </div>

            <span className="rounded-full border border-white/20 bg-black/20 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/80 backdrop-blur">
              Secure link
            </span>
          </div>

          <div className="max-w-4xl pb-6 sm:pb-10">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
              Your charter itinerary
            </p>

            <h1 className="mt-5 text-5xl font-semibold leading-[0.92] tracking-[-0.05em] text-white sm:text-7xl lg:text-8xl">
              {charter.yachtName}
            </h1>

            <p className="mt-5 text-lg text-white/80 sm:text-xl">
              {formatDateRange(
                charter.startDate,
                charter.endDate
              )}
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              <Meta
                label="Destination"
                value={
                  charter.destination ??
                  "To be confirmed"
                }
              />
              <Meta
                label="Guests"
                value={
                  charter.guests !==
                  null
                    ? String(
                        charter.guests
                      )
                    : "To be confirmed"
                }
              />
              <Meta
                label="Embarkation"
                value={
                  charter.embarkationPort ??
                  "To be confirmed"
                }
              />
              <Meta
                label="Disembarkation"
                value={
                  charter.disembarkationPort ??
                  "To be confirmed"
                }
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Day-by-day
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
              Your journey
            </h2>
          </div>

          <p className="text-sm text-slate-500">
            {days.length} itinerary {days.length === 1 ? "day" : "days"}
          </p>
        </div>

        <div className="space-y-5">
          {days.map(
            (day, index) => (
              <article
                key={day.id}
                className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm"
              >
                <div className="grid gap-5 border-b border-slate-200 bg-slate-50 p-5 sm:grid-cols-[130px_1fr] sm:p-7">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      Day {index + 1}
                    </p>

                    <p className="mt-2 text-2xl font-semibold">
                      {formatDay(
                        day.charterDate
                      )}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-3xl font-semibold tracking-[-0.03em]">
                      {day.title}
                    </h3>

                    <p className="mt-2 text-sm text-slate-600">
                      {day.destinationName ??
                        "Destination to be confirmed"}
                    </p>
                  </div>
                </div>

                <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_0.82fr]">
                  <div>
                    {day.summary ? (
                      <p className="text-sm leading-7 text-slate-700">
                        {day.summary}
                      </p>
                    ) : null}

                    {day.routeLegs.length >
                    0 ? (
                      <div className="mt-6">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Cruising
                        </p>

                        <div className="mt-3 space-y-3">
                          {day.routeLegs.map(
                            (leg) => (
                              <div
                                key={leg.id}
                                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                              >
                                <p className="font-semibold">
                                  {leg.fromName} - {leg.toName}
                                </p>

                                <p className="mt-1 text-xs leading-5 text-slate-600">
                                  {[
                                    leg.distanceNm !==
                                    null
                                      ? `${leg.distanceNm} nm`
                                      : null,
                                    leg.departureTime
                                      ? `Depart ${formatTime(
                                          leg.departureTime
                                        )}`
                                      : null,
                                    leg.arrivalTime
                                      ? `Arrive ${formatTime(
                                          leg.arrivalTime
                                        )}`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" - ")}
                                </p>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    ) : null}

                    {day.guestNotes ? (
                      <div className="mt-6 rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-800">
                          Notes for your charter
                        </p>

                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                          {day.guestNotes}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      Experiences
                    </p>

                    {day.activities.length >
                    0 ? (
                      <div className="mt-3 space-y-3">
                        {day.activities.map(
                          (activity) => (
                            <div
                              key={
                                activity.id
                              }
                              className="rounded-2xl border border-slate-200 p-4"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600">
                                  {formatLabel(
                                    activity.activityType
                                  )}
                                </span>

                                {activity.status ===
                                "confirmed" ? (
                                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                                    Confirmed
                                  </span>
                                ) : null}
                              </div>

                              <p className="mt-3 font-semibold">
                                {activity.title}
                              </p>

                              <p className="mt-1 text-xs leading-5 text-slate-600">
                                {[
                                  activity.startTime
                                    ? formatTime(
                                        activity.startTime
                                      )
                                    : null,
                                  activity.location,
                                ]
                                  .filter(Boolean)
                                  .join(" - ")}
                              </p>

                              {activity.description ? (
                                <p className="mt-3 text-sm leading-6 text-slate-600">
                                  {activity.description}
                                </p>
                              ) : null}
                            </div>
                          )
                        )}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                        Experiences are being arranged.
                      </div>
                    )}

                    {day.overnightType !==
                    "none" ? (
                      <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-white">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                          Overnight
                        </p>

                        <p className="mt-2 font-semibold">
                          {formatLabel(
                            day.overnightType
                          )}
                          {day.overnightName
                            ? ` - ${day.overnightName}`
                            : ""}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          )}
        </div>

        <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5 text-xs leading-6 text-slate-500">
          Final timings, routes, anchorages and activities remain subject to weather, yacht operations, local conditions and supplier availability.
        </div>
      </section>
    </main>
  );
}

function Meta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span className="rounded-full border border-white/20 bg-black/20 px-3 py-2 text-xs text-white/80 backdrop-blur">
      <span className="text-white/55">
        {label}
      </span>
      {" - "}
      <span className="font-semibold text-white">
        {value}
      </span>
    </span>
  );
}

function formatDateRange(
  start: string | null,
  end: string | null
) {
  return `${formatFullDate(
    start
  )} - ${formatFullDate(
    end
  )}`;
}

function formatFullDate(
  value: string | null
) {
  if (!value) {
    return "TBC";
  }

  const date =
    new Date(
      `${value.slice(
        0,
        10
      )}T12:00:00`
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
      month: "long",
      year: "numeric",
    }
  );
}

function formatDay(
  value: string
) {
  const date =
    new Date(
      `${value}T12:00:00`
    );

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
    }
  );
}

function formatTime(
  value: string
) {
  return value.slice(0, 5);
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