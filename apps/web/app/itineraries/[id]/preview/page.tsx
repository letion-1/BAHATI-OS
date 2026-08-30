"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useParams,
} from "next/navigation";

type ExperienceResponse = {
  success: boolean;
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
  days?: Day[];
  error?: string;
};

type Day = {
  id: string;
  charterDate: string;
  title: string;
  destinationName: string | null;
  overnightType: string;
  overnightName: string | null;
  summary: string | null;
  guestNotes: string | null;
  guestVisible: boolean;
  activities: Activity[];
  routeLegs: Array<{
    id: string;
    fromName: string;
    toName: string;
    distanceNm: number | null;
    departureTime: string | null;
    arrivalTime: string | null;
    guestVisible: boolean;
  }>;
};

type Activity = {
  id: string;
  activityType: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  description: string | null;
  status: string;
  guestVisible: boolean;
};

export default function ItineraryPreviewPage() {
  const params =
    useParams();

  const charterId =
    useMemo(() => {
      const value =
        params?.id;

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
    useState<ExperienceResponse | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  const load =
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
            )}/itinerary/experience`,
            {
              cache:
                "no-store",
            }
          );

        const result =
          (await response.json()) as ExperienceResponse;

        if (
          !response.ok ||
          !result.success ||
          !result.charter
        ) {
          throw new Error(
            result.error ??
              "Could not load itinerary preview."
          );
        }

        setData(result);
      } catch (
        caughtError
      ) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load itinerary preview."
        );
      } finally {
        setLoading(false);
      }
    }, [charterId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f3f1eb] px-4 py-8 text-slate-950 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="h-80 animate-pulse rounded-[32px] bg-slate-200" />
        </div>
      </main>
    );
  }

  if (!data?.charter) {
    return (
      <main className="min-h-screen bg-[#f3f1eb] px-4 py-12 text-slate-950 sm:px-6">
        <div className="mx-auto max-w-xl rounded-[28px] border border-red-200 bg-white p-7 text-center">
          <h1 className="text-2xl font-semibold">
            Itinerary preview unavailable
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {error ??
              "The itinerary could not be loaded."}
          </p>
        </div>
      </main>
    );
  }

  const charter =
    data.charter;

  const days =
    (data.days ?? []).filter(
      (day) =>
        day.guestVisible
    );

  return (
    <main className="min-h-screen bg-[#f3f1eb] text-slate-950">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
              Client itinerary preview
            </p>
            <p className="mt-1 text-sm font-semibold">
              {charter.reference}
            </p>
          </div>

          <Link
            href={`/itineraries/${encodeURIComponent(
              charter.id
            )}`}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
          >
            Back to planner
          </Link>
        </div>
      </header>

      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
            Your charter itinerary
          </p>

          <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[0.96] tracking-[-0.045em] sm:text-7xl">
            {charter.yachtName}
          </h1>

          <p className="mt-5 text-lg text-slate-300">
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
                charter.guests !== null
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
      </section>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6 sm:py-12">
        {days.length > 0 ? (
          days.map(
            (day, index) => {
              const activities =
                day.activities.filter(
                  (activity) =>
                    activity.guestVisible &&
                    activity.status !==
                      "cancelled"
                );

              const routeLegs =
                day.routeLegs.filter(
                  (leg) =>
                    leg.guestVisible
                );

              return (
                <article
                  key={day.id}
                  className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"
                >
                  <div className="grid gap-5 [&>*]:min-w-0 border-b border-slate-200 bg-slate-50 p-5 sm:grid-cols-[120px_1fr] sm:p-7">
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
                      <h2 className="text-3xl font-semibold tracking-[-0.03em]">
                        {day.title}
                      </h2>
                      <p className="mt-2 text-sm text-slate-600">
                        {day.destinationName ??
                          "Destination to be confirmed"}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-5 [&>*]:min-w-0 p-5 sm:p-7 lg:grid-cols-[1fr_0.82fr]">
                    <div>
                      {day.summary ? (
                        <p className="text-sm leading-7 text-slate-700">
                          {day.summary}
                        </p>
                      ) : (
                        <p className="text-sm leading-7 text-slate-500">
                          Your broker is preparing the details for this day.
                        </p>
                      )}

                      {routeLegs.length >
                      0 ? (
                        <div className="mt-6 space-y-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                            Cruising
                          </p>

                          {routeLegs.map(
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

                      {activities.length >
                      0 ? (
                        <div className="mt-3 space-y-3">
                          {activities.map(
                            (activity) => (
                              <div
                                key={activity.id}
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
              );
            }
          )
        ) : (
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
            <p className="text-lg font-semibold">
              No guest-visible itinerary days yet.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Return to the planner and generate or add day-by-day itinerary content.
            </p>
          </div>
        )}

        <div className="rounded-[24px] border border-slate-200 bg-white p-5 text-xs leading-6 text-slate-500">
          This is a planning preview. Final timings, routes, anchorages and activities remain subject to weather, yacht operations, local conditions and supplier availability.
        </div>
      </div>
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
    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-300">
      <span className="text-slate-500">
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