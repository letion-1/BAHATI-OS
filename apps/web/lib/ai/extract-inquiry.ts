import { getOpenAIClient } from "@/lib/ai/client";
import { buildInquiryExtractionInstructions } from "@/lib/ai/prompts/inquiry";
import {
  inquiryExtractionSchema,
  type ExtractedInquiry,
} from "@/lib/ai/schemas/inquiry";

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const MONTH_PATTERN = Object.keys(MONTHS)
  .sort((first, second) => second.length - first.length)
  .join("|");

export async function extractInquiry(
  inquiryText: string
): Promise<ExtractedInquiry> {
  const cleanedText = inquiryText.trim();

  if (cleanedText.length < 20) {
    throw new Error("Please provide a fuller inquiry message.");
  }

  const client = getOpenAIClient();

  /*
   * Captured once and used for both the instructions and the user turn.
   *
   * Relative dates are the majority of how clients write about timing, and
   * none of them can be resolved without this. Reading it here rather than
   * inside the prompt builder also keeps the function testable: a fixed date
   * in, a deterministic prompt out.
   */
  const today = new Date();

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-5",
    store: false,
    instructions: buildInquiryExtractionInstructions(today),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Extract this yacht charter inquiry.",
              `Today is ${today.toISOString().slice(0, 10)}.`,
              "Resolve shared month and year context inside date ranges.",
              "Resolve relative months, approximate periods and durations into concrete dates.",
              "",
              cleanedText,
            ].join("\n"),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "yacht_charter_inquiry",
        description:
          "Structured information extracted from a yacht charter inquiry.",
        strict: true,
        schema: inquiryExtractionSchema,
      },
    },
  });

  if (!response.output_text) {
    throw new Error("The AI returned no extractable result.");
  }

  let extracted: ExtractedInquiry;

  try {
    extracted = JSON.parse(
      response.output_text
    ) as ExtractedInquiry;
  } catch {
    throw new Error("The AI returned invalid structured data.");
  }

  return normalizeExtractedInquiry(
    extracted,
    cleanedText,
    today
  );
}

function normalizeExtractedInquiry(
  extracted: ExtractedInquiry,
  originalText: string,
  today: Date
): ExtractedInquiry {
  const repairedDates = inferSharedDateRange(
    originalText,
    extracted.start_date,
    extracted.end_date
  );

  const normalized: ExtractedInquiry = {
    ...extracted,
    client_name: normalizePersonName(
      extracted.client_name
    ),
    client_type:
      cleanText(extracted.client_type) ??
      "New charter client",
    email: cleanText(extracted.email),
    phone: cleanText(extracted.phone),
    destination: cleanText(
      extracted.destination
    ),
    start_date: repairedDates.startDate,
    end_date: repairedDates.endDate,
    guests: resolveGuestCount(extracted),
    guests_min: normalizePositiveInteger(
      extracted.guests_min
    ),
    budget_min: normalizeNonNegativeNumber(
      extracted.budget_min
    ),
    budget_max: normalizeNonNegativeNumber(
      extracted.budget_max
    ),
    currency: normalizeCurrency(
      extracted.currency,
      originalText
    ),
    preferences: normalizePreferences(
      extracted.preferences
    ),
    source:
      cleanText(extracted.source) ??
      "AI import",
    dates_are_approximate:
      extracted.dates_are_approximate === true,
    extraction_confidence: 0,
    missing_information: [],
    suggested_question: null,
  };

  if (
    normalized.budget_min !== null &&
    normalized.budget_max === null
  ) {
    normalized.budget_max =
      normalized.budget_min;
  }

  if (
    normalized.budget_max !== null &&
    normalized.budget_min === null
  ) {
    normalized.budget_min =
      normalized.budget_max;
  }

  if (
    normalized.budget_min !== null &&
    normalized.budget_max !== null &&
    normalized.budget_min >
      normalized.budget_max
  ) {
    [
      normalized.budget_min,
      normalized.budget_max,
    ] = [
      normalized.budget_max,
      normalized.budget_min,
    ];
  }

  /*
   * A charter cannot start in the past.
   *
   * The model is told this, but a returned date is still worth checking:
   * "next July" resolved to this year is the single most likely mistake, and
   * a start date behind today would be matched against availability that has
   * already been sold. Dropping it back to null puts the date in front of
   * the broker as a question instead of as a wrong answer.
   */
  if (
    normalized.start_date &&
    normalized.start_date < formatDateKey(today)
  ) {
    normalized.start_date = null;
    normalized.end_date = null;
    normalized.dates_are_approximate = false;
  }

  /*
   * The guest range is kept where the broker will actually see it. The form
   * has one guests field, so "8 to 10 guests" would otherwise be lost between
   * extraction and the saved inquiry, and the flexibility is worth quoting
   * against: a 10-berth yacht and an 8-berth yacht are different proposals.
   */
  if (
    normalized.guests_min !== null &&
    normalized.guests !== null &&
    normalized.guests_min < normalized.guests
  ) {
    normalized.preferences = appendPreference(
      normalized.preferences,
      `party of ${normalized.guests_min} to ${normalized.guests}`
    );
  }

  normalized.missing_information =
    calculateMissingInformation(
      normalized
    );

  normalized.suggested_question =
    buildSuggestedQuestion(
      normalized
    );

  normalized.extraction_confidence =
    calculateConfidence(
      normalized,
      repairedDates.repaired
    );

  return normalized;
}

