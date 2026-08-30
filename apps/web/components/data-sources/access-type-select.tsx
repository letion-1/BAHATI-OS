"use client";

/**
 * The access classification dropdown, shared by the data source Manage view
 * and the yacht list.
 *
 * The labels are the point. `broker_access` and `reference_only` mean nothing
 * to a broker reading a screen at speed, and a wrong guess here decides
 * whether a hull can be offered to a client. So each option says what the
 * brokerage's relationship to the yacht actually is, and the description says
 * what follows from it.
 *
 * "Not classified" is a real option rather than an empty state. A broker who
 * does not know should be able to say so and move on, and the consequence —
 * these yachts stay out of client proposals — should be stated rather than
 * discovered later when a proposal refuses them.
 */

export type AccessType =
  | "controlled"
  | "managed"
  | "broker_access"
  | "reference";

export const ACCESS_OPTIONS: {
  value: AccessType | "";
  label: string;
  description: string;
}[] = [
  {
    value: "controlled",
    label: "Controlled",
    description: "Our own fleet. We hold the calendar.",
  },
  {
    value: "managed",
    label: "Managed",
    description: "We manage it for the owner.",
  },
  {
    value: "broker_access",
    label: "Broker access",
    description: "A partner's yacht we can offer but do not control.",
  },
  {
    value: "reference",
    label: "Reference",
    description: "Market awareness only. Never goes to a client.",
  },
  {
    value: "",
    label: "Not classified",
    description:
      "Kept out of client proposals until someone decides.",
  },
];

export function accessLabel(value: string | null | undefined): string {
  const match = ACCESS_OPTIONS.find(
    (option) => option.value === (value ?? "")
  );

  return match?.label ?? "Not classified";
}

/** Amber for unclassified, because it is a state that needs attention. */
export function accessTone(value: string | null | undefined): string {
  if (!value) {
    return "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }

  if (value === "reference") {
    return "border-border bg-muted/40 text-muted-foreground";
  }

  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

export function AccessTypeSelect({
  value,
  onChange,
  disabled,
  id,
}: {
  value: AccessType | "" | null;
  onChange: (value: AccessType | "") => void;
  disabled?: boolean;
  id?: string;
}) {
  const current = value ?? "";

  const description =
    ACCESS_OPTIONS.find((option) => option.value === current)?.description ??
    "";

  return (
    <div className="min-w-0">
      <select
        id={id}
        value={current}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value as AccessType | "")
        }
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground disabled:opacity-60"
      >
        {ACCESS_OPTIONS.map((option) => (
          <option key={option.value || "none"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {/*
        Shown under the field rather than inside the option text. Native
        select options cannot be styled or wrapped, so a long description
        inside one is truncated on exactly the narrow screens where it would
        matter most.
      */}
      {description ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}