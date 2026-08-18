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

type Data = {
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
    currency: string;
  };
  itinerary?: {
    id: string;
    title: string;
    status: string;
    cruisingSpeedKnots: number | null;
    fuelBurnLph: number | null;
    fuelPricePerLiter: number | null;
    fuelCurrency: string;
    contingencyPercent: number;
    notes: string | null;
  } | null;
  legs?: Leg[];
  totals?: Totals;
  error?: string;
};

type Leg = {
  id: string;
  position: number;
  charterDate: string | null;
  fromName: string;
  toName: string;
  distanceNm: number | null;
  distanceSource: string;
  departureTime: string | null;
  arrivalTime: string | null;
  guestVisible: boolean;
  notes: string | null;
  estimate: {
    hours: number | null;
    fuelLiters: number | null;
    baseFuelCost: number | null;
    fuelCostWithContingency: number | null;
  };
};

type Totals = {
  legCount: number;
  distanceNm: number;
  hours: number | null;
  fuelLiters: number | null;
  baseFuelCost: number | null;
  fuelCostWithContingency: number | null;
  contingencyPercent: number;
  currency: string;
};

export default function ItineraryPlannerPage() {
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
          ? value[0] ??
            ""
          : "";
    }, [params]);

  const [
    data,
    setData,
  ] =
    useState<Data | null>(
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
    showLegForm,
    setShowLegForm,
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
    settings,
    setSettings,
  ] =
    useState({
      cruisingSpeedKnots:
        "",
      fuelBurnLph: "",
      fuelPricePerLiter:
        "",
      fuelCurrency:
        "EUR",
      contingencyPercent:
        "10",
      status:
        "draft",
      notes: "",
    });

  const [
    legForm,
    setLegForm,
  ] =
    useState({
      charterDate: "",
      fromName: "",
      toName: "",
      distanceNm: "",
      fromLat: "",
      fromLon: "",
      toLat: "",
      toLon: "",
      departureTime: "",
      arrivalTime: "",
      guestVisible: true,
      notes: "",
    });

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
            )}/itinerary`,
            {
              cache:
                "no-store",
            }
          );

        const result =
          (await response.json()) as Data;

        if (
          !response.ok ||
          !result.success ||
          !result.charter
        ) {
          throw new Error(
            result.error ??
              "Could not load itinerary."
          );
        }

        setData(result);

        if (result.itinerary) {
          setSettings({
            cruisingSpeedKnots:
              valueString(
                result.itinerary
                  .cruisingSpeedKnots
              ),
            fuelBurnLph:
              valueString(
                result.itinerary
                  .fuelBurnLph
              ),
            fuelPricePerLiter:
              valueString(
                result.itinerary
                  .fuelPricePerLiter
              ),
            fuelCurrency:
              result.itinerary
                .fuelCurrency,
            contingencyPercent:
              valueString(
                result.itinerary
                  .contingencyPercent
              ),
            status:
              result.itinerary
                .status,
            notes:
              result.itinerary
                .notes ??
              "",
          });
        }
      } catch (
        caughtError
      ) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load itinerary."
        );
      } finally {
        setLoading(false);
      }
    }, [charterId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createItinerary() {
    await post({
      action: "ensure",
    });
  }

  async function saveSettings() {
    if (!charterId) {
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setMessage(null);

      const response =
        await fetch(
          `/api/charters/${encodeURIComponent(
            charterId
          )}/itinerary`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify(
                settings
              ),
          }
        );

      const result =
        (await response.json()) as Data;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not save fuel assumptions."
        );
      }

      setMessage(
        "Fuel assumptions saved."
      );
      await load();
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save fuel assumptions."
      );
    } finally {
      setBusy(false);
    }
  }

  async function addLeg() {
    const result =
      await post({
        action:
          "add_leg",
        charterDate:
          blankToNull(
            legForm.charterDate
          ),
        fromName:
          legForm.fromName,
        toName:
          legForm.toName,
        distanceNm:
          blankToNull(
            legForm.distanceNm
          ),
        fromLat:
          blankToNull(
            legForm.fromLat
          ),
        fromLon:
          blankToNull(
            legForm.fromLon
          ),
        toLat:
          blankToNull(
            legForm.toLat
          ),
        toLon:
          blankToNull(
            legForm.toLon
          ),
        departureTime:
          blankToNull(
            legForm.departureTime
          ),
        arrivalTime:
          blankToNull(
            legForm.arrivalTime
          ),
        guestVisible:
          legForm.guestVisible,
        notes:
          blankToNull(
            legForm.notes
          ),
      });

    if (result) {
      setLegForm({
        charterDate: "",
        fromName: "",
        toName: "",
        distanceNm: "",
        fromLat: "",
        fromLon: "",
        toLat: "",
        toLon: "",
        departureTime: "",
        arrivalTime: "",
        guestVisible: true,
        notes: "",
      });
      setShowLegForm(false);
    }
  }

  async function post(
    body:
      Record<
        string,
        unknown
      >
  ) {
    if (!charterId) {
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
          )}/itinerary`,
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
        (await response.json()) as Data;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not update itinerary."
        );
      }

      setMessage(
        body.action ===
        "add_leg"
          ? "Route leg added."
          : "Itinerary created."
      );

      await load();

      return true;
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not update itinerary."
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteLeg(
    leg: Leg
  ) {
    if (
      !charterId ||
      !window.confirm(
        `Delete ${leg.fromName} - ${leg.toName}?`
      )
    ) {
      return;
    }

    try {
      setBusy(true);

      const response =
        await fetch(
          `/api/charters/${encodeURIComponent(
            charterId
          )}/itinerary/legs/${encodeURIComponent(
            leg.id
          )}`,
          {
            method:
              "DELETE",
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
            "Could not delete route leg."
        );
      }

      await load();
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not delete route leg."
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="ui-panel h-80 animate-pulse rounded-[30px]" />
      </main>
    );
  }

  if (
    !data?.charter
  ) {
    return (
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-red-500/25 bg-red-500/10 p-6 text-sm text-red-800 dark:text-red-200">
          {error ??
            "Charter not found."}
        </div>
      </main>
    );
  }

  const charter =
    data.charter;

  const itinerary =
    data.itinerary;

  const legs =
    data.legs ??
    [];

  const totals =
    data.totals ?? {
      legCount: 0,
      distanceNm: 0,
      hours: null,
      fuelLiters: null,
      baseFuelCost: null,
      fuelCostWithContingency:
        null,
      contingencyPercent: 0,
      currency:
        charter.currency,
    };

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-5">
        <section className="ui-hero rounded-[30px] p-6 sm:p-8">
          <p className="ui-hero-accent text-xs font-semibold uppercase tracking-[0.22em]">
            Itinerary & fuel intelligence
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
              href="/itineraries"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-[var(--hero-foreground)]"
            >
              All itineraries
            </Link>

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
              )}/experience`}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-[var(--hero-foreground)]"
            >
              Day-by-day
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

        {!itinerary ? (
          <section className="ui-panel rounded-[28px] p-6 text-center">
            <h2 className="font-heading text-3xl text-foreground">
              Start this charter route
            </h2>

            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Create an itinerary workspace, then add route legs and the yacht assumptions Yacht OS should use for time and fuel estimates.
            </p>

            <button
              type="button"
              onClick={() =>
                void createItinerary()
              }
              disabled={busy}
              className="ui-primary-button mt-5 inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {busy
                ? "Creating..."
                : "Create itinerary"}
            </button>
          </section>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Metric
                label="Route legs"
                value={String(
                  totals.legCount
                )}
              />
              <Metric
                label="Distance"
                value={`${totals.distanceNm} nm`}
              />
              <Metric
                label="Cruising time"
                value={
                  totals.hours !==
                  null
                    ? `${totals.hours} h`
                    : "Need speed"
                }
              />
              <Metric
                label="Fuel"
                value={
                  totals.fuelLiters !==
                  null
                    ? `${totals.fuelLiters.toLocaleString(
                        "en-GB"
                      )} L`
                    : "Need burn rate"
                }
              />
              <Metric
                label={`Fuel + ${totals.contingencyPercent}%`}
                value={
                  totals.fuelCostWithContingency !==
                  null
                    ? formatMoney(
                        totals.fuelCostWithContingency,
                        totals.currency
                      )
                    : "Need fuel price"
                }
              />
            </section>

            <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
              <div className="ui-panel rounded-[28px] p-5 sm:p-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Yacht assumptions
                </p>

                <h2 className="mt-2 font-heading text-2xl text-foreground">
                  Fuel model
                </h2>

                <div className="mt-5 grid gap-4">
                  <Field
                    label="Cruising speed - knots"
                    type="number"
                    value={
                      settings.cruisingSpeedKnots
                    }
                    onChange={(
                      value
                    ) =>
                      setSettings({
                        ...settings,
                        cruisingSpeedKnots:
                          value,
                      })
                    }
                  />

                  <Field
                    label="Fuel burn - liters/hour"
                    type="number"
                    value={
                      settings.fuelBurnLph
                    }
                    onChange={(
                      value
                    ) =>
                      setSettings({
                        ...settings,
                        fuelBurnLph:
                          value,
                      })
                    }
                  />

                  <Field
                    label="Fuel price - per liter"
                    type="number"
                    value={
                      settings.fuelPricePerLiter
                    }
                    onChange={(
                      value
                    ) =>
                      setSettings({
                        ...settings,
                        fuelPricePerLiter:
                          value,
                      })
                    }
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Currency"
                      value={
                        settings.fuelCurrency
                      }
                      onChange={(
                        value
                      ) =>
                        setSettings({
                          ...settings,
                          fuelCurrency:
                            value
                              .toUpperCase()
                              .slice(
                                0,
                                3
                              ),
                        })
                      }
                    />

                    <Field
                      label="Contingency %"
                      type="number"
                      value={
                        settings.contingencyPercent
                      }
                      onChange={(
                        value
                      ) =>
                        setSettings({
                          ...settings,
                          contingencyPercent:
                            value,
                        })
                      }
                    />
                  </div>

                  <label>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                      Status
                    </span>
                    <select
                      value={
                        settings.status
                      }
                      onChange={(
                        event
                      ) =>
                        setSettings({
                          ...settings,
                          status:
                            event.target
                              .value,
                        })
                      }
                      className="ui-input mt-2 w-full px-3.5 py-3 text-sm"
                    >
                      <option value="draft">
                        Draft
                      </option>
                      <option value="planning">
                        Planning
                      </option>
                      <option value="ready">
                        Ready
                      </option>
                      <option value="shared">
                        Shared
                      </option>
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      void saveSettings()
                    }
                    disabled={busy}
                    className="ui-primary-button min-h-11 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  >
                    Save assumptions
                  </button>
                </div>

                <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs leading-5 text-amber-900 dark:text-amber-200">
                  Estimates are operational planning values, not navigation instructions or supplier invoices. Use yacht-verified consumption and fuel pricing before client-facing use.
                </div>
              </div>

              <div className="ui-panel rounded-[28px] p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Charter route
                    </p>
                    <h2 className="mt-2 font-heading text-2xl text-foreground">
                      Route legs
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setShowLegForm(
                        (current) =>
                          !current
                      )
                    }
                    className="ui-primary-button min-h-10 px-4 py-2 text-sm font-semibold"
                  >
                    {showLegForm
                      ? "Close"
                      : "Add route leg"}
                  </button>
                </div>

                {showLegForm ? (
                  <div className="mt-5 rounded-2xl border border-border bg-background/35 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field
                        label="Charter date"
                        type="date"
                        value={
                          legForm.charterDate
                        }
                        onChange={(
                          value
                        ) =>
                          setLegForm({
                            ...legForm,
                            charterDate:
                              value,
                          })
                        }
                      />
                      <Field
                        label="Manual distance - nm"
                        type="number"
                        value={
                          legForm.distanceNm
                        }
                        onChange={(
                          value
                        ) =>
                          setLegForm({
                            ...legForm,
                            distanceNm:
                              value,
                          })
                        }
                      />
                      <Field
                        label="From"
                        value={
                          legForm.fromName
                        }
                        onChange={(
                          value
                        ) =>
                          setLegForm({
                            ...legForm,
                            fromName:
                              value,
                          })
                        }
                      />
                      <Field
                        label="To"
                        value={
                          legForm.toName
                        }
                        onChange={(
                          value
                        ) =>
                          setLegForm({
                            ...legForm,
                            toName:
                              value,
                          })
                        }
                      />
                      <Field
                        label="Departure"
                        type="time"
                        value={
                          legForm.departureTime
                        }
                        onChange={(
                          value
                        ) =>
                          setLegForm({
                            ...legForm,
                            departureTime:
                              value,
                          })
                        }
                      />
                      <Field
                        label="Arrival"
                        type="time"
                        value={
                          legForm.arrivalTime
                        }
                        onChange={(
                          value
                        ) =>
                          setLegForm({
                            ...legForm,
                            arrivalTime:
                              value,
                          })
                        }
                      />
                    </div>

                    <details className="mt-4 rounded-xl border border-border p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-foreground">
                        Calculate distance from coordinates
                      </summary>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Field
                          label="From latitude"
                          type="number"
                          value={
                            legForm.fromLat
                          }
                          onChange={(
                            value
                          ) =>
                            setLegForm({
                              ...legForm,
                              fromLat:
                                value,
                            })
                          }
                        />
                        <Field
                          label="From longitude"
                          type="number"
                          value={
                            legForm.fromLon
                          }
                          onChange={(
                            value
                          ) =>
                            setLegForm({
                              ...legForm,
                              fromLon:
                                value,
                            })
                          }
                        />
                        <Field
                          label="To latitude"
                          type="number"
                          value={
                            legForm.toLat
                          }
                          onChange={(
                            value
                          ) =>
                            setLegForm({
                              ...legForm,
                              toLat:
                                value,
                            })
                          }
                        />
                        <Field
                          label="To longitude"
                          type="number"
                          value={
                            legForm.toLon
                          }
                          onChange={(
                            value
                          ) =>
                            setLegForm({
                              ...legForm,
                              toLon:
                                value,
                            })
                          }
                        />
                      </div>
                    </details>

                    <label className="mt-4 flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                      <input
                        type="checkbox"
                        checked={
                          legForm.guestVisible
                        }
                        onChange={(
                          event
                        ) =>
                          setLegForm({
                            ...legForm,
                            guestVisible:
                              event.target
                                .checked,
                          })
                        }
                      />
                      <span className="text-sm text-foreground">
                        Guest-visible route leg
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        void addLeg()
                      }
                      disabled={busy}
                      className="ui-primary-button mt-4 min-h-11 px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                    >
                      Add leg
                    </button>
                  </div>
                ) : null}

                {legs.length > 0 ? (
                  <div className="mt-6 space-y-3">
                    {legs.map(
                      (leg) => (
                        <div
                          key={leg.id}
                          className="ui-panel-soft rounded-2xl p-4"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                                Leg {leg.position}
                                {leg.charterDate
                                  ? ` - ${leg.charterDate}`
                                  : ""}
                              </p>

                              <h3 className="mt-2 text-lg font-semibold text-foreground">
                                {leg.fromName} - {leg.toName}
                              </h3>

                              <p className="mt-1 text-xs text-muted-foreground">
                                {leg.distanceNm ??
                                  0}{" "}
                                nm - {formatLabel(
                                  leg.distanceSource
                                )}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                void deleteLeg(
                                  leg
                                )
                              }
                              className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-800 dark:text-red-200"
                            >
                              Delete
                            </button>
                          </div>

                          <div className="mt-4 grid gap-2 sm:grid-cols-4">
                            <Info
                              label="Time"
                              value={
                                leg.estimate.hours !==
                                null
                                  ? `${leg.estimate.hours} h`
                                  : "Need speed"
                              }
                            />
                            <Info
                              label="Fuel"
                              value={
                                leg.estimate.fuelLiters !==
                                null
                                  ? `${leg.estimate.fuelLiters} L`
                                  : "Need burn"
                              }
                            />
                            <Info
                              label="Fuel cost"
                              value={
                                leg.estimate.baseFuelCost !==
                                null
                                  ? formatMoney(
                                      leg.estimate.baseFuelCost,
                                      totals.currency
                                    )
                                  : "Need price"
                              }
                            />
                            <Info
                              label="Visibility"
                              value={
                                leg.guestVisible
                                  ? "Guest visible"
                                  : "Internal"
                              }
                            />
                          </div>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
                    No route legs yet.
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
    | "number"
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
        step={
          type === "number"
            ? "any"
            : undefined
        }
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

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/35 px-3 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm text-foreground">
        {value}
      </p>
    </div>
  );
}

function blankToNull(
  value: string
) {
  const cleaned =
    value.trim();

  return cleaned
    ? cleaned
    : null;
}

function valueString(
  value: number | null
) {
  return value === null
    ? ""
    : String(value);
}

function formatMoney(
  value: number,
  currency: string
) {
  try {
    return new Intl.NumberFormat(
      "en-GB",
      {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }
    ).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(
      "en-GB"
    )}`;
  }
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
  return `${start ?? "TBC"} - ${end ?? "TBC"}`;
}