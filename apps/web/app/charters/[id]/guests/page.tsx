"use client";

import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";

type CharterGuest = {
  id: string;
  charterId: string;
  fullName: string;
  guestRole: string;
  isPrimary: boolean;

  email: string | null;
  phone: string | null;

  nationality: string | null;
  dateOfBirth: string | null;

  passportStatus: string;
  passportCountry: string | null;
  passportExpiry: string | null;

  dietaryRequirements: string | null;
  allergies: string | null;
  accessibilityNotes: string | null;

  arrivalAirport: string | null;
  arrivalFlight: string | null;
  arrivalAt: string | null;
  arrivalTransferNotes: string | null;

  departureAirport: string | null;
  departureFlight: string | null;
  departureAt: string | null;
  departureTransferNotes: string | null;

  cabinPreference: string | null;
  bedPreference: string | null;

  notes: string | null;

  profileStatus: string;
  sortOrder: number;
  completenessPercent: number;

  createdAt: string;
  updatedAt: string;
};

type GuestSummary = {
  expectedGuests: number | null;
  actualGuests: number;
  remainingProfiles: number | null;

  completeGuests: number;
  inProgressGuests: number;
  incompleteGuests: number;

  averageCompleteness: number;
  manifestReady: boolean;
};

type GuestListResponse = {
  success: boolean;

  charter?: {
    id: string;
    reference: string;
    clientName: string;
    yachtName: string;
    expectedGuests: number | null;
  };

  summary?: GuestSummary;

  guests?: CharterGuest[];

  error?: string;
};

type GuestMutationResponse = {
  success: boolean;

  guest?: CharterGuest;

  deleted?: boolean;
  guestId?: string;

  error?: string;
};

type GuestRole =
  | "primary_charterer"
  | "guest"
  | "child"
  | "staff"
  | "other";

type PassportStatus =
  | "not_requested"
  | "requested"
  | "received"
  | "verified"
  | "expired"
  | "not_required";

type GuestForm = {
  fullName: string;

  guestRole: GuestRole;

  isPrimary: boolean;

  email: string;
  phone: string;

  nationality: string;
  dateOfBirth: string;

  passportStatus: PassportStatus;
  passportCountry: string;
  passportExpiry: string;

  dietaryRequirements: string;
  allergies: string;
  accessibilityNotes: string;

  arrivalAirport: string;
  arrivalFlight: string;
  arrivalAt: string;
  arrivalTransferNotes: string;

  departureAirport: string;
  departureFlight: string;
  departureAt: string;
  departureTransferNotes: string;

  cabinPreference: string;
  bedPreference: string;

  notes: string;

  sortOrder: string;
};

const emptyGuestForm: GuestForm = {
  fullName: "",

  guestRole: "guest",

  isPrimary: false,

  email: "",
  phone: "",

  nationality: "",
  dateOfBirth: "",

  passportStatus: "not_requested",
  passportCountry: "",
  passportExpiry: "",

  dietaryRequirements: "",
  allergies: "",
  accessibilityNotes: "",

  arrivalAirport: "",
  arrivalFlight: "",
  arrivalAt: "",
  arrivalTransferNotes: "",

  departureAirport: "",
  departureFlight: "",
  departureAt: "",
  departureTransferNotes: "",

  cabinPreference: "",
  bedPreference: "",

  notes: "",

  sortOrder: "",
};

