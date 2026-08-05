import type {
  AdaptiveExtraction,
  PageSignals,
  RenderedCalendarCell,
  RenderedCalendarLegend,
} from "./types";

import {
  validateAdaptiveExtraction,
} from "./validator";

type ExtendedRenderedCalendarCell =
  RenderedCalendarCell & {
    backgroundImage?: string | null;
    beforeBackground?: string | null;
    afterBackground?: string | null;
  };

type ExtendedRenderedCalendarLegend =
  RenderedCalendarLegend & {
    backgroundImage?: string | null;
    beforeBackground?: string | null;
    afterBackground?: string | null;
  };

const OPENAI_RESPONSES_URL =
  "https://api.openai.com/v1/responses";

/*
 * These limits prevent rendered websites from overflowing
 * the model context window.
 */
const MAX_VISIBLE_TEXT_LENGTH =
  12_000;

const MAX_CALENDAR_TEXT_LENGTH =
  28_000;

const MAX_HTML_EXCERPT_LENGTH =
  8_000;

const MAX_CALENDAR_CELLS =
  900;

const MAX_RENDERED_LEGENDS =
  40;

const MAX_COLOR_LEGENDS =
  40;

const MAX_MONTH_HEADINGS =
  36;

const MAX_JSON_LD_ITEMS =
  6;

const MAX_EMBEDDED_JSON_ITEMS =
  8;

const MAX_NETWORK_PAYLOADS =
  8;

const MAX_NETWORK_PAYLOAD_LENGTH =
  10_000;

const MAX_LINKS =
  40;

type OpenAIResponse = {
  output_text?: string;

  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;

  error?: {
    message?: string;
  };
};

type CompactPageSignals = {
  url: string;

  title: string | null;

  description: string | null;

  visibleText: string;

  calendarText: string;

  htmlExcerpt: string;

  monthHeadings: string[];

  colorLegend: Array<{
    label: string;
    color: string | null;
  }>;

  renderedLegends: ExtendedRenderedCalendarLegend[];

  calendarCells: ExtendedRenderedCalendarCell[];

  jsonLd: unknown[];

  embeddedJson: unknown[];

  networkPayloads: unknown[];

  links: string[];

  renderedSnapshots: Array<{
    name: string;
    calendarText: string;
    monthHeadings: string[];
    cellCount: number;
  }>;

  compression: {
    originalCalendarCellCount: number;
    includedCalendarCellCount: number;
    originalNetworkPayloadCount: number;
    includedNetworkPayloadCount: number;
  };
};

