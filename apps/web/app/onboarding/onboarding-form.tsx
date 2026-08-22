"use client";

import {
  Anchor,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Globe2,
  LoaderCircle,
  MapPinned,
  Ship,
  UserRound,
} from "lucide-react";
import { useActionState } from "react";

import {
  completeOnboarding,
  type OnboardingActionState,
} from "@/app/onboarding/actions";

const initialState: OnboardingActionState = {
  status: "idle",
  message: null,
};

type InitialValues = {
  fullName: string;
  roleTitle: string;
  companyName: string;
  operatingModel: string;
  primaryMarket: string;
  yachtAccessBand: string;
  websiteUrl: string;
};

export function OnboardingForm({
  nextPath,
  initialValues,
}: {
  nextPath: string;
  initialValues: InitialValues;
}) {
  const [state, formAction, isPending] =
    useActionState(
      completeOnboarding,
      initialState
    );

  return (
    <form
      action={formAction}
      className="space-y-7"
    >
      <input
        type="hidden"
        name="next"
        value={nextPath}
      />

      <section className="ui-panel rounded-[26px] p-5 sm:p-6">
        <StepHeader
          number="01"
          eyebrow="Your profile"
          title="Who is using Bahari OS?"
          description="These details identify you inside the brokerage workspace."
        />

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field
            id="fullName"
            name="fullName"
            label="Full name"
            defaultValue={
              initialValues.fullName
            }
            placeholder="Jane Morgan"
            autoComplete="name"
            icon={UserRound}
            error={
              state.fieldErrors?.fullName
            }
            disabled={isPending}
            required
          />

          <Field
            id="roleTitle"
            name="roleTitle"
            label="Professional role"
            defaultValue={
              initialValues.roleTitle
            }
            placeholder="Charter Broker"
            autoComplete="organization-title"
            icon={BriefcaseBusiness}
            error={
              state.fieldErrors?.roleTitle
            }
            disabled={isPending}
            required
          />
        </div>
      </section>

      <section className="ui-panel rounded-[26px] p-5 sm:p-6">
        <StepHeader
          number="02"
          eyebrow="Company"
          title="How does your business operate?"
          description="This selects the default Bahari OS workflow. It does not restrict the access type of individual yachts."
        />

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field
            id="companyName"
            name="companyName"
            label="Company name"
            defaultValue={
              initialValues.companyName
            }
            placeholder="Pacific Charter Group"
            autoComplete="organization"
            icon={Building2}
            error={
              state.fieldErrors?.companyName
            }
            disabled={isPending}
            required
          />

          <SelectField
            id="operatingModel"
            name="operatingModel"
            label="Primary operating model"
            defaultValue={
              initialValues.operatingModel
            }
            icon={Anchor}
            error={
              state.fieldErrors?.operatingModel
            }
            disabled={isPending}
            required
          >
            <option value="">
              Select company type
            </option>
            <option value="independent_brokerage">
              Independent Charter Brokerage
            </option>
            <option value="yacht_management">
              Yacht Management / Clearing House
            </option>
            <option value="controlled_fleet">
              Controlled Charter Fleet
            </option>
            <option value="mixed_operation">
              Mixed Operation
            </option>
          </SelectField>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-background/40 p-4 text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">
            Example:
          </span>{" "}
          an Independent Charter Brokerage can still have controlled,
          managed, broker-access and reference yachts. This setting only
          chooses its default operating view.
        </div>
      </section>

      <section className="ui-panel rounded-[26px] p-5 sm:p-6">
        <StepHeader
          number="03"
          eyebrow="Charter footprint"
          title="Tune the workspace"
          description="Give Bahari OS enough context to personalize the command deck and matching workflow."
        />

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field
            id="primaryMarket"
            name="primaryMarket"
            label="Primary charter market"
            defaultValue={
              initialValues.primaryMarket
            }
            placeholder="Mediterranean"
            autoComplete="off"
            icon={MapPinned}
            disabled={isPending}
          />

          <SelectField
            id="yachtAccessBand"
            name="yachtAccessBand"
            label="Approximate yacht access"
            defaultValue={
              initialValues.yachtAccessBand
            }
            icon={Ship}
            error={
              state.fieldErrors?.yachtAccessBand
            }
            disabled={isPending}
            required
          >
            <option value="">
              Select range
            </option>
            <option value="1_25">
              1–25 yachts
            </option>
            <option value="26_100">
              26–100 yachts
            </option>
            <option value="101_500">
              101–500 yachts
            </option>
            <option value="501_2000">
              501–2,000 yachts
            </option>
            <option value="2000_plus">
              2,000+ yachts
            </option>
          </SelectField>

          <div className="md:col-span-2">
            <Field
              id="websiteUrl"
              name="websiteUrl"
              label="Company website"
              defaultValue={
                initialValues.websiteUrl
              }
              placeholder="www.company.com"
              autoComplete="url"
              inputMode="url"
              icon={Globe2}
              error={
                state.fieldErrors?.websiteUrl
              }
              disabled={isPending}
            />
          </div>
        </div>
      </section>

      {state.status === "error" &&
      state.message ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-200"
        >
          {state.message}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="ui-primary-button apple-transition inline-flex min-h-12 items-center justify-center gap-2 px-6 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Creating workspace
            </>
          ) : (
            <>
              Enter Bahari OS
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function StepHeader({
  number,
  eyebrow,
  title,
  description,
}: {
  number: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-background/50 font-heading text-lg text-foreground">
        {number}
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>

        <h2 className="mt-1 font-heading text-2xl tracking-[0.04em] text-foreground sm:text-3xl">
          {title}
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function Field({
  id,
  name,
  label,
  defaultValue,
  placeholder,
  autoComplete,
  inputMode,
  required,
  disabled,
  error,
  icon: Icon,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  placeholder: string;
  autoComplete: string;
  inputMode?: "text" | "url";
  required?: boolean;
  disabled?: boolean;
  error?: string;
  icon: typeof UserRound;
}) {
  return (
    <label
      htmlFor={id}
      className="block"
    >
      <span className="text-xs font-semibold text-foreground">
        {label}
      </span>

      <div className="relative mt-2">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

        <input
          id={id}
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          required={required}
          disabled={disabled}
          className="ui-input h-12 w-full pl-10 pr-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      {error ? (
        <span className="mt-1.5 block text-xs text-red-600 dark:text-red-300">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function SelectField({
  id,
  name,
  label,
  defaultValue,
  children,
  required,
  disabled,
  error,
  icon: Icon,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  children: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  icon: typeof Anchor;
}) {
  return (
    <label
      htmlFor={id}
      className="block"
    >
      <span className="text-xs font-semibold text-foreground">
        {label}
      </span>

      <div className="relative mt-2">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />

        <select
          id={id}
          name={name}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          className="ui-input h-12 w-full appearance-none pl-10 pr-9 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {children}
        </select>
      </div>

      {error ? (
        <span className="mt-1.5 block text-xs text-red-600 dark:text-red-300">
          {error}
        </span>
      ) : null}
    </label>
  );
}