export default function CharterGuestsPage() {
  const params = useParams();

  const charterId = useMemo(() => {
    const value = params?.id;

    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      return value[0] ?? "";
    }

    return "";
  }, [params]);

  const [data, setData] =
    useState<GuestListResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState<string | null>(null);

  const [showEditor, setShowEditor] =
    useState(false);

  const [editingGuestId, setEditingGuestId] =
    useState<string | null>(null);

  const [form, setForm] =
    useState<GuestForm>(emptyGuestForm);

  const [saving, setSaving] =
    useState(false);

  const [deletingGuestId, setDeletingGuestId] =
    useState<string | null>(null);

  const loadGuests =
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
            )}/guests`,
            {
              method: "GET",
              cache: "no-store",
            }
          );

        const result =
          (await response.json()) as GuestListResponse;

        if (
          !response.ok ||
          !result.success ||
          !result.charter ||
          !result.summary
        ) {
          throw new Error(
            result.error ??
              "Could not load Guest Intelligence."
          );
        }

        setData(result);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Could not load Guest Intelligence."
        );
      } finally {
        setLoading(false);
      }
    }, [charterId]);

  useEffect(() => {
    void loadGuests();
  }, [loadGuests]);

  function startNewGuest() {
    setEditingGuestId(null);

    setForm({
      ...emptyGuestForm,

      sortOrder: String(
        data?.guests?.length ?? 0
      ),
    });

    setError(null);
    setMessage(null);
    setShowEditor(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function startEditing(
    guest: CharterGuest
  ) {
    setEditingGuestId(
      guest.id
    );

    setForm(
      formFromGuest(
        guest
      )
    );

    setError(null);
    setMessage(null);
    setShowEditor(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function closeEditor() {
    if (saving) {
      return;
    }

    setShowEditor(false);
    setEditingGuestId(null);
    setForm(emptyGuestForm);
  }

  async function saveGuest() {
    if (
      !charterId ||
      saving
    ) {
      return;
    }

    if (!form.fullName.trim()) {
      setError(
        "Guest name is required."
      );

      return;
    }

    try {
      setSaving(true);

      setError(null);
      setMessage(null);

      const payload:
        Record<string, unknown> = {
          fullName:
            form.fullName,

          guestRole:
            form.guestRole,

          isPrimary:
            form.isPrimary,

          email:
            blankToNull(
              form.email
            ),

          phone:
            blankToNull(
              form.phone
            ),

          nationality:
            blankToNull(
              form.nationality
            ),

          dateOfBirth:
            blankToNull(
              form.dateOfBirth
            ),

          passportStatus:
            form.passportStatus,

          passportCountry:
            blankToNull(
              form.passportCountry
            ),

          passportExpiry:
            blankToNull(
              form.passportExpiry
            ),

          dietaryRequirements:
            blankToNull(
              form.dietaryRequirements
            ),

          allergies:
            blankToNull(
              form.allergies
            ),

          accessibilityNotes:
            blankToNull(
              form.accessibilityNotes
            ),

          arrivalAirport:
            blankToNull(
              form.arrivalAirport
            ),

          arrivalFlight:
            blankToNull(
              form.arrivalFlight
            ),

          arrivalAt:
            localDateTimeToIso(
              form.arrivalAt
            ),

          arrivalTransferNotes:
            blankToNull(
              form.arrivalTransferNotes
            ),

          departureAirport:
            blankToNull(
              form.departureAirport
            ),

          departureFlight:
            blankToNull(
              form.departureFlight
            ),

          departureAt:
            localDateTimeToIso(
              form.departureAt
            ),

          departureTransferNotes:
            blankToNull(
              form.departureTransferNotes
            ),

          cabinPreference:
            blankToNull(
              form.cabinPreference
            ),

          bedPreference:
            blankToNull(
              form.bedPreference
            ),

          notes:
            blankToNull(
              form.notes
            ),
        };

      if (
        form.sortOrder.trim()
      ) {
        payload.sortOrder =
          Number(
            form.sortOrder
          );
      }

      const isEditing =
        Boolean(
          editingGuestId
        );

      const url =
        isEditing
          ? `/api/charters/${encodeURIComponent(
              charterId
            )}/guests/${encodeURIComponent(
              editingGuestId!
            )}`
          : `/api/charters/${encodeURIComponent(
              charterId
            )}/guests`;

      const response =
        await fetch(
          url,
          {
            method:
              isEditing
                ? "PATCH"
                : "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                payload
              ),
          }
        );

      const result =
        (await response.json()) as GuestMutationResponse;

      if (
        !response.ok ||
        !result.success ||
        !result.guest
      ) {
        throw new Error(
          result.error ??
            "Could not save guest."
        );
      }

      await loadGuests();

      setMessage(
        isEditing
          ? `${result.guest.fullName} updated.`
          : `${result.guest.fullName} added to the charter.`
      );

      setShowEditor(false);
      setEditingGuestId(null);
      setForm(emptyGuestForm);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save guest."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteGuest(
    guest: CharterGuest
  ) {
    if (
      !charterId ||
      deletingGuestId
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Remove ${guest.fullName} from this charter?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingGuestId(
        guest.id
      );

      setError(null);
      setMessage(null);

      const response =
        await fetch(
          `/api/charters/${encodeURIComponent(
            charterId
          )}/guests/${encodeURIComponent(
            guest.id
          )}`,
          {
            method: "DELETE",
          }
        );

      const result =
        (await response.json()) as GuestMutationResponse;

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.error ??
            "Could not remove guest."
        );
      }

      await loadGuests();

      setMessage(
        `${guest.fullName} removed from the charter.`
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not remove guest."
      );
    } finally {
      setDeletingGuestId(
        null
      );
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="ui-panel h-80 animate-pulse rounded-[28px]" />
      </main>
    );
  }

  if (
    !data?.charter ||
    !data.summary
  ) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-red-500/25 bg-red-500/10 p-6 text-sm text-red-800 dark:text-red-200">
          {error ??
            "Guest Intelligence could not be loaded."}
        </div>
      </main>
    );
  }

  const charter =
    data.charter;

  const summary =
    data.summary;

  const guests =
    data.guests ?? [];

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-5">
        <section className="ui-panel overflow-hidden rounded-[28px]">
          <div className="p-5 sm:p-7">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                    Guest Intelligence
                  </p>

                  <ReadinessBadge
                    ready={
                      summary.manifestReady
                    }
                  />
                </div>

                <h1 className="mt-3 font-heading text-3xl tracking-[0.04em] text-foreground sm:text-4xl">
                  {charter.yachtName}
                </h1>

                <p className="mt-2 text-sm text-muted-foreground">
                  {charter.reference}
                </p>

                <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Manage the people,
                  travel details,
                  onboard requirements
                  and manifest readiness
                  for this charter.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/charters/${encodeURIComponent(
                    charter.id
                  )}`}
                  className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:bg-accent"
                >
                  Back to charter
                </Link>

                <Link
                  href={`/charters/${encodeURIComponent(
                    charter.id
                  )}/guest-portal`}
                  className="ui-secondary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold hover:bg-accent"
                >
                  Guest Portal
                </Link>

                <button
                  type="button"
                  onClick={
                    startNewGuest
                  }
                  className="ui-primary-button apple-transition inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold"
                >
                  Add guest
                </button>
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

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Expected"
            value={
              summary.expectedGuests !==
              null
                ? String(
                    summary.expectedGuests
                  )
                : "Not set"
            }
          />

          <Metric
            label="Profiles"
            value={String(
              summary.actualGuests
            )}
          />

          <Metric
            label="Complete"
            value={`${summary.completeGuests}/${summary.actualGuests}`}
          />

          <Metric
            label="Average readiness"
            value={`${summary.averageCompleteness}%`}
          />

          <Metric
            label="Manifest"
            value={
              summary.manifestReady
                ? "Ready"
                : "Not ready"
            }
          />
        </section>

        {showEditor ? (
          <section className="ui-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
                  {editingGuestId
                    ? "Edit guest"
                    : "New guest"}
                </p>

                <h2 className="mt-2 font-heading text-2xl text-foreground">
                  {editingGuestId
                    ? "Guest profile"
                    : "Add to charter"}
                </h2>
              </div>

              <button
                type="button"
                onClick={
                  closeEditor
                }
                className="ui-secondary-button inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm font-semibold"
              >
                Close
              </button>
            </div>

            <EditorSection
              title="Identity"
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field
                  label="Full name"
                  value={
                    form.fullName
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      fullName:
                        value,
                    })
                  }
                />

                <SelectField
                  label="Guest role"
                  value={
                    form.guestRole
                  }
                  options={[
                    {
                      value:
                        "primary_charterer",
                      label:
                        "Primary charterer",
                    },
                    {
                      value:
                        "guest",
                      label:
                        "Guest",
                    },
                    {
                      value:
                        "child",
                      label:
                        "Child",
                    },
                    {
                      value:
                        "staff",
                      label:
                        "Staff",
                    },
                    {
                      value:
                        "other",
                      label:
                        "Other",
                    },
                  ]}
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      guestRole:
                        value as GuestRole,
                    })
                  }
                />

                <Field
                  label="Nationality"
                  value={
                    form.nationality
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      nationality:
                        value,
                    })
                  }
                />

                <Field
                  label="Date of birth"
                  type="date"
                  value={
                    form.dateOfBirth
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      dateOfBirth:
                        value,
                    })
                  }
                />

                <Field
                  label="Email"
                  type="email"
                  value={
                    form.email
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      email:
                        value,
                    })
                  }
                />

                <Field
                  label="Phone"
                  value={
                    form.phone
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      phone:
                        value,
                    })
                  }
                />

                <Field
                  label="Manifest order"
                  type="number"
                  value={
                    form.sortOrder
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      sortOrder:
                        value,
                    })
                  }
                />

                <label className="flex min-h-[76px] items-center gap-3 rounded-xl border border-border bg-background/40 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={
                      form.isPrimary
                    }
                    onChange={(
                      event
                    ) =>
                      setForm({
                        ...form,
                        isPrimary:
                          event
                            .target
                            .checked,
                      })
                    }
                    className="h-4 w-4"
                  />

                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Primary guest
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Main guest for
                      this charter.
                    </p>
                  </div>
                </label>
              </div>
            </EditorSection>

            <EditorSection
              title="Passport readiness"
            >
              <div className="grid gap-4 md:grid-cols-3">
                <SelectField
                  label="Passport status"
                  value={
                    form.passportStatus
                  }
                  options={[
                    {
                      value:
                        "not_requested",
                      label:
                        "Not requested",
                    },
                    {
                      value:
                        "requested",
                      label:
                        "Requested",
                    },
                    {
                      value:
                        "received",
                      label:
                        "Received",
                    },
                    {
                      value:
                        "verified",
                      label:
                        "Verified",
                    },
                    {
                      value:
                        "expired",
                      label:
                        "Expired",
                    },
                    {
                      value:
                        "not_required",
                      label:
                        "Not required",
                    },
                  ]}
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      passportStatus:
                        value as PassportStatus,
                    })
                  }
                />

                <Field
                  label="Passport country"
                  value={
                    form.passportCountry
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      passportCountry:
                        value,
                    })
                  }
                />

                <Field
                  label="Passport expiry"
                  type="date"
                  value={
                    form.passportExpiry
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      passportExpiry:
                        value,
                    })
                  }
                />
              </div>

              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Passport numbers and
                passport files are not
                stored inside this
                general guest profile.
              </p>
            </EditorSection>

            <EditorSection
              title="Arrival"
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field
                  label="Airport"
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
                  label="Flight"
                  value={
                    form.arrivalFlight
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      arrivalFlight:
                        value,
                    })
                  }
                />

                <Field
                  label="Arrival time"
                  type="datetime-local"
                  value={
                    form.arrivalAt
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      arrivalAt:
                        value,
                    })
                  }
                />
              </div>

              <TextArea
                label="Arrival / transfer notes"
                value={
                  form.arrivalTransferNotes
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    arrivalTransferNotes:
                      value,
                  })
                }
              />
            </EditorSection>

            <EditorSection
              title="Departure"
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field
                  label="Airport"
                  value={
                    form.departureAirport
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      departureAirport:
                        value,
                    })
                  }
                />

                <Field
                  label="Flight"
                  value={
                    form.departureFlight
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      departureFlight:
                        value,
                    })
                  }
                />

                <Field
                  label="Departure time"
                  type="datetime-local"
                  value={
                    form.departureAt
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      departureAt:
                        value,
                    })
                  }
                />
              </div>

              <TextArea
                label="Departure / transfer notes"
                value={
                  form.departureTransferNotes
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    departureTransferNotes:
                      value,
                  })
                }
              />
            </EditorSection>

            <EditorSection
              title="Onboard requirements"
            >
              <div className="grid gap-4 md:grid-cols-2">
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
                  label="Accessibility"
                  value={
                    form.accessibilityNotes
                  }
                  onChange={(
                    value
                  ) =>
                    setForm({
                      ...form,
                      accessibilityNotes:
                        value,
                    })
                  }
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Cabin preference"
                    value={
                      form.cabinPreference
                    }
                    onChange={(
                      value
                    ) =>
                      setForm({
                        ...form,
                        cabinPreference:
                          value,
                      })
                    }
                  />

                  <Field
                    label="Bed preference"
                    value={
                      form.bedPreference
                    }
                    onChange={(
                      value
                    ) =>
                      setForm({
                        ...form,
                        bedPreference:
                          value,
                      })
                    }
                  />
                </div>
              </div>

              <TextArea
                label="Broker notes"
                value={
                  form.notes
                }
                onChange={(
                  value
                ) =>
                  setForm({
                    ...form,
                    notes:
                      value,
                  })
                }
              />
            </EditorSection>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={
                  closeEditor
                }
                disabled={
                  saving
                }
                className="ui-secondary-button inline-flex min-h-11 items-center justify-center px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() =>
                  void saveGuest()
                }
                disabled={
                  saving
                }
                className="ui-primary-button inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {saving
                  ? "Saving..."
                  : editingGuestId
                    ? "Save guest"
                    : "Add guest"}
              </button>
            </div>
          </section>
        ) : null}

        <section className="ui-panel rounded-[28px] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Manifest
              </p>

              <h2 className="mt-2 font-heading text-2xl text-foreground">
                Guest profiles
              </h2>

              <p className="mt-2 text-sm text-muted-foreground">
                {summary.expectedGuests !==
                null
                  ? `${summary.actualGuests} of ${summary.expectedGuests} expected guests have profiles.`
                  : `${summary.actualGuests} guest profiles recorded.`}
              </p>
            </div>

            {summary.remainingProfiles !==
              null &&
            summary.remainingProfiles >
              0 ? (
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {
                  summary.remainingProfiles
                }{" "}
                profile
                {summary.remainingProfiles ===
                1
                  ? ""
                  : "s"}{" "}
                still missing
              </p>
            ) : null}
          </div>

          {guests.length > 0 ? (
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {guests.map(
                (guest) => (
                  <GuestCard
                    key={
                      guest.id
                    }
                    guest={
                      guest
                    }
                    deleting={
                      deletingGuestId ===
                      guest.id
                    }
                    onEdit={() =>
                      startEditing(
                        guest
                      )
                    }
                    onDelete={() =>
                      void deleteGuest(
                        guest
                      )
                    }
                  />
                )
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-background/35 px-5 py-12 text-center">
              <p className="text-base font-semibold text-foreground">
                No guest profiles yet.
              </p>

              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Add the primary
                charterer and the
                remaining guests to
                begin building the
                operational manifest.
              </p>

              <button
                type="button"
                onClick={
                  startNewGuest
                }
                className="ui-primary-button mt-5 inline-flex min-h-11 items-center justify-center px-5 py-2.5 text-sm font-semibold"
              >
                Add first guest
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function GuestCard({
  guest,
  deleting,
  onEdit,
  onDelete,
}: {
  guest: CharterGuest;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="ui-panel-soft rounded-[24px] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">
              {guest.fullName}
            </h3>

            {guest.isPrimary ? (
              <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-cyan-800 dark:text-cyan-200">
                Primary
              </span>
            ) : null}

            <ProfileBadge
              value={
                guest.profileStatus
              }
            />
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {formatLabel(
              guest.guestRole
            )}
            {guest.nationality
              ? ` · ${guest.nationality}`
              : ""}
          </p>
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <p className="text-2xl font-semibold text-foreground">
            {guest.completenessPercent}%
          </p>

          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
            complete
          </p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-cyan-500 transition-all"
          style={{
            width: `${Math.max(
              0,
              Math.min(
                guest.completenessPercent,
                100
              )
            )}%`,
          }}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <GuestFact
          label="Passport"
          value={formatLabel(
            guest.passportStatus
          )}
        />

        <GuestFact
          label="Cabin"
          value={
            guest.cabinPreference ??
            "Not set"
          }
        />

        <GuestFact
          label="Arrival"
          value={
            guest.arrivalFlight ||
            formatDateTime(
              guest.arrivalAt
            )
          }
        />

        <GuestFact
          label="Departure"
          value={
            guest.departureFlight ||
            formatDateTime(
              guest.departureAt
            )
          }
        />
      </div>

      {guest.dietaryRequirements ||
      guest.allergies ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-amber-800 dark:text-amber-200">
            Food / allergy notes
          </p>

          <p className="mt-1 text-xs leading-5 text-foreground">
            {[
              guest.dietaryRequirements,
              guest.allergies,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={
            onEdit
          }
          className="ui-secondary-button inline-flex min-h-10 items-center justify-center px-4 py-2 text-xs font-semibold"
        >
          Edit profile
        </button>

        <button
          type="button"
          onClick={
            onDelete
          }
          disabled={
            deleting
          }
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-800 disabled:opacity-60 dark:text-red-200"
        >
          {deleting
            ? "Removing..."
            : "Remove"}
        </button>
      </div>
    </article>
  );
}

function EditorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-6 border-t border-border pt-6">
      <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>

      {children}
    </div>
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
    | "datetime-local"
    | "email";
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </span>

      <input
        type={type}
        value={value}
        min={
          type ===
          "number"
            ? "0"
            : undefined
        }
        step={
          type ===
          "number"
            ? "1"
            : undefined
        }
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

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;

  options: Array<{
    value: string;
    label: string;
  }>;

  onChange: (
    value: string
  ) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </span>

      <select
        value={
          value
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        className="ui-input mt-2 w-full px-3.5 py-3 text-sm"
      >
        {options.map(
          (option) => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {option.label}
            </option>
          )
        )}
      </select>
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;

  onChange: (
    value: string
  ) => void;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </span>

      <textarea
        rows={3}
        value={
          value
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
    <div className="ui-panel rounded-2xl px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-2 text-lg font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function GuestFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/35 px-3 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 truncate text-xs font-semibold text-foreground">
        {value}
      </p>
    </div>
  );
}

function ProfileBadge({
  value,
}: {
  value: string;
}) {
  const className =
    value === "complete"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
      : value === "in_progress"
        ? "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200"
        : "border-border bg-background/60 text-muted-foreground";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] ${className}`}
    >
      {formatLabel(
        value
      )}
    </span>
  );
}

function ReadinessBadge({
  ready,
}: {
  ready: boolean;
}) {
  return (
    <span
      className={
        ready
          ? "rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-emerald-800 dark:text-emerald-200"
          : "rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-amber-900 dark:text-amber-200"
      }
    >
      {ready
        ? "Manifest ready"
        : "Manifest pending"}
    </span>
  );
}

function formFromGuest(
  guest: CharterGuest
): GuestForm {
  return {
    fullName:
      guest.fullName,

    guestRole:
      guest.guestRole as GuestRole,

    isPrimary:
      guest.isPrimary,

    email:
      guest.email ?? "",

    phone:
      guest.phone ?? "",

    nationality:
      guest.nationality ??
      "",

    dateOfBirth:
      guest.dateOfBirth ??
      "",

    passportStatus:
      guest.passportStatus as PassportStatus,

    passportCountry:
      guest.passportCountry ??
      "",

    passportExpiry:
      guest.passportExpiry ??
      "",

    dietaryRequirements:
      guest.dietaryRequirements ??
      "",

    allergies:
      guest.allergies ??
      "",

    accessibilityNotes:
      guest.accessibilityNotes ??
      "",

    arrivalAirport:
      guest.arrivalAirport ??
      "",

    arrivalFlight:
      guest.arrivalFlight ??
      "",

    arrivalAt:
      isoToLocalInput(
        guest.arrivalAt
      ),

    arrivalTransferNotes:
      guest.arrivalTransferNotes ??
      "",

    departureAirport:
      guest.departureAirport ??
      "",

    departureFlight:
      guest.departureFlight ??
      "",

    departureAt:
      isoToLocalInput(
        guest.departureAt
      ),

    departureTransferNotes:
      guest.departureTransferNotes ??
      "",

    cabinPreference:
      guest.cabinPreference ??
      "",

    bedPreference:
      guest.bedPreference ??
      "",

    notes:
      guest.notes ?? "",

    sortOrder:
      String(
        guest.sortOrder
      ),
  };
}

function isoToLocalInput(
  value: string | null
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const offset =
    date.getTimezoneOffset();

  const local =
    new Date(
      date.getTime() -
        offset *
          60 *
          1000
    );

  return local
    .toISOString()
    .slice(
      0,
      16
    );
}

function localDateTimeToIso(
  value: string
): string | null {
  const cleaned =
    value.trim();

  if (!cleaned) {
    return null;
  }

  const date =
    new Date(
      cleaned
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date.toISOString();
}

function blankToNull(
  value: string
) {
  const cleaned =
    value.trim();

  return cleaned.length >
    0
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

function formatDateTime(
  value: string | null
) {
  if (!value) {
    return "Not set";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Not set";
  }

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