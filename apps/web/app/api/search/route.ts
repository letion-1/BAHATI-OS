import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  isAuthenticationRequiredError,
} from "@/lib/auth/require-user";
import {
  createClient,
} from "@/lib/supabase/server";
import {
  getCurrentWorkspace,
  isWorkspaceAccessError,
} from "@/lib/workspace/get-current-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GenericRow = Record<string, unknown>;

type SearchResult = {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  href: string;
  score: number;
};

type TableSearchResult = {
  table: string;
  rows: GenericRow[];
  warning?: string;
};

type TableConfig = {
  table: string;
  type: string;
  aliases: string[];
  limit?: number;
};

const TABLES: TableConfig[] = [
  {
    table: "clients",
    type: "client",
    aliases: [
      "client",
      "clients",
      "customer",
      "crm",
      "vip",
      "guest profile",
    ],
  },
  {
    table: "inquiries",
    type: "inquiry",
    aliases: [
      "inquiry",
      "inquiries",
      "request",
      "lead",
      "opportunity",
      "proposal",
      "proposal draft",
      "charter request",
    ],
  },
  {
    table: "fleet",
    type: "yacht",
    aliases: [
      "fleet",
      "yacht",
      "yachts",
      "boat",
      "vessel",
      "ship",
    ],
  },
  {
    table: "documents",
    type: "document",
    aliases: [
      "document",
      "documents",
      "file",
      "files",
      "passport",
      "invoice",
      "agreement",
      "contract",
      "receipt",
    ],
  },
  {
    table: "availability",
    type: "availability",
    aliases: [
      "availability",
      "available",
      "booking",
      "calendar",
      "charter window",
      "maintenance",
      "blocked",
    ],
  },
  {
    table: "activities",
    type: "activity",
    aliases: [
      "activity",
      "activities",
      "timeline",
      "event",
      "history",
      "audit",
    ],
  },
  {
    table: "data_sources",
    type: "data source",
    aliases: [
      "data source",
      "data sources",
      "source",
      "integration",
      "connection",
      "sync",
      "spreadsheet",
      "dropbox",
    ],
  },
  {
    table: "proposal_assets",
    type: "proposal asset",
    aliases: [
      "proposal asset",
      "proposal image",
      "proposal file",
      "proposal media",
      "asset",
    ],
  },
  {
    table: "companies",
    type: "workspace",
    aliases: [
      "company",
      "workspace",
      "brokerage",
      "organisation",
      "organization",
      "settings",
    ],
  },
];

