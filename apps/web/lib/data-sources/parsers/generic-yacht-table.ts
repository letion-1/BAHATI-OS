import type {
  ParsedWorkbook,
  ParsedWorksheet,
  SerializableCellValue,
} from "../source-types";

import type {
  AvailabilityStatus,
  NormalizedAvailability,
  NormalizedYacht,
  ParserDetection,
  ParserResult,
  WorkbookParser,
} from "./types";

const PARSER_ID = "generic-table-v2";

const NAME_HEADERS = [
  "yacht",
  "yacht name",
  "boat",
  "boat name",
  "vessel",
  "vessel name",
  "name",
];

const BROCHURE_HEADERS = [
  "brochure",
  "brochure url",
  "e-brochure",
  "website",
  "url",
  "link",
];

const START_HEADERS = [
  "start",
  "start date",
  "from",
  "date from",
  "available from",
  "check in",
  "check-in",
  "embarkation date",
];

const END_HEADERS = [
  "end",
  "end date",
  "to",
  "date to",
  "available to",
  "check out",
  "check-out",
  "disembarkation date",
];

const STATUS_HEADERS = [
  "status",
  "availability",
  "availability status",
  "state",
];

const PRICE_HEADERS = [
  "price",
  "rate",
  "weekly rate",
  "charter rate",
];

const CURRENCY_HEADERS = [
  "currency",
  "curr",
];

/*
 * Columns beyond the six the parser originally read.
 *
 * Dropping these was not cosmetic. Without a capacity column guest_capacity
 * stays null, and scoreMatch guards its guest logic on
 * `guestCapacity !== null`, so the whole branch is skipped and matching falls
 * back to dates alone. Without a location column the dashboard's destination
 * grouping has nothing to group by, because it reads availability.region,
 * then location, then embarkation_port, and all three are null.
 *
 * A 35-yacht fleet across eight countries therefore matched on dates only and
 * drew an empty map.
 */
const LOCATION_HEADERS = [
  "location",
  "base",
  "base port",
  "home port",
  "port",
  "area",
  "cruising area",
  "region",
  "cruising region",
  "destination",
];

const CAPACITY_HEADERS = [
  "capacity",
  "guests",
  "guest capacity",
  "max guests",
  "pax",
  "sleeps",
  "berths",
];

const CABIN_HEADERS = [
  "cabins",
  "cabin count",
  "staterooms",
  "no of cabins",
  "number of cabins",
];

const NOTES_HEADERS = [
  "notes",
  "note",
  "comments",
  "comment",
  "evidence",
];

type HeaderPosition = {
  row: number;
  column: number;
};

function normalizeText(
  value: SerializableCellValue
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(
  value: SerializableCellValue
): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Read guests and cabins out of a capacity column.
 *
 * Operators write this as one field far more often than two: "5 cabins / 10
 * guests", "10 guests, 5 cabins", "12 pax". Taking the first number would
 * report a ten-guest yacht as sleeping five, which for matching is worse than
 * reporting nothing, because a wrong capacity silently excludes a yacht that
 * fits or offers one that does not.
 *
 * So numbers are only claimed when the word beside them says what they are.
 * A bare number in a column headed "Guests" is the one safe exception.
 */
function parseCapacity(
  capacityText: string,
  cabinText: string
): { guests: number | null; cabins: number | null } {
  const combined = `${capacityText} ${cabinText}`.toLowerCase();

  const guestMatch = combined.match(
    /(\d{1,3})\s*(?:guests?|pax|berths?|sleeps)/
  );

  const cabinMatch = combined.match(
    /(\d{1,3})\s*(?:cabins?|staterooms?)/
  );

  let guests = guestMatch ? Number(guestMatch[1]) : null;
  let cabins = cabinMatch ? Number(cabinMatch[1]) : null;

  // A column of bare numbers, where the header already said what they are.
  if (guests === null && /^\d{1,3}$/.test(capacityText.trim())) {
    guests = Number(capacityText.trim());
  }

  if (cabins === null && /^\d{1,3}$/.test(cabinText.trim())) {
    cabins = Number(cabinText.trim());
  }

  // A yacht with 200 guests or 0 cabins is a misread column, not a superyacht.
  if (guests !== null && (guests < 1 || guests > 100)) {
    guests = null;
  }

  if (cabins !== null && (cabins < 1 || cabins > 50)) {
    cabins = null;
  }

  return { guests, cabins };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findHeaderColumn(
  worksheet: ParsedWorksheet,
  aliases: string[]
): HeaderPosition | null {
  const normalizedAliases =
    aliases.map((alias) =>
      normalizeHeader(alias)
    );

  const maxRows =
    Math.min(
      worksheet.matrix.length,
      25
    );

  for (
    let rowIndex = 0;
    rowIndex < maxRows;
    rowIndex += 1
  ) {
    const row =
      worksheet.matrix[rowIndex] ??
      [];

    for (
      let columnIndex = 0;
      columnIndex < row.length;
      columnIndex += 1
    ) {
      if (
        normalizedAliases.includes(
          normalizeHeader(
            row[columnIndex]
          )
        )
      ) {
        return {
          row:
            rowIndex + 1,
          column:
            columnIndex + 1,
        };
      }
    }
  }

  return null;
}

function readValue(
  worksheet: ParsedWorksheet,
  row: number,
  column: number | null
): SerializableCellValue {
  if (!column) {
    return null;
  }

  return (
    worksheet.matrix[row - 1]?.[
      column - 1
    ] ??
    null
  );
}

function parseIsoDate(
  value: SerializableCellValue
): string | null {
  const text =
    normalizeText(value);

  if (!text) {
    return null;
  }

  const iso =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      text
    );

  if (iso) {
    const date =
      new Date(
        `${text}T00:00:00.000Z`
      );

    return Number.isNaN(
      date.getTime()
    )
      ? null
      : text;
  }

  const parsed =
    new Date(text);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  return new Date(
    Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate()
    )
  )
    .toISOString()
    .slice(0, 10);
}

