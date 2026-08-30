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
  itinerary?: {
    id: string;
    title: string;
    status: string;
  } | null;
  days?: Day[];
  stats?: {
    days: number;
    guestVisibleDays: number;
    activities: number;
    guestVisibleActivities: number;
  };
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
  internalNotes: string | null;
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

const emptyDayForm = {
  charterDate: "",
  title: "",
  destinationName: "",
  overnightType: "none",
  overnightName: "",
  summary: "",
  guestNotes: "",
  internalNotes: "",
  guestVisible: true,
};

const emptyActivityForm = {
  activityType: "activity",
  title: "",
  startTime: "",
  endTime: "",
  location: "",
  description: "",
  status: "planning",
  guestVisible: true,
};

export default function ItineraryExperiencePage() {
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
    busy,
    setBusy,
  ] =
    useState(false);

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

  const [
    editingDayId,
    setEditingDayId,
  ] =
    useState<string | null>(
      null
    );

  const [
    activityDayId,
    setActivityDayId,
  ] =
    useState<string | null>(
      null
    );

  const [
    dayForm,
    setDayForm,
  ] =
    useState(emptyDayForm);

  const [
    activityForm,
    setActivityForm,
  ] =
    useState(
      emptyActivityForm
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
              "Could not load itinerary experience."
          );
        }

        setData(result);
      } catch (
        caughtError
      ) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load itinerary experience."
        );
      } finally {
        setLoading(false);
      }
    }, [charterId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(
    body:
      Record<
        string,
        unknown
      >
  ) {
    if (
      !charterId ||
      busy
    ) {
      return false;
    }

    try {
      setBusy(true);
      setError(null);
      setMessage(null);

      const response =
        await fetch(
          `/api/charters/${encodeURIComponent(
            charterId
          )}/itinerary/experience`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify(
                body
              ),
          }
        );

      const result =
        (await response.json()) as {
          success: boolean;
          error?: string;
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not update itinerary experience."
        );
      }

      await load();

      return true;
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update itinerary experience."
      );

      return false;
    } finally {
      setBusy(false);
    }
  }

  async function generateDays() {
    const worked =
      await action({
        action:
          "seed_days",
      });

    if (worked) {
      setMessage(
        "Charter days generated."
      );
    }
  }

  async function saveDay() {
    const worked =
      await action({
        action:
          "save_day",
        dayId:
          editingDayId,
        charterDate:
          dayForm.charterDate,
        title:
          dayForm.title,
        destinationName:
          blank(
            dayForm.destinationName
          ),
        overnightType:
          dayForm.overnightType,
        overnightName:
          blank(
            dayForm.overnightName
          ),
        summary:
          blank(
            dayForm.summary
          ),
        guestNotes:
          blank(
            dayForm.guestNotes
          ),
        internalNotes:
          blank(
            dayForm.internalNotes
          ),
        guestVisible:
          dayForm.guestVisible,
      });

    if (worked) {
      setEditingDayId(null);
      setDayForm(
        emptyDayForm
      );
      setMessage(
        "Itinerary day saved."
      );
    }
  }

  async function deleteDay(
    day: Day
  ) {
    if (
      !window.confirm(
        `Delete ${day.title}? Activities on this day will also be removed.`
      )
    ) {
      return;
    }

    const worked =
      await action({
        action:
          "delete_day",
        dayId: day.id,
      });

    if (worked) {
      setMessage(
        "Itinerary day deleted."
      );
    }
  }

  async function saveActivity() {
    if (!activityDayId) {
      setError(
        "Choose a day before adding an experience."
      );
      return;
    }

    const worked =
      await action({
        action:
          "save_activity",
        dayId:
          activityDayId,
        activityType:
          activityForm.activityType,
        title:
          activityForm.title,
        startTime:
          blank(
            activityForm.startTime
          ),
        endTime:
          blank(
            activityForm.endTime
          ),
        location:
          blank(
            activityForm.location
          ),
        description:
          blank(
            activityForm.description
          ),
        status:
          activityForm.status,
        guestVisible:
          activityForm.guestVisible,
      });

    if (worked) {
      setActivityDayId(null);
      setActivityForm(
        emptyActivityForm
      );
      setMessage(
        "Experience added."
      );
    }
  }

  async function deleteActivity(
    activity: Activity
  ) {
    if (
      !window.confirm(
        `Delete ${activity.title}?`
      )
    ) {
      return;
    }

    const worked =
      await action({
        action:
          "delete_activity",
        activityId:
          activity.id,
      });

    if (worked) {
      setMessage(
        "Experience deleted."
      );
    }
  }

  function editDay(
    day: Day
  ) {
    setEditingDayId(
      day.id
    );

    setDayForm({
      charterDate:
        day.charterDate,
      title:
        day.title,
      destinationName:
        day.destinationName ??
        "",
      overnightType:
        day.overnightType,
      overnightName:
        day.overnightName ??
        "",
      summary:
        day.summary ?? "",
      guestNotes:
        day.guestNotes ??
        "",
      internalNotes:
        day.internalNotes ??
        "",
      guestVisible:
        day.guestVisible,
    });
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="ui-panel h-80 animate-pulse rounded-[30px]" />
      </main>
    );
  }

  if (
    !data?.charter
  ) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-red-500/25 bg-red-500/10 p-6 text-sm text-red-800 dark:text-red-200">
          {error ??
            "Charter not found."}
        </div>
      </main>
    );
  }

  const charter =
    data.charter;

  const days =
    data.days ?? [];

  const stats =
    data.stats ?? {
      days: 0,
      guestVisibleDays: 0,
      activities: 0,
      guestVisibleActivities: 0,
    };

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-5">
        <section className="ui-hero rounded-[30px] p-6 sm:p-8">
          <p className="ui-hero-accent text-xs font-semibold uppercase tracking-[0.22em]">
            Day-by-day itinerary
          </p>

          <h1 className="mt-5 text-5xl leading-none tracking-[0.04em] text-[var(--hero-foreground)] sm:text-6xl">
            {charter.yachtName}
          </h1>

          <p className="ui-hero-muted mt-4 max-w-3xl text-sm leading-7">
            {charter.clientName} - {charter.reference} - {formatDateRange(
              charter.startDate,
              charter.endDate
            )}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href={`/itineraries/${encodeURIComponent(
                charter.id
              )}`}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-[var(--hero-foreground)]"
            >
              Route and fuel
            </Link>

            <Link
              href={`/itineraries/${encodeURIComponent(
                charter.id
              )}/preview`}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-[var(--hero-foreground)]"
            >
              Client preview
            </Link>

            <Link
              href={`/itineraries/${encodeURIComponent(
                charter.id
              )}/share`}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-[var(--hero-foreground)]"
            >
              Share itinerary
            </Link>
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

        {!data.itinerary ? (
          <section className="ui-panel rounded-[28px] p-6 text-center">
            <h2 className="font-heading text-2xl text-foreground">
              Create the route itinerary first
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The day-by-day experience sits on top of the existing itinerary and fuel workspace.
            </p>
            <Link
              href={`/itineraries/${encodeURIComponent(
                charter.id
              )}`}
              className="ui-primary-button mt-5 inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold"
            >
              Open route planner
            </Link>
          </section>
        ) : (
          <>
            <section className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Days"
                value={String(
                  stats.days
                )}
              />
              <Metric
                label="Guest-visible days"
                value={String(
                  stats.guestVisibleDays
                )}
              />
              <Metric
                label="Experiences"
                value={String(
                  stats.activities
                )}
              />
              <Metric
                label="Guest-visible experiences"
                value={String(
                  stats.guestVisibleActivities
                )}
              />
            </section>

            <section className="grid gap-5 [&>*]:min-w-0 xl:grid-cols-[0.82fr_1.18fr]">
              <div className="space-y-4">
                <div className="ui-panel rounded-[28px] p-5 sm:p-6">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                        Day structure
                      </p>
                      <h2 className="mt-2 font-heading text-2xl text-foreground">
                        {editingDayId
                          ? "Edit itinerary day"
                          : "Add itinerary day"}
                      </h2>
                    </div>

                    {editingDayId ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDayId(
                            null
                          );
                          setDayForm(
                            emptyDayForm
                          );
                        }}
                        className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Date"
                      type="date"
                      value={
                        dayForm.charterDate
                      }
                      onChange={(
                        value
                      ) =>
                        setDayForm({
                          ...dayForm,
                          charterDate:
                            value,
                        })
                      }
                    />

                    <Field
                      label="Title"
                      value={
                        dayForm.title
                      }
                      onChange={(
                        value
                      ) =>
                        setDayForm({
                          ...dayForm,
                          title: value,
                        })
                      }
                    />

                    <Field
                      label="Destination"
                      value={
                        dayForm.destinationName
                      }
                      onChange={(
                        value
                      ) =>
                        setDayForm({
                          ...dayForm,
                          destinationName:
                            value,
                        })
                      }
                    />

                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                        Overnight
                      </span>
                      <select
                        value={
                          dayForm.overnightType
                        }
                        onChange={(
                          event
                        ) =>
                          setDayForm({
                            ...dayForm,
                            overnightType:
                              event.target
                                .value,
                          })
                        }
                        className="ui-input mt-2 w-full px-3.5 py-3 text-sm"
                      >
                        <option value="none">
                          None
                        </option>
                        <option value="marina">
                          Marina
                        </option>
                        <option value="anchorage">
                          Anchorage
                        </option>
                        <option value="port">
                          Port
                        </option>
                        <option value="underway">
                          Underway
                        </option>
                      </select>
                    </label>

                    <div className="sm:col-span-2">
                      <Field
                        label="Marina / anchorage / overnight name"
                        value={
                          dayForm.overnightName
                        }
                        onChange={(
                          value
                        ) =>
                          setDayForm({
                            ...dayForm,
                            overnightName:
                              value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <TextArea
                    label="Day summary"
                    value={
                      dayForm.summary
                    }
                    placeholder="Guest-facing overview of the day..."
                    onChange={(
                      value
                    ) =>
                      setDayForm({
                        ...dayForm,
                        summary: value,
                      })
                    }
                  />

                  <TextArea
                    label="Guest notes"
                    value={
                      dayForm.guestNotes
                    }
                    placeholder="Optional information suitable for the charterer..."
                    onChange={(
                      value
                    ) =>
                      setDayForm({
                        ...dayForm,
                        guestNotes:
                          value,
                      })
                    }
                  />

                  <TextArea
                    label="Internal notes"
                    value={
                      dayForm.internalNotes
                    }
                    placeholder="Broker-only notes..."
                    onChange={(
                      value
                    ) =>
                      setDayForm({
                        ...dayForm,
                        internalNotes:
                          value,
                      })
                    }
                  />

                  <label className="mt-4 flex items-start gap-3 rounded-xl border border-border px-4 py-3">
                    <input
                      type="checkbox"
                      checked={
                        dayForm.guestVisible
                      }
                      onChange={(
                        event
                      ) =>
                        setDayForm({
                          ...dayForm,
                          guestVisible:
                            event.target
                              .checked,
                        })
                      }
                    />
                    <span className="text-sm text-foreground">
                      Show this day in the client itinerary
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      void saveDay()
                    }
                    disabled={busy}
                    className="ui-primary-button mt-4 min-h-11 w-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    {editingDayId
                      ? "Save day changes"
                      : "Add itinerary day"}
                  </button>

                  {!editingDayId ? (
                    <button
                      type="button"
                      onClick={() =>
                        void generateDays()
                      }
                      disabled={busy}
                      className="ui-secondary-button mt-2 min-h-11 w-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                    >
                      Generate all charter days
                    </button>
                  ) : null}
                </div>

                {activityDayId ? (
                  <div className="ui-panel rounded-[28px] p-5 sm:p-6">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                          Experience
                        </p>
                        <h2 className="mt-2 font-heading text-2xl text-foreground">
                          Add guest experience
                        </h2>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setActivityDayId(
                            null
                          );
                          setActivityForm(
                            emptyActivityForm
                          );
                        }}
                        className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Close
                      </button>
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                          Type
                        </span>
                        <select
                          value={
                            activityForm.activityType
                          }
                          onChange={(
                            event
                          ) =>
                            setActivityForm({
                              ...activityForm,
                              activityType:
                                event.target
                                  .value,
                            })
                          }
                          className="ui-input mt-2 w-full px-3.5 py-3 text-sm"
                        >
                          <option value="activity">
                            Activity
                          </option>
                          <option value="dining">
                            Dining
                          </option>
                          <option value="transfer">
                            Transfer
                          </option>
                          <option value="water_sports">
                            Water sports
                          </option>
                          <option value="wellness">
                            Wellness
                          </option>
                          <option value="beach_club">
                            Beach club
                          </option>
                          <option value="culture">
                            Culture
                          </option>
                          <option value="nightlife">
                            Nightlife
                          </option>
                          <option value="shopping">
                            Shopping
                          </option>
                          <option value="other">
                            Other
                          </option>
                        </select>
                      </label>

                      <Field
                        label="Title"
                        value={
                          activityForm.title
                        }
                        onChange={(
                          value
                        ) =>
                          setActivityForm({
                            ...activityForm,
                            title: value,
                          })
                        }
                      />

                      <Field
                        label="Start time"
                        type="time"
                        value={
                          activityForm.startTime
                        }
                        onChange={(
                          value
                        ) =>
                          setActivityForm({
                            ...activityForm,
                            startTime:
                              value,
                          })
                        }
                      />

                      <Field
                        label="End time"
                        type="time"
                        value={
                          activityForm.endTime
                        }
                        onChange={(
                          value
                        ) =>
                          setActivityForm({
                            ...activityForm,
                            endTime:
                              value,
                          })
                        }
                      />

                      <div className="sm:col-span-2">
                        <Field
                          label="Location"
                          value={
                            activityForm.location
                          }
                          onChange={(
                            value
                          ) =>
                            setActivityForm({
                              ...activityForm,
                              location:
                                value,
                            })
                          }
                        />
                      </div>

                      <label className="block">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                          Status
                        </span>
                        <select
                          value={
                            activityForm.status
                          }
                          onChange={(
                            event
                          ) =>
                            setActivityForm({
                              ...activityForm,
                              status:
                                event.target
                                  .value,
                            })
                          }
                          className="ui-input mt-2 w-full px-3.5 py-3 text-sm"
                        >
                          <option value="idea">
                            Idea
                          </option>
                          <option value="planning">
                            Planning
                          </option>
                          <option value="confirmed">
                            Confirmed
                          </option>
                          <option value="completed">
                            Completed
                          </option>
                        </select>
                      </label>
                    </div>

                    <TextArea
                      label="Description"
                      value={
                        activityForm.description
                      }
                      placeholder="What the guest should know..."
                      onChange={(
                        value
                      ) =>
                        setActivityForm({
                          ...activityForm,
                          description:
                            value,
                        })
                      }
                    />

                    <label className="mt-4 flex items-start gap-3 rounded-xl border border-border px-4 py-3">
                      <input
                        type="checkbox"
                        checked={
                          activityForm.guestVisible
                        }
                        onChange={(
                          event
                        ) =>
                          setActivityForm({
                            ...activityForm,
                            guestVisible:
                              event.target
                                .checked,
                          })
                        }
                      />
                      <span className="text-sm text-foreground">
                        Show this experience to the client
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        void saveActivity()
                      }
                      disabled={busy}
                      className="ui-primary-button mt-4 min-h-11 w-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                    >
                      Add experience
                    </button>
                  </div>
                ) : null}
              </div>

              <div>
                {days.length > 0 ? (
                  <div className="space-y-4">
                    {days.map(
                      (
                        day,
                        index
                      ) => (
                        <article
                          key={day.id}
                          className="ui-panel rounded-[28px] p-5 sm:p-6"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-cyan-800 dark:text-cyan-200">
                                  Day {index + 1}
                                </span>

                                <span className="text-xs font-semibold text-muted-foreground">
                                  {formatDate(
                                    day.charterDate
                                  )}
                                </span>

                                {!day.guestVisible ? (
                                  <span className="rounded-full border border-border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                                    Internal
                                  </span>
                                ) : null}
                              </div>

                              <h3 className="mt-3 text-xl font-semibold text-foreground">
                                {day.title}
                              </h3>

                              <p className="mt-1 text-sm text-muted-foreground">
                                {day.destinationName ??
                                  "Destination not set"}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  editDay(day)
                                }
                                className="ui-secondary-button min-h-9 px-3 py-1.5 text-xs font-semibold"
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setActivityDayId(
                                    day.id
                                  );
                                  setActivityForm(
                                    emptyActivityForm
                                  );
                                }}
                                className="ui-primary-button min-h-9 px-3 py-1.5 text-xs font-semibold"
                              >
                                Add experience
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  void deleteDay(
                                    day
                                  )
                                }
                                className="min-h-9 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-800 dark:text-red-200"
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          {day.summary ? (
                            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                              {day.summary}
                            </p>
                          ) : null}

                          {day.routeLegs.length >
                          0 ? (
                            <div className="mt-4 grid gap-2">
                              {day.routeLegs.map(
                                (leg) => (
                                  <div
                                    key={leg.id}
                                    className="rounded-xl border border-border bg-background/35 px-3 py-3"
                                  >
                                    <p className="text-sm font-semibold text-foreground">
                                      {leg.fromName} - {leg.toName}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {[
                                        leg.distanceNm !==
                                        null
                                          ? `${leg.distanceNm} nm`
                                          : null,
                                        leg.departureTime
                                          ? `Depart ${leg.departureTime.slice(
                                              0,
                                              5
                                            )}`
                                          : null,
                                        leg.arrivalTime
                                          ? `Arrive ${leg.arrivalTime.slice(
                                              0,
                                              5
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

                          {day.activities.length >
                          0 ? (
                            <div className="mt-4 space-y-2">
                              {day.activities.map(
                                (
                                  activity
                                ) => (
                                  <div
                                    key={
                                      activity.id
                                    }
                                    className="rounded-xl border border-border bg-background/35 p-3"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-[9px] font-bold uppercase tracking-[0.13em] text-cyan-700 dark:text-cyan-300">
                                            {formatLabel(
                                              activity.activityType
                                            )}
                                          </span>

                                          <StatusPill
                                            value={
                                              activity.status
                                            }
                                          />

                                          {!activity.guestVisible ? (
                                            <span className="text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                                              Internal
                                            </span>
                                          ) : null}
                                        </div>

                                        <p className="mt-2 text-sm font-semibold text-foreground">
                                          {activity.title}
                                        </p>

                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {[
                                            activity.startTime
                                              ? activity.startTime.slice(
                                                  0,
                                                  5
                                                )
                                              : null,
                                            activity.location,
                                          ]
                                            .filter(Boolean)
                                            .join(" - ")}
                                        </p>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() =>
                                          void deleteActivity(
                                            activity
                                          )
                                        }
                                        className="text-xs font-semibold text-red-700 dark:text-red-300"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          ) : null}

                          {day.overnightType !==
                          "none" ? (
                            <div className="mt-4 rounded-xl border border-border bg-background/35 px-3 py-3 text-xs text-muted-foreground">
                              Overnight - {formatLabel(
                                day.overnightType
                              )}
                              {day.overnightName
                                ? ` - ${day.overnightName}`
                                : ""}
                            </div>
                          ) : null}

                          {day.internalNotes ? (
                            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-3">
                              <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-amber-900 dark:text-amber-200">
                                Internal notes
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                                {day.internalNotes}
                              </p>
                            </div>
                          ) : null}
                        </article>
                      )
                    )}
                  </div>
                ) : (
                  <div className="ui-panel rounded-[28px] px-5 py-14 text-center">
                    <p className="text-sm font-semibold text-foreground">
                      No day-by-day itinerary yet.
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Generate the charter dates, then edit each day with destinations, experiences and guest-facing notes.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  type?:
    | "text"
    | "date"
    | "time";
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        className="ui-input mt-2 w-full px-3.5 py-3 text-sm"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  placeholder?: string;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </span>
      <textarea
        rows={4}
        value={value}
        placeholder={
          placeholder
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        className="ui-input mt-2 w-full resize-y px-3.5 py-3 text-sm"
      />
    </label>
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
    <div className="ui-panel rounded-2xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function StatusPill({
  value,
}: {
  value: string;
}) {
  const positive =
    value ===
      "confirmed" ||
    value ===
      "completed";

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.11em] ${
        positive
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
          : "border-border bg-background/40 text-muted-foreground"
      }`}
    >
      {formatLabel(
        value
      )}
    </span>
  );
}

function blank(
  value: string
) {
  const cleaned =
    value.trim();

  return cleaned
    ? cleaned
    : null;
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
      month: "short",
      year: "numeric",
    }
  );
}