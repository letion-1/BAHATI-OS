"use client";

import {
  CheckCircle2,
  Ship,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useParams,
} from "next/navigation";

type Arrangement = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  status: string;
  scheduled_at: string | null;
  location: string | null;
  vendor_name: string | null;
};

type PortalResponse = {
  success: boolean;

  portal?: {
    status: string;
    submittedAt: string | null;
    expiresAt: string | null;
    preferences:
      Record<
        string,
        unknown
      >;
  };

  hero?: {
    imageUrl: string;
    fallbackImageUrl: string;
    source:
      | "custom"
      | "placeholder";
  };

  charter?: {
    reference: string;
    clientName: string;
    yachtName: string;
    startDate: string | null;
    endDate: string | null;
    destination: string | null;
    embarkationPort: string | null;
    disembarkationPort: string | null;
    guests: number | null;
    charterStatus: string;
    contractStatus: string;
    paymentStatus: string;
  };

  itinerary?: {
    id: string;
    title: string;
    status: string;
    days: ItineraryDay[];
  } | null;

  arrangements?: Arrangement[];

  documents?: ClientDocument[];

  error?: string;
};

type ItineraryDay = {
  id: string;
  position: number;
  charterDate: string;
  title: string;
  destinationName: string | null;
  overnightType: string;
  overnightName: string | null;
  summary: string | null;
  guestNotes: string | null;
  activities: Array<{
    id: string;
    position: number;
    activityType: string;
    title: string;
    startTime: string | null;
    endTime: string | null;
    location: string | null;
    description: string | null;
    status: string;
  }>;
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

type ClientDocument = {
  id: string;
  name: string;
  category: string;
  mimeType: string;
  fileSize: number;
  version: number;
  createdAt: string;
  url: string | null;
};

type FormState = {
  transferRequested: boolean;
  transferType: string;
  flightNumber: string;
  arrivalAirport: string;
  arrivalTime: string;
  pickupLocation: string;

  restaurantsRequested: boolean;
  restaurantNotes: string;

  activities: string[];
  activityNotes: string;

  dietaryRequirements: string;
  allergies: string;
  foodPreferences: string;
  drinks: string;

  celebrationType: string;
  celebrationDate: string;
  celebrationNotes: string;

  cabinPreferences: string;
  childrenDetails: string;
  musicPreferences: string;
  accessibilityRequirements: string;

  specialRequests: string;
  consent: boolean;
};

const defaultForm:
  FormState = {
    transferRequested:
      false,
    transferType: "",
    flightNumber: "",
    arrivalAirport: "",
    arrivalTime: "",
    pickupLocation: "",

    restaurantsRequested:
      false,
    restaurantNotes: "",

    activities: [],
    activityNotes: "",

    dietaryRequirements:
      "",
    allergies: "",
    foodPreferences: "",
    drinks: "",

    celebrationType: "",
    celebrationDate: "",
    celebrationNotes: "",

    cabinPreferences: "",
    childrenDetails: "",
    musicPreferences: "",
    accessibilityRequirements:
      "",

    specialRequests: "",
    consent: false,
  };

const activityOptions = [
  "Jet skis",
  "Diving",
  "Snorkelling",
  "Water sports",
  "Fishing",
  "Spa",
  "Golf",
  "Beach clubs",
  "Nightlife",
  "Cultural excursions",
];

export default function GuestPreferencePage() {
  const params =
    useParams<{
      token: string;
    }>();

  const token =
    params.token;

  const [
    data,
    setData,
  ] =
    useState<PortalResponse | null>(
      null
    );

  const [
    form,
    setForm,
  ] =
    useState<FormState>(
      defaultForm
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    submitting,
    setSubmitting,
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
    success,
    setSuccess,
  ] =
    useState<string | null>(
      null
    );

  const [
    imageFailed,
    setImageFailed,
  ] =
    useState(false);

  const loadPortal =
    useCallback(async () => {
      if (!token) {
        return;
      }

      try {
        setError(null);

        const response =
          await fetch(
            `/api/public/guest/${encodeURIComponent(
              token
            )}`,
            {
              cache:
                "no-store",
            }
          );

        const result =
          (await response.json()) as PortalResponse;

        if (
          !response.ok ||
          !result.success ||
          !result.charter
        ) {
          throw new Error(
            result.error ??
              "This guest portal is unavailable."
          );
        }

        setData(result);
        setImageFailed(false);

        if (
          result.portal
            ?.preferences
        ) {
          setForm(
            hydrateForm(
              result.portal
                .preferences
            )
          );
        }
      } catch (
        caughtError
      ) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "This guest portal is unavailable."
        );
      } finally {
        setLoading(false);
      }
    }, [token]);

  useEffect(() => {
    void loadPortal();
  }, [loadPortal]);

  const arrangements =
    useMemo(
      () =>
        data?.arrangements ??
        [],
      [data]
    );

  async function submitPreferences() {
    if (
      !token ||
      submitting
    ) {
      return;
    }

    if (!form.consent) {
      setError(
        "Please confirm the preference-sharing notice before submitting."
      );
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const response =
        await fetch(
          `/api/public/guest/${encodeURIComponent(
            token
          )}`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                travel: {
                  transferRequested:
                    form.transferRequested,
                  transferType:
                    form.transferType,
                  flightNumber:
                    form.flightNumber,
                  arrivalAirport:
                    form.arrivalAirport,
                  arrivalTime:
                    form.arrivalTime,
                  pickupLocation:
                    form.pickupLocation,
                },
                dining: {
                  restaurantsRequested:
                    form.restaurantsRequested,
                  restaurantNotes:
                    form.restaurantNotes,
                },
                activities: {
                  selected:
                    form.activities,
                  notes:
                    form.activityNotes,
                },
                provisioning: {
                  dietaryRequirements:
                    form.dietaryRequirements,
                  allergies:
                    form.allergies,
                  foodPreferences:
                    form.foodPreferences,
                  drinks:
                    form.drinks,
                },
                celebration: {
                  type:
                    form.celebrationType,
                  date:
                    form.celebrationDate,
                  notes:
                    form.celebrationNotes,
                },
                guestPreferences: {
                  cabinPreferences:
                    form.cabinPreferences,
                  childrenDetails:
                    form.childrenDetails,
                  musicPreferences:
                    form.musicPreferences,
                  accessibilityRequirements:
                    form.accessibilityRequirements,
                },
                specialRequests:
                  form.specialRequests,
                consent:
                  form.consent,
              }),
          }
        );

      const result =
        (await response.json()) as {
          success:
            boolean;
          error?:
            string;
        };

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Your preferences could not be submitted."
        );
      }

      setSuccess(
        "Your charter preferences have been sent to your broker."
      );

      await loadPortal();

      window.scrollTo({
        top: 0,
        behavior:
          "smooth",
      });
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Your preferences could not be submitted."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f3ee] px-5 py-12 text-slate-950">
        <div className="mx-auto max-w-5xl animate-pulse">
          <div className="h-72 rounded-[32px] bg-slate-200" />
          <div className="mt-6 h-80 rounded-[28px] bg-white" />
        </div>
      </main>
    );
  }

  if (
    error &&
    !data?.charter
  ) {
    return (
      <main className="min-h-screen bg-[#f5f3ee] px-5 py-16 text-slate-950">
        <div className="mx-auto max-w-xl rounded-[28px] border border-red-200 bg-white p-8 text-center shadow-sm">
          <Ship className="mx-auto size-8 text-slate-700" />
          <h1 className="mt-5 text-3xl font-semibold">
            Private guest portal unavailable
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            {error}
          </p>
        </div>
      </main>
    );
  }

  const charter =
    data!.charter!;

  const heroImage =
    imageFailed
      ? data?.hero
          ?.fallbackImageUrl ??
        "/proposal-yacht/hero-exterior.png"
      : data?.hero
          ?.imageUrl ??
        "/proposal-yacht/hero-exterior.png";

  const itineraryDays =
    data?.itinerary
      ?.days ??
    [];

  const clientDocuments =
    data?.documents ??
    [];

  return (
    <main className="min-h-screen bg-[#f5f3ee] text-slate-950">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <Ship className="size-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
                Bahari OS
              </p>
              <p className="mt-0.5 text-sm font-semibold">
                Private charter portal
              </p>
            </div>
          </div>

          <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 sm:inline-flex">
            Secure private link
          </span>
        </div>
      </header>

      <section className="relative min-h-[68vh] overflow-hidden bg-slate-950 text-white">
        <img
          src={heroImage}
          alt={`${charter.yachtName} charter`}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() =>
            setImageFailed(true)
          }
        />

        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/25" />

        <div className="relative mx-auto flex min-h-[68vh] max-w-6xl flex-col justify-end px-5 py-12 sm:px-8 sm:py-16">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
            Welcome aboard, {charter.clientName}
          </p>

          <h1 className="mt-5 max-w-5xl text-balance text-5xl font-semibold leading-[0.92] tracking-[-0.05em] sm:text-7xl lg:text-8xl">
            {charter.yachtName}
          </h1>

          <p className="mt-5 text-lg text-white/80">
            {formatDateRange(
              charter.startDate,
              charter.endDate
            )}
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            <MetaPill
              label="Destination"
              value={
                charter.destination ??
                "To be confirmed"
              }
            />
            <MetaPill
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
            <MetaPill
              label="Embarkation"
              value={
                charter.embarkationPort ??
                "To be confirmed"
              }
            />
            <MetaPill
              label="Disembarkation"
              value={
                charter.disembarkationPort ??
                "To be confirmed"
              }
            />
          </div>
        </div>
      </section>

      <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-5 py-3 sm:px-8">
          <PortalNavLink
            href="#overview"
            label="Overview"
          />
          <PortalNavLink
            href="#itinerary"
            label="Itinerary"
          />
          <PortalNavLink
            href="#concierge"
            label="Concierge"
          />
          <PortalNavLink
            href="#preferences"
            label="Preferences"
          />
          <PortalNavLink
            href="#documents"
            label="Documents"
          />
        </div>
      </nav>

      <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:px-8 sm:py-12">
        {success ? (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">
                Preferences submitted
              </p>
              <p className="mt-1 leading-6">
                {success}
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
            {error}
          </div>
        ) : null}

        <section
          id="overview"
          className="scroll-mt-24 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Charter overview
          </p>

          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.03em]">
                Your charter at a glance
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                One private space for your itinerary, preferences, concierge arrangements and charter documents.
              </p>
            </div>

            <span className="inline-flex w-fit rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
              {formatLabel(
                charter.contractStatus
              )}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <OverviewStat
              label="Charter"
              value={formatLabel(
                charter.charterStatus
              )}
            />

            <OverviewStat
              label="Contract"
              value={formatLabel(
                charter.contractStatus
              )}
            />

            <OverviewStat
              label="Payments"
              value={formatLabel(
                charter.paymentStatus
              )}
            />

            <OverviewStat
              label="Preferences"
              value={
                data?.portal
                  ?.submittedAt
                  ? "Submitted"
                  : "Awaiting details"
              }
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <OverviewStat
              label="Itinerary days"
              value={String(
                itineraryDays.length
              )}
            />

            <OverviewStat
              label="Concierge arrangements"
              value={String(
                arrangements.length
              )}
            />

            <OverviewStat
              label="Documents"
              value={String(
                clientDocuments.length
              )}
            />
          </div>
        </section>

        <section
          id="itinerary"
          className="scroll-mt-24 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Itinerary
              </p>

              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
                Your journey
              </h2>
            </div>

            <p className="text-sm text-slate-500">
              {itineraryDays.length} {itineraryDays.length === 1 ? "day" : "days"}
            </p>
          </div>

          {itineraryDays.length >
          0 ? (
            <div className="mt-6 space-y-4">
              {itineraryDays.map(
                (
                  day,
                  index
                ) => (
                  <article
                    key={day.id}
                    className="overflow-hidden rounded-[24px] border border-slate-200"
                  >
                    <div className="grid gap-4 [&>*]:min-w-0 bg-slate-50 p-4 sm:grid-cols-[110px_1fr] sm:p-5">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          Day {index + 1}
                        </p>
                        <p className="mt-1 text-xl font-semibold">
                          {formatShortDate(
                            day.charterDate
                          )}
                        </p>
                      </div>

                      <div>
                        <h3 className="text-xl font-semibold">
                          {day.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {day.destinationName ??
                            "Destination to be confirmed"}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-5 [&>*]:min-w-0 p-4 sm:p-5 lg:grid-cols-[1fr_0.9fr]">
                      <div>
                        {day.summary ? (
                          <p className="text-sm leading-6 text-slate-700">
                            {day.summary}
                          </p>
                        ) : null}

                        {day.routeLegs.length >
                        0 ? (
                          <div className="mt-4 space-y-2">
                            {day.routeLegs.map(
                              (
                                leg
                              ) => (
                                <div
                                  key={leg.id}
                                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                                >
                                  <p className="text-sm font-semibold">
                                    {leg.fromName} - {leg.toName}
                                  </p>

                                  <p className="mt-1 text-xs text-slate-600">
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

                        {day.guestNotes ? (
                          <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-800">
                              Notes for your charter
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                              {day.guestNotes}
                            </p>
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          Experiences
                        </p>

                        {day.activities.length >
                        0 ? (
                          <div className="mt-3 space-y-2">
                            {day.activities.map(
                              (
                                activity
                              ) => (
                                <div
                                  key={activity.id}
                                  className="rounded-2xl border border-slate-200 p-3"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600">
                                      {formatLabel(
                                        activity.activityType
                                      )}
                                    </span>

                                    {activity.status ===
                                    "confirmed" ? (
                                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                                        Confirmed
                                      </span>
                                    ) : null}
                                  </div>

                                  <p className="mt-2 text-sm font-semibold">
                                    {activity.title}
                                  </p>

                                  <p className="mt-1 text-xs text-slate-600">
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

                                  {activity.description ? (
                                    <p className="mt-2 text-xs leading-5 text-slate-600">
                                      {activity.description}
                                    </p>
                                  ) : null}
                                </div>
                              )
                            )}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-slate-500">
                            Experiences are being arranged.
                          </p>
                        )}

                        {day.overnightType !==
                        "none" ? (
                          <div className="mt-4 rounded-2xl bg-slate-950 p-3 text-white">
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                              Overnight
                            </p>
                            <p className="mt-1 text-sm font-semibold">
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
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-slate-500">
              Your broker is preparing the charter itinerary.
            </div>
          )}
        </section>

        {arrangements.length >
        0 ? (
          <section
            id="concierge"
            className="scroll-mt-24 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Concierge
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
              Charter plan
            </h2>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {arrangements.map(
                (item) => (
                  <div
                    key={
                      item.id
                    }
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                        {formatLabel(
                          item.category
                        )}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600">
                        {formatLabel(
                          item.status
                        )}
                      </span>
                    </div>

                    <p className="mt-3 font-semibold">
                      {item.title}
                    </p>

                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {[
                        item.scheduled_at
                          ? formatDateTime(
                              item.scheduled_at
                            )
                          : null,
                        item.location,
                        item.vendor_name,
                      ]
                        .filter(
                          Boolean
                        )
                        .join(
                          " - "
                        ) ||
                        "Your broker is coordinating this arrangement."}
                    </p>
                  </div>
                )
              )}
            </div>
          </section>
        ) : null}

        <div
          id="preferences"
          className="scroll-mt-24"
        />

        <PortalSection
          eyebrow="01 - Travel"
          title="Arrival & transfers"
          description="Tell your broker how you plan to arrive and whether ground or air transfer should be arranged."
        >
          <CheckRow
            checked={
              form.transferRequested
            }
            onChange={(
              checked
            ) =>
              setForm({
                ...form,
                transferRequested:
                  checked,
              })
            }
            label="I would like a transfer arranged"
          />

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label="Preferred transfer"
              value={
                form.transferType
              }
              placeholder="Private driver, helicopter, other..."
              onChange={(
                value
              ) =>
                setForm({
                  ...form,
                  transferType:
                    value,
                })
              }
            />
            <Field
              label="Flight number"
              value={
                form.flightNumber
              }
              onChange={(
                value
              ) =>
                setForm({
                  ...form,
                  flightNumber:
                    value,
                })
              }
            />
            <Field
              label="Arrival airport"
              value={
                form.arrivalAirport
              }
              onChange={(
                value
              ) =>
                setForm({
                  ...form,
                  arrivalAirport:
                    value,
                })
              }
            />
            <Field
              label="Arrival date / time"
              type="datetime-local"
              value={
                form.arrivalTime
              }
              onChange={(
                value
              ) =>
                setForm({
                  ...form,
                  arrivalTime:
                    value,
                })
              }
            />
            <div className="md:col-span-2">
              <Field
                label="Pickup location / notes"
                value={
                  form.pickupLocation
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    pickupLocation:
                      value,
                  })
                }
              />
            </div>
          </div>
        </PortalSection>

        <PortalSection
          eyebrow="02 - Dining"
          title="Dining ashore"
          description="Request restaurant reservations, beach clubs, celebration dinners or other dining experiences."
        >
          <CheckRow
            checked={
              form.restaurantsRequested
            }
            onChange={(
              checked
            ) =>
              setForm({
                ...form,
                restaurantsRequested:
                  checked,
              })
            }
            label="I would like restaurant reservations arranged"
          />

          <TextArea
            label="Restaurants / dining requests"
            value={
              form.restaurantNotes
            }
            placeholder="Restaurants you have in mind, preferred dates, cuisine, beach clubs..."
            onChange={(
              value
            ) =>
              setForm({
                ...form,
                restaurantNotes:
                  value,
              })
            }
          />
        </PortalSection>

        <PortalSection
          eyebrow="03 - Activities"
          title="Things you'd like to do"
          description="Choose anything that sounds interesting. Your broker will confirm what is possible for the yacht, location and dates."
        >
          <div className="grid gap-2 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-3">
            {activityOptions.map(
              (activity) => (
                <CheckRow
                  key={
                    activity
                  }
                  checked={
                    form.activities.includes(
                      activity
                    )
                  }
                  onChange={() =>
                    setForm({
                      ...form,
                      activities:
                        toggleValue(
                          form.activities,
                          activity
                        ),
                    })
                  }
                  label={
                    activity
                  }
                />
              )
            )}
          </div>

          <TextArea
            label="Activity notes"
            value={
              form.activityNotes
            }
            placeholder="Anything else you'd like to explore..."
            onChange={(
              value
            ) =>
              setForm({
                ...form,
                activityNotes:
                  value,
              })
            }
          />
        </PortalSection>

        <PortalSection
          eyebrow="04 - Provisioning"
          title="Food & drinks"
          description="Help the yacht team prepare the onboard experience. Only provide information relevant to your charter."
        >
          <div className="grid gap-4 [&>*]:min-w-0 md:grid-cols-2">
            <TextArea
              label="Dietary requirements"
              value={
                form.dietaryRequirements
              }
              onChange={(
                value
              ) =>
                setForm({
                  ...form,
                  dietaryRequirements:
                    value,
                })
              }
            />
            <TextArea
              label="Allergies"
              value={
                form.allergies
              }
              onChange={(
                value
              ) =>
                setForm({
                  ...form,
                  allergies:
                    value,
                })
              }
            />
            <TextArea
              label="Food preferences"
              value={
                form.foodPreferences
              }
              onChange={(
                value
              ) =>
                setForm({
                  ...form,
                  foodPreferences:
                    value,
                })
              }
            />
            <TextArea
              label="Drinks / preferred brands"
              value={
                form.drinks
              }
              onChange={(
                value
              ) =>
                setForm({
                  ...form,
                  drinks:
                    value,
                })
              }
            />
          </div>
        </PortalSection>

        <PortalSection
          eyebrow="05 - Celebrations"
          title="Special occasions"
          description="Birthday, anniversary, proposal or another moment you'd like the broker and crew to help plan."
        >
          <div className="grid gap-4 [&>*]:min-w-0 md:grid-cols-2">
            <Field
              label="Occasion"
              value={
                form.celebrationType
              }
              placeholder="Birthday, anniversary..."
              onChange={(
                value
              ) =>
                setForm({
                  ...form,
                  celebrationType:
                    value,
                })
              }
            />
            <Field
              label="Preferred date"
              type="date"
              value={
                form.celebrationDate
              }
              onChange={(
                value
              ) =>
                setForm({
                  ...form,
                  celebrationDate:
                    value,
                })
              }
            />
          </div>

          <TextArea
            label="Celebration notes"
            value={
              form.celebrationNotes
            }
            onChange={(
              value
            ) =>
              setForm({
                ...form,
                celebrationNotes:
                  value,
              })
            }
          />
        </PortalSection>

        <PortalSection
          eyebrow="06 - Onboard"
          title="Guest preferences"
          description="Share cabin, family, music or accessibility details that can help the yacht team prepare."
        >
          <div className="grid gap-4 [&>*]:min-w-0 md:grid-cols-2">
            <TextArea
              label="Cabin preferences"
              value={
                form.cabinPreferences
              }
              onChange={(
                value
              ) =>
                setForm({
                  ...form,
                  cabinPreferences:
                    value,
                })
              }
            />
            <TextArea
              label="Children aboard"
              value={
                form.childrenDetails
              }
              onChange={(
                value
              ) =>
                setForm({
                  ...form,
                  childrenDetails:
                    value,
                })
              }
            />
            <TextArea
              label="Music preferences"
              value={
                form.musicPreferences
              }
              onChange={(
                value
              ) =>
                setForm({
                  ...form,
                  musicPreferences:
                    value,
                })
              }
            />
            <TextArea
              label="Accessibility requirements"
              value={
                form.accessibilityRequirements
              }
              onChange={(
                value
              ) =>
                setForm({
                  ...form,
                  accessibilityRequirements:
                    value,
                })
              }
            />
          </div>
        </PortalSection>

        <PortalSection
          eyebrow="07 - Anything else"
          title="Special requests"
          description="Use this space for anything not covered above."
        >
          <TextArea
            label="Your request"
            value={
              form.specialRequests
            }
            rows={6}
            onChange={(
              value
            ) =>
              setForm({
                ...form,
                specialRequests:
                  value,
              })
            }
          />
        </PortalSection>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <CheckRow
            checked={
              form.consent
            }
            onChange={(
              checked
            ) =>
              setForm({
                ...form,
                consent:
                  checked,
              })
            }
            label="I understand these preferences may be shared with my broker, the yacht team and relevant service providers where necessary to arrange the charter."
          />

          <p className="mt-4 text-xs leading-5 text-slate-500">
            Submitting preferences does not create a direct supplier booking or guarantee availability. Your broker will coordinate and confirm arrangements.
          </p>

          <button
            type="button"
            onClick={() =>
              void submitPreferences()
            }
            disabled={
              submitting
            }
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 sm:w-auto"
          >
            {submitting
              ? "Submitting..."
              : data?.portal
                    ?.submittedAt
                ? "Update charter preferences"
                : "Submit charter preferences"}
          </button>
        </section>

        <section
          id="documents"
          className="scroll-mt-24 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Documents
          </p>

          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
            Charter files
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Client-facing agreements, invoices, APA documents and receipts are available here when your broker publishes them.
          </p>

          {clientDocuments.length >
          0 ? (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {clientDocuments.map(
                (
                  document
                ) => (
                  <div
                    key={document.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold">
                          {document.name}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {formatLabel(
                            document.category
                          )} - v{document.version} - {formatFileSize(
                            document.fileSize
                          )}
                        </p>
                      </div>

                      {document.url ? (
                        <a
                          href={document.url}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          Open
                        </a>
                      ) : null}
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-slate-500">
              No client-facing charter documents are available yet.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function PortalNavLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
    >
      {label}
    </a>
  );
}

function OverviewStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-950">
        {value}
      </p>
    </div>
  );
}

function formatShortDate(
  value: string
) {
  const date =
    new Date(
      `${value}T12:00:00`
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
    }
  );
}

function formatFileSize(
  bytes: number
) {
  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return "0 B";
  }

  if (bytes < 1024) {
    return `${Math.round(
      bytes
    )} B`;
  }

  if (
    bytes <
    1024 * 1024
  ) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

function PortalSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children:
    React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
        {title}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
        {description}
      </p>
      <div className="mt-6">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  placeholder?: string;
  type?:
    | "text"
    | "date"
    | "datetime-local";
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      <input
        type={type}
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
        className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </span>
      <textarea
        rows={rows}
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
        className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
      />
    </label>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (
    checked: boolean
  ) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(
          event
        ) =>
          onChange(
            event.target
              .checked
          )
        }
        className="mt-0.5 size-4"
      />
      <span className="text-sm leading-6 text-slate-700">
        {label}
      </span>
    </label>
  );
}

function MetaPill({
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

function toggleValue(
  values: string[],
  value: string
) {
  return values.includes(
    value
  )
    ? values.filter(
        (item) =>
          item !== value
      )
    : [
        ...values,
        value,
      ];
}

function hydrateForm(
  preferences:
    Record<
      string,
      unknown
    >
): FormState {
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

  return {
    transferRequested:
      travel.transferRequested ===
      true,
    transferType:
      stringValue(
        travel.transferType
      ),
    flightNumber:
      stringValue(
        travel.flightNumber
      ),
    arrivalAirport:
      stringValue(
        travel.arrivalAirport
      ),
    arrivalTime:
      stringValue(
        travel.arrivalTime
      ),
    pickupLocation:
      stringValue(
        travel.pickupLocation
      ),

    restaurantsRequested:
      dining.restaurantsRequested ===
      true,
    restaurantNotes:
      stringValue(
        dining.restaurantNotes
      ),

    activities:
      Array.isArray(
        activities.selected
      )
        ? activities.selected.filter(
            (
              value
            ): value is string =>
              typeof value ===
              "string"
          )
        : [],
    activityNotes:
      stringValue(
        activities.notes
      ),

    dietaryRequirements:
      stringValue(
        provisioning.dietaryRequirements
      ),
    allergies:
      stringValue(
        provisioning.allergies
      ),
    foodPreferences:
      stringValue(
        provisioning.foodPreferences
      ),
    drinks:
      stringValue(
        provisioning.drinks
      ),

    celebrationType:
      stringValue(
        celebration.type
      ),
    celebrationDate:
      stringValue(
        celebration.date
      ),
    celebrationNotes:
      stringValue(
        celebration.notes
      ),

    cabinPreferences:
      stringValue(
        guest.cabinPreferences
      ),
    childrenDetails:
      stringValue(
        guest.childrenDetails
      ),
    musicPreferences:
      stringValue(
        guest.musicPreferences
      ),
    accessibilityRequirements:
      stringValue(
        guest.accessibilityRequirements
      ),

    specialRequests:
      stringValue(
        preferences.specialRequests
      ),
    consent: false,
  };
}

function recordValue(
  value: unknown
): Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? (value as Record<
        string,
        unknown
      >)
    : {};
}

function stringValue(
  value: unknown
) {
  return typeof value ===
    "string"
    ? value
    : "";
}

function formatDateRange(
  start: string | null,
  end: string | null
) {
  if (!start && !end) {
    return "Dates to be confirmed";
  }

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

  return date.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}

function formatDateTime(
  value: string
) {
  const date =
    new Date(value);

  return date.toLocaleString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
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