/**
 * The upper bound wins.
 *
 * "Around 8 of us, possibly 10" is a capacity statement before it is a
 * headcount: a yacht that sleeps 8 is not an option if 10 might arrive. The
 * model is instructed to put the upper bound in `guests`, and this covers the
 * case where it puts the bounds the other way round anyway.
 */
function resolveGuestCount(
  extracted: ExtractedInquiry
): number | null {
  const guests = normalizePositiveInteger(
    extracted.guests
  );

  const guestsMin = normalizePositiveInteger(
    extracted.guests_min
  );

  if (guests === null) {
    return guestsMin;
  }

  if (guestsMin === null) {
    return guests;
  }

  return Math.max(guests, guestsMin);
}

/** Comma-separated, matching how preferences are written everywhere else. */
function appendPreference(
  preferences: string | null,
  addition: string
): string {
  if (!preferences) {
    return addition;
  }

  if (preferences.toLowerCase().includes(addition.toLowerCase())) {
    return preferences;
  }

  return `${preferences}, ${addition}`;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function inferSharedDateRange(
  text: string,
  currentStartDate: string | null,
  currentEndDate: string | null
): {
  startDate: string | null;
  endDate: string | null;
  repaired: boolean;
} {
  const existingStart =
    normalizeIsoDate(currentStartDate);

  const existingEnd =
    normalizeIsoDate(currentEndDate);

  if (existingStart && existingEnd) {
    return {
      startDate: existingStart,
      endDate: existingEnd,
      repaired: false,
    };
  }

  const normalizedText = text
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(
      /(\d{1,2})(st|nd|rd|th)\b/g,
      "$1"
    )
    .replace(/\s+/g, " ")
    .trim();

  const fullRangePattern = new RegExp(
    `\\b(\\d{1,2})\\s+(?:of\\s+)?(${MONTH_PATTERN})(?:\\s+(20\\d{2}))?\\s*(?:-|to|until|till|through|thru)\\s*(\\d{1,2})\\s+(?:of\\s+)?(${MONTH_PATTERN})(?:\\s+(20\\d{2}))?\\b`,
    "i"
  );

  const sharedMonthPattern = new RegExp(
    `\\b(\\d{1,2})\\s*(?:-|to|until|till|through|thru)\\s*(\\d{1,2})\\s+(?:of\\s+)?(${MONTH_PATTERN})\\s+(20\\d{2})\\b`,
    "i"
  );

  const fullRangeMatch =
    fullRangePattern.exec(
      normalizedText
    );

  if (fullRangeMatch) {
    const startDay =
      Number(fullRangeMatch[1]);

    const startMonth =
      MONTHS[
        fullRangeMatch[2].toLowerCase()
      ];

    const startYearText =
      fullRangeMatch[3];

    const endDay =
      Number(fullRangeMatch[4]);

    const endMonth =
      MONTHS[
        fullRangeMatch[5].toLowerCase()
      ];

    const endYearText =
      fullRangeMatch[6];

    const sharedYear =
      Number(
        endYearText ??
          startYearText
      );

    if (
      startMonth &&
      endMonth &&
      Number.isInteger(sharedYear)
    ) {
      const inferredStart =
        toIsoDate(
          sharedYear,
          startMonth,
          startDay
        );

      const inferredEnd =
        toIsoDate(
          sharedYear,
          endMonth,
          endDay
        );

      return {
        startDate:
          existingStart ??
          inferredStart,
        endDate:
          existingEnd ??
          inferredEnd,
        repaired:
          (!existingStart &&
            Boolean(inferredStart)) ||
          (!existingEnd &&
            Boolean(inferredEnd)),
      };
    }
  }

  const sharedMonthMatch =
    sharedMonthPattern.exec(
      normalizedText
    );

  if (sharedMonthMatch) {
    const startDay =
      Number(sharedMonthMatch[1]);

    const endDay =
      Number(sharedMonthMatch[2]);

    const month =
      MONTHS[
        sharedMonthMatch[3].toLowerCase()
      ];

    const year =
      Number(sharedMonthMatch[4]);

    if (month) {
      const inferredStart =
        toIsoDate(
          year,
          month,
          startDay
        );

      const inferredEnd =
        toIsoDate(
          year,
          month,
          endDay
        );

      return {
        startDate:
          existingStart ??
          inferredStart,
        endDate:
          existingEnd ??
          inferredEnd,
        repaired:
          (!existingStart &&
            Boolean(inferredStart)) ||
          (!existingEnd &&
            Boolean(inferredEnd)),
      };
    }
  }

  return {
    startDate: existingStart,
    endDate: existingEnd,
    repaired: false,
  };
}

function calculateMissingInformation(
  inquiry: ExtractedInquiry
): string[] {
  const missing: string[] = [];

  if (!inquiry.destination) {
    missing.push("destination");
  }

  if (!inquiry.start_date) {
    missing.push("start date");
  }

  if (!inquiry.end_date) {
    missing.push("end date");
  }

  if (!inquiry.guests) {
    missing.push("guest count");
  }

  if (
    inquiry.budget_min === null &&
    inquiry.budget_max === null
  ) {
    missing.push("budget and currency");
  }

  if (!inquiry.email && !inquiry.phone) {
    missing.push("contact details");
  }

  return missing;
}

function buildSuggestedQuestion(
  inquiry: ExtractedInquiry
): string | null {
  if (!inquiry.destination) {
    return "Which destination or cruising area would you like to charter in?";
  }

  if (!inquiry.start_date || !inquiry.end_date) {
    return "What exact charter dates would you prefer?";
  }

  /*
   * Asked even though the dates are filled in. They were inferred from a
   * phrase like "roughly the second week of July", so they are a reading of
   * the message rather than something the client committed to, and a week is
   * the one detail worth confirming before availability is held against it.
   */
  if (inquiry.dates_are_approximate) {
    return "We have pencilled in these dates from your message. Can you confirm the exact week you would like?";
  }

  if (!inquiry.guests) {
    return "How many guests will be joining the charter?";
  }

  if (
    inquiry.budget_min === null &&
    inquiry.budget_max === null
  ) {
    return "What is your approximate weekly charter budget and preferred currency?";
  }

  if (!inquiry.email && !inquiry.phone) {
    return "What is the best email address or phone number for follow-up?";
  }

  return null;
}

function calculateConfidence(
  inquiry: ExtractedInquiry,
  repairedDateRange: boolean
): number {
  let score = 35;

  if (inquiry.client_name) score += 10;
  if (inquiry.destination) score += 15;
  if (inquiry.start_date) score += 10;
  if (inquiry.end_date) score += 10;
  if (inquiry.guests) score += 8;
  if (
    inquiry.budget_min !== null ||
    inquiry.budget_max !== null
  ) {
    score += 7;
  }
  if (inquiry.preferences) score += 3;
  if (inquiry.email || inquiry.phone) score += 2;

  if (repairedDateRange) {
    score -= 2;
  }

  // An inferred week is genuinely less certain than a stated one, and the
  // confidence badge is what tells the broker how hard to look at the form.
  if (inquiry.dates_are_approximate) {
    score -= 10;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(score)
    )
  );
}