export async function GET(
  request: NextRequest
) {
  try {
    const workspace =
      await getCurrentWorkspace();

    const supabase =
      await createClient();

    const rawQuery =
      request.nextUrl.searchParams
        .get("q")
        ?.trim() ?? "";

    if (rawQuery.length < 2) {
      return NextResponse.json(
        {
          success: true,
          query: rawQuery,
          results: [],
          warnings: [],
        },
        {
          status: 200,
          headers: noStoreHeaders(),
        }
      );
    }

    const searchTerms =
      normalizeSearchTerms(rawQuery);

    const tableResponses =
      await Promise.all(
        TABLES.map((config) =>
          loadTable({
            supabase,
            companyId:
              workspace.companyId,
            config,
          })
        )
      );

    const warnings =
      tableResponses
        .filter(
          (
            response
          ): response is TableSearchResult & {
            warning: string;
          } =>
            typeof response.warning ===
            "string"
        )
        .map(
          (response) =>
            `${response.table}: ${response.warning}`
        );

    const allResults: SearchResult[] = [];

    for (
      const tableResponse of tableResponses
    ) {
      const config = TABLES.find(
        (item) =>
          item.table ===
          tableResponse.table
      );

      if (!config) {
        continue;
      }

      for (
        const row of tableResponse.rows
      ) {
        const result =
          buildSearchResult({
            row,
            config,
            searchTerms,
            rawQuery,
          });

        if (result) {
          allResults.push(result);
        }

        /*
         * Proposals in your current system are
         * stored inside inquiry records using
         * proposal_status and proposal_pdf.
         *
         * We create a separate proposal search
         * result from the same inquiry row.
         */
        if (
          config.table ===
          "inquiries"
        ) {
          const proposalResult =
            buildProposalResult({
              row,
              searchTerms,
              rawQuery,
            });

          if (proposalResult) {
            allResults.push(
              proposalResult
            );
          }
        }
      }
    }

    const results =
      deduplicateResults(allResults)
        .sort(
          (a, b) =>
            b.score - a.score
        )
        .slice(0, 40)
        .map(
          ({
            score: _score,
            ...result
          }) => result
        );

    return NextResponse.json(
      {
        success: true,
        query: rawQuery,
        results,
        warnings,
      },
      {
        status: 200,
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    return handleRouteError(
      error,
      "Global search failed."
    );
  }
}

async function loadTable({
  supabase,
  companyId,
  config,
}: {
  supabase: Awaited<
    ReturnType<typeof createClient>
  >;
  companyId: string;
  config: TableConfig;
}): Promise<TableSearchResult> {
  try {
    /*
     * companies normally uses its own id as
     * the workspace identifier, rather than
     * a company_id column.
     */
    if (
      config.table === "companies"
    ) {
      const response = await supabase
        .from(config.table)
        .select("*")
        .eq("id", companyId)
        .limit(config.limit ?? 200);

      if (response.error) {
        return {
          table: config.table,
          rows: [],
          warning:
            response.error.message,
        };
      }

      return {
        table: config.table,
        rows:
          (response.data ??
            []) as unknown as GenericRow[],
      };
    }

    const response = await supabase
      .from(config.table)
      .select("*")
      .eq("company_id", companyId)
      .limit(config.limit ?? 300);

    if (!response.error) {
      return {
        table: config.table,
        rows:
          (response.data ??
            []) as unknown as GenericRow[],
      };
    }

    /*
     * Some secondary tables may not have
     * company_id directly. RLS may already
     * restrict them to the current workspace.
     *
     * In that case we retry without the
     * company_id filter.
     */
    const missingCompanyColumn =
      response.error.message
        .toLowerCase()
        .includes("company_id") &&
      response.error.message
        .toLowerCase()
        .includes("does not exist");

    if (missingCompanyColumn) {
      const fallbackResponse =
        await supabase
          .from(config.table)
          .select("*")
          .limit(
            config.limit ?? 300
          );

      if (
        fallbackResponse.error
      ) {
        return {
          table: config.table,
          rows: [],
          warning:
            fallbackResponse.error
              .message,
        };
      }

      return {
        table: config.table,
        rows:
          (fallbackResponse.data ??
            []) as unknown as GenericRow[],
      };
    }

    return {
      table: config.table,
      rows: [],
      warning:
        response.error.message,
    };
  } catch (error) {
    return {
      table: config.table,
      rows: [],
      warning:
        error instanceof Error
          ? error.message
          : "Table search failed.",
    };
  }
}

function buildSearchResult({
  row,
  config,
  searchTerms,
  rawQuery,
}: {
  row: GenericRow;
  config: TableConfig;
  searchTerms: string[];
  rawQuery: string;
}): SearchResult | null {
  const searchableText =
    buildSearchableText(
      row,
      config
    );

  if (
    !matchesAllTerms(
      searchableText,
      searchTerms
    )
  ) {
    return null;
  }

  const id =
    getString(row, ["id"]) ??
    `${config.table}-${createStableKey(
      row
    )}`;

  const title = getTitle(
    config.table,
    row
  );

  const subtitle = getSubtitle(
    config.table,
    row
  );

  return {
    id: `${config.type}-${id}`,
    type: config.type,
    title,
    subtitle,
    href: getHref(
      config.table,
      row
    ),
    score: calculateScore({
      rawQuery,
      title,
      subtitle,
      searchableText,
      aliases: config.aliases,
    }),
  };
}

function buildProposalResult({
  row,
  searchTerms,
  rawQuery,
}: {
  row: GenericRow;
  searchTerms: string[];
  rawQuery: string;
}): SearchResult | null {
  const proposalStatus =
    getString(row, [
      "proposal_status",
    ]);

  const proposalPdf =
    getString(row, [
      "proposal_pdf",
    ]);

  if (
    !proposalStatus &&
    !proposalPdf
  ) {
    return null;
  }

  /*
   * Include field names and proposal aliases
   * so a search like "draft proposal" matches
   * proposal_status = draft.
   */
  const searchableText = [
    buildSearchableText(row, {
      table: "inquiries",
      type: "proposal",
      aliases: [
        "proposal",
        "proposal draft",
        "charter proposal",
        "pdf",
        "offer",
      ],
    }),
    "proposal",
    "proposal draft",
    "charter proposal",
    "pdf",
    "offer",
  ]
    .join(" ")
    .toLowerCase();

  if (
    !matchesAllTerms(
      searchableText,
      searchTerms
    )
  ) {
    return null;
  }

  const inquiryId =
    getString(row, ["id"]) ?? "";

  const reference =
    getString(row, [
      "reference",
    ]) ?? "Charter proposal";

  const clientName =
    getString(row, [
      "client_name",
    ]);

  const destination =
    getString(row, [
      "destination",
    ]);

  const status =
    proposalStatus ??
    getString(row, ["status"]) ??
    "proposal";

  const subtitle = joinSubtitle([
    clientName,
    destination,
    humanize(status),
  ]);

  return {
    id: `proposal-${inquiryId}`,
    type: "proposal",
    title: reference,
    subtitle,
    href: inquiryId
      ? `/proposals/${inquiryId}`
      : "/proposals",
    score:
      calculateScore({
        rawQuery,
        title: reference,
        subtitle,
        searchableText,
        aliases: [
          "proposal",
          "proposal draft",
          "charter proposal",
          "pdf",
          "offer",
        ],
      }) + 15,
  };
}

function buildSearchableText(
  row: GenericRow,
  config: Pick<
    TableConfig,
    "table" | "type" | "aliases"
  >
): string {
  /*
   * We include:
   *
   * 1. Table name
   * 2. Result type
   * 3. Aliases
   * 4. Every object key
   * 5. Every nested value
   *
   * This means new columns become searchable
   * without changing this code.
   */
  return [
    config.table,
    config.type,
    ...config.aliases,
    flattenObject(row),
  ]
    .join(" ")
    .toLowerCase();
}

function flattenObject(
  value: unknown,
  seen = new WeakSet<object>()
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        flattenObject(item, seen)
      )
      .join(" ");
  }

  if (
    typeof value === "object"
  ) {
    const objectValue =
      value as Record<
        string,
        unknown
      >;

    if (seen.has(objectValue)) {
      return "";
    }

    seen.add(objectValue);

    return Object.entries(
      objectValue
    )
      .map(
        ([key, nestedValue]) =>
          `${key.replace(
            /_/g,
            " "
          )} ${flattenObject(
            nestedValue,
            seen
          )}`
      )
      .join(" ");
  }

  return "";
}

