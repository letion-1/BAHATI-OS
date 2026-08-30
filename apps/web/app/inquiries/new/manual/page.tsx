"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  Loader2,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  Save,
  Ship,
  Users,
} from "lucide-react";

import { PageContainer } from "@/components/ui/page-container";
import { SectionHeader } from "@/components/ui/section-header";

import { createInquiry } from "../actions";
import { initialCreateInquiryState } from "../form-state";

const inputClassName = "ui-input mt-2 px-3.5 py-3 text-sm";

const textareaClassName =
  "ui-input mt-2 min-h-36 resize-y px-3.5 py-3 text-sm leading-6";

const labelClassName =
  "block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

function Panel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`ui-panel rounded-[22px] p-6 sm:p-7 ${className ?? ""}`}>
      <div className="mb-6">
        <h2 className="font-heading text-lg leading-snug text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      {children}
    </section>
  );
}

function Field({
  label,
  icon,
  required,
  invalid,
  className,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  required?: boolean;
  invalid?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`} data-invalid={invalid}>
      <span className={`${labelClassName} flex items-center gap-2`}>
        {icon}
        {label}
        {required ? (
          <span aria-hidden className="text-destructive">
            *
          </span>
        ) : null}
      </span>

      {children}
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="ui-primary-button apple-transition inline-flex min-h-12 items-center justify-center gap-2 px-6 py-3 text-sm font-semibold hover:-translate-y-0.5 hover:opacity-90 disabled:pointer-events-none disabled:opacity-60"
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Saving inquiry
        </>
      ) : (
        <>
          <Save className="size-4" />
          Create inquiry
        </>
      )}
    </button>
  );
}

export default function NewInquiryPage() {
  const [state, formAction] = useActionState(
    createInquiry,
    initialCreateInquiryState
  );

  const invalid = (field: string) => state.field === field;

  return (
    <PageContainer contentClassName="max-w-5xl space-y-7">
      <div>
        <Link
          href="/inquiries"
          className="apple-transition inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to inquiries
        </Link>

        <SectionHeader
          className="mt-5"
          eyebrow="Charter pipeline"
          title="New inquiry"
          subtitle="Add a charter request by hand. The record is saved to your workspace and opened for matching straight away."
        />
      </div>

      {state.error ? (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/10 px-5 py-4 text-sm leading-6 text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{state.error}</p>
        </div>
      ) : null}

      <form action={formAction} className="space-y-6">
        <Panel
          title="Client details"
          description="Who the request came from."
        >
          <div className="grid gap-5 [&>*]:min-w-0 md:grid-cols-2">
            <Field label="Client name" required invalid={invalid("client_name")}>
              <input
                name="client_name"
                required
                autoFocus
                aria-invalid={invalid("client_name")}
                placeholder="Emma Richardson"
                className={inputClassName}
              />
            </Field>

            <Field label="Client type">
              <select
                name="client_type"
                defaultValue="New charter client"
                className={inputClassName}
              >
                <option>New charter client</option>
                <option>Returning charter client</option>
                <option>Corporate charter client</option>
              </select>
            </Field>

            <Field label="Email" icon={<Mail className="size-3.5" />}>
              <input
                name="email"
                type="email"
                placeholder="client@example.com"
                className={inputClassName}
              />
            </Field>

            <Field label="Phone" icon={<Phone className="size-3.5" />}>
              <input
                name="phone"
                type="tel"
                placeholder="+44 20 0000 0000"
                className={inputClassName}
              />
            </Field>
          </div>
        </Panel>

        <Panel
          title="Charter requirements"
          description="Anything left blank can be filled in later from the inquiry workspace."
        >
          <div className="grid gap-5 [&>*]:min-w-0 md:grid-cols-2">
            <Field label="Destination" icon={<MapPin className="size-3.5" />}>
              <input
                name="destination"
                placeholder="Croatia"
                className={inputClassName}
              />
            </Field>

            <Field label="Guests" icon={<Users className="size-3.5" />}>
              <input
                name="guests"
                type="number"
                min="1"
                placeholder="8"
                className={inputClassName}
              />
            </Field>

            <Field
              label="Start date"
              icon={<CalendarDays className="size-3.5" />}
            >
              <input
                name="start_date"
                type="date"
                className={inputClassName}
              />
            </Field>

            <Field
              label="End date"
              icon={<CalendarDays className="size-3.5" />}
              invalid={invalid("end_date")}
            >
              <input
                name="end_date"
                type="date"
                aria-invalid={invalid("end_date")}
                className={inputClassName}
              />
            </Field>

            <Field
              label="Minimum budget"
              icon={<CircleDollarSign className="size-3.5" />}
            >
              <input
                name="budget_min"
                type="number"
                min="0"
                step="1000"
                placeholder="60000"
                className={inputClassName}
              />
            </Field>

            <Field
              label="Maximum budget"
              icon={<CircleDollarSign className="size-3.5" />}
              invalid={invalid("budget_max")}
            >
              <input
                name="budget_max"
                type="number"
                min="0"
                step="1000"
                placeholder="80000"
                aria-invalid={invalid("budget_max")}
                className={inputClassName}
              />
            </Field>

            <Field label="Currency">
              <select
                name="currency"
                defaultValue="EUR"
                className={inputClassName}
              >
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
              </select>
            </Field>

            <Field label="Source">
              <select
                name="source"
                defaultValue="Manual entry"
                className={inputClassName}
              >
                <option>Manual entry</option>
                <option>Website form</option>
                <option>Email</option>
                <option>CRM</option>
                <option>WhatsApp</option>
              </select>
            </Field>

            <Field
              label="Preferences"
              icon={<Ship className="size-3.5" />}
              className="md:col-span-2"
            >
              <input
                name="preferences"
                placeholder="Jacuzzi, jet ski, modern interior, family space"
                className={inputClassName}
              />
            </Field>
          </div>
        </Panel>

        <Panel
          title="Original request"
          description="Keep the client's own words. Matching and proposals read from this."
        >
          <Field
            label="Inquiry message"
            icon={<MessageSquareText className="size-3.5" />}
            required
            invalid={invalid("original_inquiry")}
          >
            <textarea
              name="original_inquiry"
              required
              aria-invalid={invalid("original_inquiry")}
              placeholder="Paste the client's original email or message here."
              className={textareaClassName}
            />
          </Field>
        </Panel>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/inquiries"
            className="ui-secondary-button apple-transition inline-flex min-h-12 items-center justify-center px-6 py-3 text-sm font-semibold hover:bg-muted"
          >
            Cancel
          </Link>

          <SubmitButton />
        </div>
      </form>
    </PageContainer>
  );
}