function normalizePersonName(
  value: string | null
): string | null {
  const cleaned =
    cleanText(value);

  if (!cleaned) {
    return null;
  }

  return cleaned
    .split(/\s+/)
    .map((word) =>
      word
        .split("-")
        .map(
          (part) =>
            part.charAt(0).toUpperCase() +
            part.slice(1).toLowerCase()
        )
        .join("-")
    )
    .join(" ");
}

function normalizePreferences(
  value: string | null
): string | null {
  const cleaned =
    cleanText(value);

  if (!cleaned) {
    return null;
  }

  const items = cleaned
    .split(/[,;\n]+/)
    .map((item) =>
      item.trim()
    )
    .filter(Boolean);

  return [
    ...new Set(items),
  ].join(", ");
}

function normalizeCurrency(
  value: string | null,
  originalText: string
): string | null {
  const cleaned =
    cleanText(value)
      ?.toUpperCase();

  if (
    cleaned &&
    /^[A-Z]{3}$/.test(
      cleaned
    )
  ) {
    return cleaned;
  }

  if (/€|\bEUR\b/i.test(originalText)) {
    return "EUR";
  }

  if (/£|\bGBP\b/i.test(originalText)) {
    return "GBP";
  }

  if (/\$|\bUSD\b/i.test(originalText)) {
    return "USD";
  }

  return null;
}

function normalizePositiveInteger(
  value: number | null
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  return Math.round(value);
}

function normalizeNonNegativeNumber(
  value: number | null
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return null;
  }

  return value;
}

function normalizeIsoDate(
  value: string | null
): string | null {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value
    )
  ) {
    return null;
  }

  const date =
    new Date(
      `${value}T00:00:00.000Z`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return value;
}

function toIsoDate(
  year: number,
  month: number,
  day: number
): string | null {
  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date
    .toISOString()
    .slice(0, 10);
}

function cleanText(
  value: string | null
): string | null {
  if (!value) {
    return null;
  }

  const cleaned =
    value
      .replace(/\s+/g, " ")
      .trim();

  return cleaned || null;
}