function matchesAllTerms(
  searchableText: string,
  searchTerms: string[]
): boolean {
  return searchTerms.every(
    (term) =>
      searchableText.includes(term)
  );
}

function calculateScore({
  rawQuery,
  title,
  subtitle,
  searchableText,
  aliases,
}: {
  rawQuery: string;
  title: string;
  subtitle: string;
  searchableText: string;
  aliases: string[];
}): number {
  const query =
    rawQuery.toLowerCase();

  const normalizedTitle =
    title.toLowerCase();

  const normalizedSubtitle =
    subtitle.toLowerCase();

  let score = 0;

  if (normalizedTitle === query) {
    score += 100;
  }

  if (
    normalizedTitle.startsWith(
      query
    )
  ) {
    score += 60;
  }

  if (
    normalizedTitle.includes(
      query
    )
  ) {
    score += 40;
  }

  if (
    normalizedSubtitle.includes(
      query
    )
  ) {
    score += 25;
  }

  if (
    aliases.some(
      (alias) =>
        alias.toLowerCase() ===
        query
    )
  ) {
    score += 20;
  }

  if (
    searchableText.includes(query)
  ) {
    score += 10;
  }

  return score;
}

function getTitle(
  table: string,
  row: GenericRow
): string {
  switch (table) {
    case "clients":
      return (
        getString(row, [
          "name",
          "client_name",
          "full_name",
        ]) ?? "Unnamed client"
      );

    case "inquiries":
      return (
        getString(row, [
          "reference",
          "client_name",
        ]) ?? "Inquiry"
      );

    case "fleet":
      return (
        getString(row, [
          "name",
          "yacht_name",
          "vessel_name",
          "boat_name",
          "title",
        ]) ?? "Unnamed yacht"
      );

    case "documents":
      return (
        getString(row, [
          "name",
          "file_name",
          "title",
        ]) ?? "Unnamed document"
      );

    case "availability":
      return (
        getString(row, [
          "yacht_name",
          "name",
          "reference",
          "status",
        ]) ?? "Availability record"
      );

    case "activities":
      return (
        getString(row, [
          "title",
          "action",
          "event_type",
          "type",
        ]) ?? "Workspace activity"
      );

    case "data_sources":
      return (
        getString(row, [
          "name",
          "display_name",
          "source_name",
          "type",
        ]) ?? "Data source"
      );

    case "proposal_assets":
      return (
        getString(row, [
          "name",
          "file_name",
          "title",
          "asset_type",
        ]) ?? "Proposal asset"
      );

    case "companies":
      return (
        getString(row, [
          "name",
          "company_name",
        ]) ?? "Workspace"
      );

    default:
      return (
        getString(row, [
          "name",
          "title",
          "reference",
        ]) ?? humanize(table)
      );
  }
}

