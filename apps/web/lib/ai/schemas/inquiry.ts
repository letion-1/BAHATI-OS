export type ExtractedInquiry = {
  client_name: string | null;
  client_type: string | null;
  email: string | null;
  phone: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  /**
   * Lower bound when the client hedged ("around 8, possibly 10"). `guests`
   * carries the upper bound, because that is what the yacht must sleep.
   */
  guests_min: number | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  preferences: string | null;
  source: string | null;
  /**
   * True when the dates were derived from a relative or approximate phrase
   * rather than stated. The broker has to know the difference before quoting
   * a week back to the client as though they had asked for it.
   */
  dates_are_approximate: boolean;
  extraction_confidence: number;
  missing_information: string[];
  suggested_question: string | null;
};

export const inquiryExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    client_name: { type: ["string", "null"] },
    client_type: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    destination: { type: ["string", "null"] },
    start_date: {
      type: ["string", "null"],
      description: "Date in YYYY-MM-DD format.",
    },
    end_date: {
      type: ["string", "null"],
      description: "Date in YYYY-MM-DD format.",
    },
    guests: {
      type: ["integer", "null"],
      description:
        "The largest party size the yacht must sleep. For a hedged range, the upper bound.",
    },
    guests_min: {
      type: ["integer", "null"],
      description: "The lower bound of a hedged guest range, otherwise null.",
    },
    budget_min: { type: ["number", "null"] },
    budget_max: { type: ["number", "null"] },
    currency: {
      type: ["string", "null"],
      description: "ISO currency code, for example EUR, GBP, or USD.",
    },
    preferences: { type: ["string", "null"] },
    source: { type: ["string", "null"] },
    dates_are_approximate: {
      type: "boolean",
      description:
        "True when dates were inferred from a relative or approximate phrase rather than stated exactly.",
    },
    extraction_confidence: {
      type: "number",
      minimum: 0,
      maximum: 100,
    },
    missing_information: {
      type: "array",
      items: { type: "string" },
    },
    suggested_question: { type: ["string", "null"] },
  },
  required: [
    "client_name",
    "client_type",
    "email",
    "phone",
    "destination",
    "start_date",
    "end_date",
    "guests",
    "guests_min",
    "budget_min",
    "budget_max",
    "currency",
    "preferences",
    "source",
    "dates_are_approximate",
    "extraction_confidence",
    "missing_information",
    "suggested_question",
  ],
} as const;