export async function extractAvailabilityWithAI(
  signals: PageSignals
): Promise<AdaptiveExtraction> {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "This website requires adaptive AI extraction, but OPENAI_API_KEY is not configured."
    );
  }

  const model =
    process.env.OPENAI_SOURCE_MODEL?.trim() ||
    "gpt-5-mini";

  const compactSignals =
    compactPageSignals(
      signals
    );

  console.info(
    "Adaptive website extraction signals:",
    {
      url:
        compactSignals.url,
      calendarCells:
        compactSignals.calendarCells.length,
      monthHeadings:
        compactSignals.monthHeadings.length,
      renderedLegends:
        compactSignals.renderedLegends.length,
      networkPayloads:
        compactSignals.networkPayloads.length,
      visualCells:
        compactSignals.calendarCells.filter(
          (cell) =>
            Boolean(
              cell.backgroundColor ||
              cell.backgroundImage ||
              cell.beforeBackground ||
              cell.afterBackground
            )
        ).length,
    }
  );

  const requestBody = {
    model,

    store: false,

    /*
     * We compact the source ourselves rather than asking the API
     * to discard arbitrary beginning sections of the request.
     */
    truncation: "disabled",

    input: [
      {
        role: "developer",

        content: [
          {
            type: "input_text",

            text:
              buildDeveloperPrompt(),
          },
        ],
      },

      {
        role: "user",

        content: [
          {
            type: "input_text",

            text:
              JSON.stringify({
                task:
                  "Extract normalized yacht charter availability from these compact rendered website signals.",

                page:
                  compactSignals,
              }),
          },
        ],
      },
    ],

    text: {
      format: {
        type: "json_schema",

        name:
          "yacht_source_extraction",

        strict:
          true,

        schema:
          extractionSchema,
      },
    },
  };

  const response =
    await fetch(
      OPENAI_RESPONSES_URL,
      {
        method: "POST",

        cache: "no-store",

        headers: {
          Authorization:
            `Bearer ${apiKey}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(
            requestBody
          ),
      }
    );

  const payload =
    (
      await response.json()
    ) as OpenAIResponse;

  if (!response.ok) {
    const message =
      payload.error?.message ??
      `Adaptive AI extraction failed with status ${response.status}.`;

    throw new Error(
      message
    );
  }

  const outputText =
    readOutputText(
      payload
    );

  if (!outputText) {
    throw new Error(
      "Adaptive AI extraction returned no structured output."
    );
  }

  let parsed:
    AdaptiveExtraction;

  try {
    parsed =
      JSON.parse(
        outputText
      ) as AdaptiveExtraction;
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : "Unknown JSON parsing error.";

    throw new Error(
      `Adaptive AI extraction returned invalid JSON: ${detail}`
    );
  }

  console.info(
    "Adaptive website extraction result:",
    {
      title:
        parsed.title,
      yachts:
        parsed.yachts?.length ?? 0,
      availability:
        parsed.availability?.length ?? 0,
      warnings:
        parsed.warnings ?? [],
    }
  );

  return validateAdaptiveExtraction(
    parsed
  );
}

function compactPageSignals(
  signals: PageSignals
): CompactPageSignals {
  const calendarCells =
    selectCalendarCells(
      signals.calendarCells
    );

  const networkPayloads =
    compactUnknownValues(
      signals.networkPayloads,
      MAX_NETWORK_PAYLOADS,
      MAX_NETWORK_PAYLOAD_LENGTH
    );

  const embeddedJson =
    compactUnknownValues(
      signals.embeddedJson,
      MAX_EMBEDDED_JSON_ITEMS,
      MAX_NETWORK_PAYLOAD_LENGTH
    );

  const jsonLd =
    compactUnknownValues(
      signals.jsonLd,
      MAX_JSON_LD_ITEMS,
      6_000
    );

  return {
    url:
      signals.url,

    title:
      signals.title,

    description:
      truncateText(
        signals.description,
        2_000
      ),

    visibleText:
      truncateText(
        signals.visibleText,
        MAX_VISIBLE_TEXT_LENGTH
      ) ?? "",

    calendarText:
      truncateText(
        signals.calendarText,
        MAX_CALENDAR_TEXT_LENGTH
      ) ?? "",

    htmlExcerpt:
      truncateText(
        signals.htmlExcerpt,
        MAX_HTML_EXCERPT_LENGTH
      ) ?? "",

    monthHeadings:
      deduplicateStrings(
        signals.monthHeadings
      ).slice(
        0,
        MAX_MONTH_HEADINGS
      ),

    colorLegend:
      deduplicateColorLegends(
        signals.colorLegend
      ).slice(
        0,
        MAX_COLOR_LEGENDS
      ),

    renderedLegends:
      deduplicateRenderedLegends(
        signals.renderedLegends
      ).slice(
        0,
        MAX_RENDERED_LEGENDS
      ),

    calendarCells,

    jsonLd,

    embeddedJson,

    networkPayloads,

    links:
      deduplicateStrings(
        signals.links
      ).slice(
        0,
        MAX_LINKS
      ),

    renderedSnapshots:
      signals.renderedSnapshots
        .slice(
          0,
          6
        )
        .map(
          (
            snapshot
          ) => ({
            name:
              snapshot.name,

            calendarText:
              truncateText(
                snapshot.calendarText,
                4_000
              ) ?? "",

            monthHeadings:
              deduplicateStrings(
                snapshot.monthHeadings
              ).slice(
                0,
                24
              ),

            cellCount:
              snapshot.cellCount,
          })
        ),

    compression: {
      originalCalendarCellCount:
        signals.calendarCells.length,

      includedCalendarCellCount:
        calendarCells.length,

      originalNetworkPayloadCount:
        signals.networkPayloads.length,

      includedNetworkPayloadCount:
        networkPayloads.length,
    },
  };
}

function selectCalendarCells(
  cells: RenderedCalendarCell[]
): ExtendedRenderedCalendarCell[] {
  const deduplicated =
    deduplicateCalendarCells(
      cells
    );

  const scored =
    deduplicated.map(
      (
        cell,
        index
      ) => ({
        cell,
        index,
        score:
          scoreCalendarCell(
            cell
          ),
      })
    );

  /*
   * Keep the strongest cells first, but maintain original DOM order
   * in the final payload so the model can reconstruct the calendar.
   */
  const selectedIndexes =
    new Set(
      scored
        .sort(
          (
            first,
            second
          ) =>
            second.score -
              first.score ||
            first.index -
              second.index
        )
        .slice(
          0,
          MAX_CALENDAR_CELLS
        )
        .map(
          (
            entry
          ) =>
            entry.index
        )
    );

  return scored
    .filter(
      (
        entry
      ) =>
        selectedIndexes.has(
          entry.index
        )
    )
    .sort(
      (
        first,
        second
      ) =>
        first.index -
        second.index
    )
    .map(
      (
        entry
      ) =>
        sanitizeCalendarCell(
          entry.cell
        )
    );
}

function scoreCalendarCell(
  cell: ExtendedRenderedCalendarCell
): number {
  let score =
    0;

  const combined = [
    cell.text,
    cell.date,
    cell.ariaLabel,
    cell.title,
    cell.className,
    cell.parentText,
    cell.parentClassName,
    cell.monthContext,
    ...Object.keys(
      cell.data
    ),
    ...Object.values(
      cell.data
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (cell.date) {
    score +=
      100;
  }

  if (
    cell.monthContext
  ) {
    score +=
      45;
  }

  if (
    cell.ariaLabel ||
    cell.title
  ) {
    score +=
      30;
  }

  if (
    cell.backgroundColor &&
    !isNeutralBackground(
      cell.backgroundColor
    )
  ) {
    score +=
      50;
  }

  if (
    hasMeaningfulVisualBackground(
      cell.backgroundImage
    ) ||
    hasMeaningfulVisualBackground(
      cell.beforeBackground
    ) ||
    hasMeaningfulVisualBackground(
      cell.afterBackground
    )
  ) {
    score +=
      75;
  }

  if (
    Object.keys(
      cell.data
    ).length >
    0
  ) {
    score +=
      35;
  }

  if (
    /\b(booked|booking|hold|reserved|option|transit|unavailable|available|blocked|maintenance|service)\b/i.test(
      combined
    )
  ) {
    score +=
      80;
  }

  if (
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/i.test(
      combined
    )
  ) {
    score +=
      60;
  }

  if (
    /^\d{1,2}$/.test(
      cell.text.trim()
    )
  ) {
    score +=
      20;
  }

  if (
    cell.parentText &&
    cell.parentText.length <
      250
  ) {
    score +=
      10;
  }

  return score;
}

function sanitizeCalendarCell(
  cell: ExtendedRenderedCalendarCell
): ExtendedRenderedCalendarCell {
  return {
    text:
      truncateText(
        cell.text,
        80
      ) ?? "",

    date:
      cell.date,

    ariaLabel:
      truncateText(
        cell.ariaLabel,
        140
      ),

    title:
      truncateText(
        cell.title,
        140
      ),

    tagName:
      cell.tagName,

    className:
      truncateText(
        cell.className,
        200
      ) ?? "",

    id:
      truncateText(
        cell.id,
        100
      ),

    backgroundColor:
      cell.backgroundColor,

    backgroundImage:
      truncateText(
        (cell as ExtendedRenderedCalendarCell).backgroundImage,
        500
      ),

    beforeBackground:
      truncateText(
        (cell as ExtendedRenderedCalendarCell).beforeBackground,
        500
      ),

    afterBackground:
      truncateText(
        (cell as ExtendedRenderedCalendarCell).afterBackground,
        500
      ),

    color:
      cell.color,

    parentText:
      truncateText(
        cell.parentText,
        180
      ),

    parentClassName:
      truncateText(
        cell.parentClassName,
        160
      ),

    monthContext:
      truncateText(
        cell.monthContext,
        120
      ),

    data:
      Object.fromEntries(
        Object.entries(
          cell.data
        )
          .slice(
            0,
            12
          )
          .map(
            (
              [
                key,
                value,
              ]
            ) => [
              key.slice(
                0,
                80
              ),

              value.slice(
                0,
                160
              ),
            ]
          )
      ),
  };
}

function deduplicateCalendarCells(
  cells: RenderedCalendarCell[]
): ExtendedRenderedCalendarCell[] {
  const results =
    new Map<
      string,
      ExtendedRenderedCalendarCell
    >();

  for (
    const rawCell
    of cells
  ) {
    const cell =
      rawCell as ExtendedRenderedCalendarCell;

    const key = [
      cell.date ??
        "",
      cell.ariaLabel ??
        "",
      cell.title ??
        "",
      cell.text,
      cell.backgroundColor ??
        "",
      cell.backgroundImage ??
        "",
      cell.beforeBackground ??
        "",
      cell.afterBackground ??
        "",
      cell.monthContext ??
        "",
      cell.className,
    ].join(
      "::"
    );

    if (
      !results.has(
        key
      )
    ) {
      results.set(
        key,
        cell
      );
    }
  }

  return Array.from(
    results.values()
  );
}

function compactUnknownValues(
  values: unknown[],
  maximumItems: number,
  maximumLength: number
): unknown[] {
  const results:
    unknown[] =
      [];

  const seen =
    new Set<string>();

  for (
    const value
    of values
  ) {
    if (
      results.length >=
      maximumItems
    ) {
      break;
    }

    const compact =
      compactUnknownValue(
        value,
        maximumLength
      );

    if (
      compact ===
      null
    ) {
      continue;
    }

    let serialized:
      string;

    try {
      serialized =
        JSON.stringify(
          compact
        );
    } catch {
      continue;
    }

    if (
      seen.has(
        serialized
      )
    ) {
      continue;
    }

    seen.add(
      serialized
    );

    results.push(
      compact
    );
  }

  return results;
}

function compactUnknownValue(
  value: unknown,
  maximumLength: number
): unknown | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value ===
    "string"
  ) {
    return truncateText(
      value,
      maximumLength
    );
  }

  try {
    const serialized =
      JSON.stringify(
        value
      );

    if (
      serialized.length <=
      maximumLength
    ) {
      return value;
    }

    return {
      truncated:
        true,

      preview:
        serialized.slice(
          0,
          maximumLength
        ),
    };
  } catch {
    return null;
  }
}

function deduplicateStrings(
  values: string[]
): string[] {
  const results =
    new Set<string>();

  for (
    const value
    of values
  ) {
    const normalized =
      value.trim();

    if (normalized) {
      results.add(
        normalized
      );
    }
  }

  return Array.from(
    results
  );
}

function deduplicateColorLegends(
  legends:
    Array<{
      label: string;
      color: string | null;
    }>
): Array<{
  label: string;
  color: string | null;
}> {
  const results =
    new Map<
      string,
      {
        label: string;
        color: string | null;
      }
    >();

  for (
    const legend
    of legends
  ) {
    const label =
      legend.label.trim();

    if (!label) {
      continue;
    }

    const key =
      `${label.toLowerCase()}:${legend.color ?? "none"}`;

    if (
      !results.has(
        key
      )
    ) {
      results.set(
        key,
        {
          label:
            truncateText(
              label,
              100
            ) ?? label,

          color:
            legend.color,
        }
      );
    }
  }

  return Array.from(
    results.values()
  );
}

function deduplicateRenderedLegends(
  legends: RenderedCalendarLegend[]
): ExtendedRenderedCalendarLegend[] {
  const results =
    new Map<
      string,
      ExtendedRenderedCalendarLegend
    >();

  for (
    const legend
    of legends
  ) {
    const label =
      legend.label.trim();

    if (!label) {
      continue;
    }

    const key = [
      label.toLowerCase(),
      legend.backgroundColor ??
        "",
      (legend as ExtendedRenderedCalendarLegend).backgroundImage ??
        "",
      (legend as ExtendedRenderedCalendarLegend).beforeBackground ??
        "",
      (legend as ExtendedRenderedCalendarLegend).afterBackground ??
        "",
      legend.color ??
        "",
      legend.className ??
        "",
    ].join(
      "::"
    );

    if (
      !results.has(
        key
      )
    ) {
      results.set(
        key,
        {
          label:
            truncateText(
              label,
              100
            ) ?? label,

          backgroundColor:
            legend.backgroundColor,

          backgroundImage:
            truncateText(
              (legend as ExtendedRenderedCalendarLegend).backgroundImage,
              500
            ),

          beforeBackground:
            truncateText(
              (legend as ExtendedRenderedCalendarLegend).beforeBackground,
              500
            ),

          afterBackground:
            truncateText(
              (legend as ExtendedRenderedCalendarLegend).afterBackground,
              500
            ),

          color:
            legend.color,

          className:
            truncateText(
              legend.className,
              180
            ),
        }
      );
    }
  }

  return Array.from(
    results.values()
  );
}

function truncateText(
  value:
    string |
    null |
    undefined,
  maximumLength: number
): string | null {
  if (!value) {
    return null;
  }

  const normalized =
    value
      .replace(
        /\u00a0/g,
        " "
      )
      .replace(
        /[ \t]+/g,
        " "
      )
      .replace(
        /\n\s*\n+/g,
        "\n"
      )
      .trim();

  if (!normalized) {
    return null;
  }

  if (
    normalized.length <=
    maximumLength
  ) {
    return normalized;
  }

  return `${normalized.slice(
    0,
    maximumLength
  )}\n[TRUNCATED]`;
}

function hasMeaningfulVisualBackground(
  value:
    string |
    null |
    undefined
): boolean {
  if (!value) {
    return false;
  }

  const normalized =
    value
      .replace(/\s+/g, "")
      .toLowerCase();

  return (
    normalized !== "none" &&
    normalized !== "transparent" &&
    normalized !== "rgba(0,0,0,0)"
  );
}

function isNeutralBackground(
  value: string
): boolean {
  const normalized =
    value
      .replace(
        /\s+/g,
        ""
      )
      .toLowerCase();

  return (
    normalized ===
      "transparent" ||
    normalized ===
      "rgba(0,0,0,0)" ||
    normalized ===
      "rgb(255,255,255)" ||
    normalized ===
      "rgba(255,255,255,1)"
  );
}

function buildDeveloperPrompt(): string {
  return [
    "You extract yacht charter availability from unfamiliar public website structures.",

    "Use only evidence contained in the supplied compact page signals.",

    "The page may contain rendered calendar cells, computed colors, month headings, legends, embedded JSON and browser network responses.",

    "The calendarCells array preserves DOM order and contains the strongest calendar-related cells selected from the rendered website.",

    "Interpret every legend source-by-source. Never assume that one color has the same meaning across different websites.",

    "For ViewYacht specifically, use the visible legend. Booked, Hold, Transit and Unavailable are blocking states. White or uncolored cells may represent open availability only when calendar structure and legend evidence support that conclusion.",

    "Calendar day cells may contain only a day number. Combine each day number with its monthContext or nearby month headings to reconstruct the ISO date.",

    "Calendar cells can expose status through backgroundColor, backgroundImage, beforeBackground or afterBackground. Treat CSS linear-gradient values and pseudo-element backgrounds as first-class evidence.",

    "Diagonal or split-color cells may represent a half-day transition between two statuses. When both states are identifiable, create adjacent ranges that meet on that date and explain the transition in evidence. Do not discard the surrounding continuous run because one boundary cell is split.",

    "Prefer explicit network payload dates and statuses over visual inference whenever both are available.",

    "Return dates in YYYY-MM-DD ISO format.",

    "Combine consecutive dates with the same yacht and status into one continuous range.",

    "Allowed statuses are: available, booked, reserved, option, unavailable, out_of_service and unknown.",

    "Map hold to reserved unless the page explicitly describes it as an option.",

    "Map transit to unavailable unless the source explicitly describes it differently.",

    "Do not invent yacht names, ports, destinations, regions, prices, currencies, dates or statuses.",

    "Do not interpret navigation labels, marketing copy or unrelated dates as availability.",

    "For each availability range, include a short evidence summary and confidence from 0 to 1.",

    "If the calendar clearly shows unrestricted white dates between known months and blocking colors are defined by the legend, those white dates may be extracted as available.",

    "The metadata object for every yacht must be empty.",
  ].join(
    "\n"
  );
}

const nullableString = {
  type: [
    "string",
    "null",
  ],
} as const;

const nullableNumber = {
  type: [
    "number",
    "null",
  ],
} as const;

const extractionSchema = {
  type:
    "object",

  additionalProperties:
    false,

  required: [
    "title",
    "strategy",
    "confidence",
    "legend",
    "yachts",
    "availability",
    "warnings",
  ],

  properties: {
    title:
      nullableString,

    strategy: {
      type:
        "string",

      enum: [
        "embedded_json",
        "rendered_dom",
        "visual_calendar",
        "mixed",
      ],
    },

    confidence: {
      type:
        "number",

      minimum:
        0,

      maximum:
        1,
    },

    legend: {
      type:
        "array",

      items: {
        type:
          "object",

        additionalProperties:
          false,

        required: [
          "label",
          "meaning",
          "color",
        ],

        properties: {
          label: {
            type:
              "string",
          },

          meaning: {
            type:
              "string",
          },

          color:
            nullableString,
        },
      },
    },

    yachts: {
      type:
        "array",

      items: {
        type:
          "object",

        additionalProperties:
          false,

        required: [
          "name",
          "brochureUrl",
          "currency",
          "location",
          "region",
          "metadata",
        ],

        properties: {
          name: {
            type:
              "string",
          },

          brochureUrl:
            nullableString,

          currency:
            nullableString,

          location:
            nullableString,

          region:
            nullableString,

          metadata: {
            type:
              "object",

            additionalProperties:
              false,

            properties:
              {},

            required:
              [],
          },
        },
      },
    },

    availability: {
      type:
        "array",

      items: {
        type:
          "object",

        additionalProperties:
          false,

        required: [
          "yachtName",
          "startDate",
          "endDate",
          "status",
          "price",
          "currency",
          "location",
          "region",
          "embarkationPort",
          "disembarkationPort",
          "notes",
          "evidence",
          "confidence",
        ],

        properties: {
          yachtName: {
            type:
              "string",
          },

          startDate: {
            type:
              "string",

            pattern:
              "^\\d{4}-\\d{2}-\\d{2}$",
          },

          endDate: {
            type:
              "string",

            pattern:
              "^\\d{4}-\\d{2}-\\d{2}$",
          },

          status: {
            type:
              "string",

            enum: [
              "available",
              "booked",
              "reserved",
              "option",
              "unavailable",
              "out_of_service",
              "unknown",
            ],
          },

          price:
            nullableNumber,

          currency:
            nullableString,

          location:
            nullableString,

          region:
            nullableString,

          embarkationPort:
            nullableString,

          disembarkationPort:
            nullableString,

          notes:
            nullableString,

          evidence:
            nullableString,

          confidence: {
            type:
              "number",

            minimum:
              0,

            maximum:
              1,
          },
        },
      },
    },

    warnings: {
      type:
        "array",

      items: {
        type:
          "string",
      },
    },
  },
} as const;

function readOutputText(
  payload: OpenAIResponse
): string | null {
  if (
    typeof payload.output_text ===
      "string" &&
    payload.output_text.trim()
  ) {
    return payload.output_text.trim();
  }

  for (
    const item
    of payload.output ??
      []
  ) {
    for (
      const content
      of item.content ??
        []
    ) {
      if (
        content.type ===
          "output_text" &&
        typeof content.text ===
          "string" &&
        content.text.trim()
      ) {
        return content.text.trim();
      }
    }
  }

  return null;
}