function getSubtitle(
  table: string,
  row: GenericRow
): string {
  switch (table) {
    case "clients":
      return joinSubtitle([
        getString(row, ["email"]),
        getString(row, [
          "preferred_destination",
          "destination",
        ]),
        humanize(
          getString(row, [
            "status",
          ])
        ),
      ]);

    case "inquiries":
      return joinSubtitle([
        getString(row, [
          "client_name",
        ]),
        getString(row, [
          "destination",
        ]),
        humanize(
          getString(row, [
            "status",
          ])
        ),
      ]);

    case "fleet":
      return joinSubtitle([
        getString(row, [
          "location",
          "destination",
          "current_location",
          "base_location",
          "region",
          "cruising_area",
        ]),
        getString(row, [
          "builder",
          "shipyard",
          "manufacturer",
        ]),
        humanize(
          getString(row, [
            "status",
            "availability_status",
            "fleet_status",
          ])
        ),
      ]);

    case "documents":
      return joinSubtitle([
        humanize(
          getString(row, [
            "category",
            "document_type",
          ])
        ),
        humanize(
          getString(row, [
            "status",
          ])
        ),
        formatFileSize(
          getNumber(row, [
            "file_size",
            "size",
          ])
        ),
      ]);

    case "availability":
      return joinSubtitle([
        formatDate(
          getString(row, [
            "start_date",
            "available_from",
          ])
        ),
        formatDate(
          getString(row, [
            "end_date",
            "available_to",
          ])
        ),
        humanize(
          getString(row, [
            "status",
          ])
        ),
      ]);

    case "activities":
      return joinSubtitle([
        getString(row, [
          "description",
          "message",
          "details",
        ]),
        formatDate(
          getString(row, [
            "created_at",
          ])
        ),
      ]);

    case "data_sources":
      return joinSubtitle([
        humanize(
          getString(row, [
            "type",
            "source_type",
          ])
        ),
        humanize(
          getString(row, [
            "status",
          ])
        ),
        getString(row, [
          "url",
          "source_url",
        ]),
      ]);

    case "proposal_assets":
      return joinSubtitle([
        humanize(
          getString(row, [
            "asset_type",
            "type",
          ])
        ),
        humanize(
          getString(row, [
            "status",
          ])
        ),
      ]);

    case "companies":
      return joinSubtitle([
        getString(row, [
          "email",
          "website",
        ]),
        getString(row, [
          "location",
          "address",
        ]),
      ]);

    default:
      return "";
  }
}