function normalizeStatus(
  value: SerializableCellValue
): AvailabilityStatus {
  const status =
    normalizeText(value)
      .toLowerCase();

  if (
    /^(available|free|open)$/.test(
      status
    )
  ) {
    return "available";
  }

  if (
    /^(booked|booking|busy|occupied|sold)$/.test(
      status
    )
  ) {
    return "booked";
  }

  if (
    /^(reserved|reservation|hold|held)$/.test(
      status
    )
  ) {
    return "reserved";
  }

  if (
    /^(option|optional|pending|tentative|provisional)$/.test(
      status
    )
  ) {
    return "option";
  }

  if (
    /^(out[_ -]?of[_ -]?service|maintenance|service|dry[_ -]?dock)$/.test(
      status
    )
  ) {
    return "out_of_service";
  }

  if (
    /^(unavailable|blocked|closed|transit)$/.test(
      status
    )
  ) {
    return "unavailable";
  }

  return "unknown";
}

function parseNumber(
  value: SerializableCellValue
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  const text =
    normalizeText(value)
      .replace(/[€$£]/g, "")
      .replace(/\s/g, "")
      .replace(/,(?=\d{3}(?:\D|$))/g, "");

  if (
    !/^-?\d+(?:\.\d+)?$/.test(
      text
    )
  ) {
    return null;
  }

  const parsed =
    Number(text);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function parseGenericTable(
  workbook: ParsedWorkbook,
  detection: ParserDetection
): ParserResult {
  const worksheet =
    workbook.sheets.find(
      (sheet) =>
        sheet.name ===
        detection.sheetName
    ) ??
    workbook.sheets[0];

  if (!worksheet) {
    throw new Error(
      "The detected generic-table worksheet was not found."
    );
  }

  const nameHeader =
    findHeaderColumn(
      worksheet,
      NAME_HEADERS
    );

  if (!nameHeader) {
    throw new Error(
      "The generic yacht table requires a yacht, boat, vessel or name column."
    );
  }

  const brochureHeader =
    findHeaderColumn(
      worksheet,
      BROCHURE_HEADERS
    );

  const startHeader =
    findHeaderColumn(
      worksheet,
      START_HEADERS
    );

  const endHeader =
    findHeaderColumn(
      worksheet,
      END_HEADERS
    );

  const statusHeader =
    findHeaderColumn(
      worksheet,
      STATUS_HEADERS
    );

  const priceHeader =
    findHeaderColumn(
      worksheet,
      PRICE_HEADERS
    );

  const currencyHeader =
    findHeaderColumn(
      worksheet,
      CURRENCY_HEADERS
    );

  const notesHeader =
    findHeaderColumn(
      worksheet,
      NOTES_HEADERS
    );

  const locationHeader =
    findHeaderColumn(
      worksheet,
      LOCATION_HEADERS
    );

  const capacityHeader =
    findHeaderColumn(
      worksheet,
      CAPACITY_HEADERS
    );

  const cabinHeader =
    findHeaderColumn(
      worksheet,
      CABIN_HEADERS
    );

  const yachts:
    NormalizedYacht[] =
      [];

  const availability:
    NormalizedAvailability[] =
      [];

  const yachtKeys =
    new Map<
      string,
      string
    >();

  /*
   * A yacht moves. One row says Split, the next says Hvar, the next says
   * Dubrovnik, and the fleet's cruising regions are the set of all of them
   * rather than whichever row happened to come first.
   *
   * Insertion-ordered, so the first place a yacht appears becomes its home
   * port, which is the closest thing an availability sheet offers.
   */
  const locationsByYacht = new Map<string, Set<string>>();

  const headerRow =
    nameHeader.row;

  for (
    let row = headerRow + 1;
    row <= worksheet.rowCount;
    row += 1
  ) {
    const name =
      normalizeText(
        readValue(
          worksheet,
          row,
          nameHeader.column
        )
      );

    if (!name) {
      continue;
    }

    const normalizedName =
      name.toLowerCase();

    let yachtSourceKey =
      yachtKeys.get(
        normalizedName
      );

    if (!yachtSourceKey) {
      yachtSourceKey =
        `${slugify(
          worksheet.name
        )}:${slugify(name)}`;

      yachtKeys.set(
        normalizedName,
        yachtSourceKey
      );

      const brochureValue =
        brochureHeader?.row ===
          headerRow
          ? normalizeText(
              readValue(
                worksheet,
                row,
                brochureHeader.column
              )
            )
          : "";

      /*
       * Capacity is read from the first row for this yacht. A hull does not
       * gain cabins mid-season, so repeating the value on every week is the
       * sheet being tabular, not the yacht changing.
       */
      const capacityText =
        capacityHeader?.row === headerRow
          ? normalizeText(
              readValue(worksheet, row, capacityHeader.column)
            )
          : "";

      const cabinText =
        cabinHeader?.row === headerRow
          ? normalizeText(readValue(worksheet, row, cabinHeader.column))
          : "";

      const capacity = parseCapacity(capacityText, cabinText);

      yachts.push({
        sourceKey:
          yachtSourceKey,
        name,
        sourceSheet:
          worksheet.name,
        sourceRow:
          row,
        sourceColumn:
          nameHeader.column,
        brochureUrl:
          /^https?:\/\//i.test(
            brochureValue
          )
            ? brochureValue
            : null,
        metadata: {
          parserId:
            PARSER_ID,
          headerRow,

          /*
           * Named to match what importFleet looks for: it reads
           * metadata.guestCapacity then metadata.guests, and metadata.cabinCount
           * then metadata.cabins. A different key here writes a null column.
           */
          ...(capacity.guests !== null
            ? { guestCapacity: capacity.guests }
            : {}),
          ...(capacity.cabins !== null
            ? { cabinCount: capacity.cabins }
            : {}),
        },
      });
    }

    if (
      !startHeader ||
      !endHeader ||
      startHeader.row !==
        headerRow ||
      endHeader.row !==
        headerRow
    ) {
      continue;
    }

    const startDate =
      parseIsoDate(
        readValue(
          worksheet,
          row,
          startHeader.column
        )
      );

    const endDate =
      parseIsoDate(
        readValue(
          worksheet,
          row,
          endHeader.column
        )
      );

    if (
      !startDate ||
      !endDate
    ) {
      continue;
    }

    const status =
      statusHeader?.row ===
        headerRow
        ? normalizeStatus(
            readValue(
              worksheet,
              row,
              statusHeader.column
            )
          )
        : "unknown";

    const price =
      priceHeader?.row ===
        headerRow
        ? parseNumber(
            readValue(
              worksheet,
              row,
              priceHeader.column
            )
          )
        : null;

    const currency =
      currencyHeader?.row ===
        headerRow
        ? normalizeText(
            readValue(
              worksheet,
              row,
              currencyHeader.column
            )
          ) || null
        : null;

    const notes =
      notesHeader?.row ===
        headerRow
        ? normalizeText(
            readValue(
              worksheet,
              row,
              notesHeader.column
            )
          ) || null
        : null;

    const location =
      locationHeader?.row === headerRow
        ? normalizeText(
            readValue(worksheet, row, locationHeader.column)
          ) || null
        : null;

    if (location) {
      const seen =
        locationsByYacht.get(yachtSourceKey) ?? new Set<string>();

      seen.add(location);
      locationsByYacht.set(yachtSourceKey, seen);
    }

    availability.push({
      sourceKey: [
        yachtSourceKey,
        startDate,
        endDate,
        status,
        row,
      ].join(":"),
      yachtSourceKey,
      yachtName:
        name,
      startDate,
      endDate,
      status,
      price,
      currency,
      rawValue:
        normalizeText(
          readValue(
            worksheet,
            row,
            statusHeader?.column ??
              null
          )
        ) || null,
      sourceSheet:
        worksheet.name,
      sourceCell:
        `${columnToLetters(
          startHeader.column
        )}${row}`,
      sourceRow:
        row,
      sourceColumn:
        startHeader.column,
      notes,
      metadata: {
        parserId:
          PARSER_ID,
        headerRow,

        /*
         * summariseDestinations reads region, then location, then
         * embarkation_port. Written as `location` rather than `region`
         * because a sheet's Location column holds a port ("Split", "Bodrum"),
         * and calling a port a region would put an unmatched label on the
         * map's coordinate lookup.
         */
        ...(location ? { location } : {}),
      },
    });
  }

  /*
   * Folded in at the end rather than at first sight, because a yacht's full
   * set of ports is only known once every row has been read.
   */
  for (const yacht of yachts) {
    const places = locationsByYacht.get(yacht.sourceKey);

    if (!places || places.size === 0) {
      continue;
    }

    const ordered = [...places];

    yacht.metadata = {
      ...yacht.metadata,
      // importFleet reads cruisingRegions then regions, and homePort then port.
      cruisingRegions: ordered,
      homePort: ordered[0],
    };
  }

  if (
    yachts.length ===
    0
  ) {
    throw new Error(
      "The generic table did not contain any yacht rows."
    );
  }

  const warnings:
    string[] =
      [];

  if (
    startHeader &&
    endHeader &&
    availability.length ===
      0
  ) {
    warnings.push(
      "Availability columns were detected, but no valid date ranges were parsed."
    );
  } else if (
    !startHeader ||
    !endHeader
  ) {
    warnings.push(
      "Fleet rows were imported, but this generic table does not contain structured start and end date columns."
    );
  }

  const firstAvailability =
    availability.at(0);

  const detectedYear =
    firstAvailability &&
    typeof firstAvailability.startDate ===
      "string"
      ? Number(
          firstAvailability.startDate.slice(
            0,
            4
          )
        )
      : null;

  return {
    parserId:
      PARSER_ID,
    layout:
      "generic_table",
    confidence:
      Math.max(
        detection.confidence,
        availability.length >
          0
          ? 0.98
          : 0.7
      ),
    yachts,
    availability,
    warnings,
    metadata: {
      sheetName:
        worksheet.name,
      detectedYear,
      yachtCount:
        yachts.length,
      availabilityCount:
        availability.length,
      headerRow,
    },
  };
}

