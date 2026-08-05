export type ExtractedInquiry = {
  client_name: string | null;
  client_type: string | null;
  email: string | null;
  phone: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  guests: number | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  preferences: string | null;
  source: string | null;
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
    guests: { type: ["integer", "null"] },
    budget_min: { type: ["number", "null"] },
    budget_max: { type: ["number", "null"] },
    currency: {
      type: ["string", "null"],
      description: "ISO currency code, for example EUR, GBP, or USD.",
    },
    preferences: { type: ["string", "null"] },
    source: { type: ["string", "null"] },
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
    "budget_min",
    "budget_max",
    "currency",
    "preferences",
    "source",
    "extraction_confidence",
    "missing_information",
    "suggested_question",
  ],
} as const;