function getHref(
  table: string,
  row: GenericRow
): string {
  const id =
    getString(row, ["id"]);

  switch (table) {
    case "clients":
      return id
        ? `/clients/${id}`
        : "/clients";

    case "inquiries":
      return id
        ? `/workspace/inquiry/${id}`
        : "/inquiries";

    case "fleet":
      return id
        ? `/fleet/${id}`
        : "/fleet";

    case "documents":
      return "/documents";

    case "availability":
      return "/availability";

    case "activities":
      return "/";

    case "data_sources":
      return "/data-sources";

    case "proposal_assets": {
      const proposalId =
        getString(row, [
          "proposal_id",
          "inquiry_id",
        ]);

      return proposalId
        ? `/proposals/${proposalId}`
        : "/proposals";
    }

    case "companies":
      return "/settings";

    default:
      return "/";
  }
}

function deduplicateResults(
  results: SearchResult[]
): SearchResult[] {
  const unique =
    new Map<
      string,
      SearchResult
    >();

  for (const result of results) {
    const key = [
      result.type,
      result.href,
      result.title,
    ].join("|");

    const existing =
      unique.get(key);

    if (
      !existing ||
      result.score >
        existing.score
    ) {
      unique.set(key, result);
    }
  }

  return Array.from(
    unique.values()
  );
}

function normalizeSearchTerms(
  value: string
): string[] {
  return value
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((term) =>
      term.replace(
        /[^\p{L}\p{N}@._€$£-]/gu,
        ""
      )
    )
    .filter(Boolean);
}

function getString(
  row: GenericRow,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = row[key];

    if (
      typeof value === "string" &&
      value.trim().length > 0
    ) {
      return value.trim();
    }

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return String(value);
    }
  }

  return null;
}

function getNumber(
  row: GenericRow,
  keys: string[]
): number | null {
  for (const key of keys) {
    const value = row[key];

    const parsed =
      typeof value === "number"
        ? value
        : Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function joinSubtitle(
  values: Array<
    string | null | undefined
  >
): string {
  return values
    .filter(
      (
        value
      ): value is string =>
        typeof value === "string" &&
        value.trim().length > 0
    )
    .join(" · ");
}

function humanize(
  value: string | null
): string {
  if (!value) {
    return "";
  }

  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}

function formatDate(
  value: string | null
): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  ).format(date);
}

function formatFileSize(
  bytes: number | null
): string | null {
  if (
    bytes === null ||
    bytes <= 0
  ) {
    return null;
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
  ];

  const index = Math.min(
    Math.floor(
      Math.log(bytes) /
        Math.log(1024)
    ),
    units.length - 1
  );

  return `${(
    bytes /
    1024 ** index
  ).toFixed(1)} ${units[index]}`;
}

function createStableKey(
  row: GenericRow
): string {
  const value =
    flattenObject(row)
      .slice(0, 100)
      .replace(
        /[^a-zA-Z0-9]+/g,
        "-"
      );

  return (
    value ||
    Math.random()
      .toString(36)
      .slice(2)
  );
}

function noStoreHeaders() {
  return {
    "Cache-Control":
      "private, no-store, max-age=0",
  };
}

function handleRouteError(
  error: unknown,
  fallbackMessage: string
) {
  if (
    isAuthenticationRequiredError(
      error
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: error.status,
      }
    );
  }

  if (
    isWorkspaceAccessError(error)
  ) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: error.status,
      }
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : fallbackMessage;

  console.error(
    "Global search failed:",
    error
  );

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status: 500,
    }
  );
}