export const genericYachtTableParser:
  WorkbookParser = {
    id:
      PARSER_ID,
    layout:
      "generic_table",

    detect(
      workbook:
        ParsedWorkbook
    ): ParserDetection {
      const worksheet =
        workbook.sheets[0];

      if (!worksheet) {
        return {
          layout:
            "generic_table",
          confidence:
            0,
          parserId:
            PARSER_ID,
          reasons:
            [],
          sheetName:
            null,
        };
      }

      const hasName =
        Boolean(
          findHeaderColumn(
            worksheet,
            NAME_HEADERS
          )
        );

      const hasStart =
        Boolean(
          findHeaderColumn(
            worksheet,
            START_HEADERS
          )
        );

      const hasEnd =
        Boolean(
          findHeaderColumn(
            worksheet,
            END_HEADERS
          )
        );

      const confidence =
        hasName &&
        hasStart &&
        hasEnd
          ? 0.98
          : hasName
            ? 0.7
            : 0;

      return {
        layout:
          "generic_table",
        confidence,
        parserId:
          PARSER_ID,
        reasons: [
          ...(hasName
            ? [
                "Found a yacht-name column.",
              ]
            : []),
          ...(hasStart &&
          hasEnd
            ? [
                "Found structured start and end date columns.",
              ]
            : []),
        ],
        sheetName:
          worksheet.name,
      };
    },

    parse(
      workbook:
        ParsedWorkbook,
      detection:
        ParserDetection
    ): ParserResult {
      return parseGenericTable(
        workbook,
        detection
      );
    },
  };

function columnToLetters(
  column: number
): string {
  let result =
    "";

  let current =
    column;

  while (
    current >
    0
  ) {
    const remainder =
      (current - 1) %
      26;

    result =
      String.fromCharCode(
        65 + remainder
      ) +
      result;

    current =
      Math.floor(
        (current - 1) /
          26
      );
  }

  return result ||
    "A";
}