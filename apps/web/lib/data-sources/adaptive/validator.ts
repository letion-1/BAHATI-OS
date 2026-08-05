import type {
  AdaptiveAvailabilityWindow,
  AdaptiveExtraction,
  AdaptiveYacht,
} from "./types";

const ALLOWED_STATUSES =
  new Set([
    "available",
    "booked",
    "reserved",
    "option",
    "unavailable",
    "out_of_service",
    "unknown",
  ]);

export function validateAdaptiveExtraction(
  value: AdaptiveExtraction
): AdaptiveExtraction {
  const warnings = [
    ...value.warnings,
  ];

  const yachts =
    deduplicateYachts(
      value.yachts
    );

  const yachtNames =
    new Set(
      yachts.map(
        (yacht) =>
          normalizeName(
            yacht.name
          )
      )
    );

  const availability =
    value.availability
      .map(
        normalizeWindow
      )
      .filter(
        (
          window
        ): window is AdaptiveAvailabilityWindow => {
          if (!window) {
            return false;
          }

          if (
            !yachtNames.has(
              normalizeName(
                window.yachtName
              )
            )
          ) {
            yachts.push({
              name:
                window.yachtName,

              brochureUrl:
                null,

              currency:
                window.currency,

              location:
                window.location,

              region:
                window.region,

              metadata: {
                createdFromAvailability:
                  true,
              },
            });

            yachtNames.add(
              normalizeName(
                window.yachtName
              )
            );
          }

          return true;
        }
      );

  if (
    availability.length ===
    0
  ) {
    throw new Error(
      "Adaptive extraction found no trustworthy availability periods."
    );
  }

  if (
    yachts.length ===
    0
  ) {
    throw new Error(
      "Adaptive extraction found no yacht identity."
    );
  }

  const confidence =
    clampConfidence(
      value.confidence
    );

  if (
    confidence <
    0.55
  ) {
    throw new Error(
      `Adaptive extraction confidence was too low (${Math.round(
        confidence *
          100
      )}%).`
    );
  }

  if (
    confidence <
    0.8
  ) {
    warnings.push(
      "This source was interpreted by the adaptive AI fallback and should be reviewed."
    );
  }

  return {
    ...value,

    confidence,

    yachts,

    availability:
      deduplicateWindows(
        availability
      ),

    warnings,
  };
}

function normalizeWindow(
  window:
    AdaptiveAvailabilityWindow
): AdaptiveAvailabilityWindow | null {
  const yachtName =
    window.yachtName.trim();

  const startDate =
    normalizeIsoDate(
      window.startDate
    );

  const endDate =
    normalizeIsoDate(
      window.endDate
    );

  if (
    !yachtName ||
    !startDate ||
    !endDate ||
    endDate <
      startDate
  ) {
    return null;
  }

  const status =
    ALLOWED_STATUSES.has(
      window.status
    )
      ? window.status
      : "unknown";

  return {
    ...window,

    yachtName,

    startDate,

    endDate,

    status,

    price:
      typeof window.price ===
        "number" &&
      Number.isFinite(
        window.price
      ) &&
      window.price >
        0
        ? window.price
        : null,

    currency:
      normalizeCurrency(
        window.currency
      ),

    confidence:
      clampConfidence(
        window.confidence
      ),
  };
}

function deduplicateYachts(
  yachts: AdaptiveYacht[]
): AdaptiveYacht[] {
  const map =
    new Map<
      string,
      AdaptiveYacht
    >();

  for (
    const yacht
    of yachts
  ) {
    const name =
      yacht.name.trim();

    if (!name) {
      continue;
    }

    const key =
      normalizeName(
        name
      );

    if (
      !map.has(
        key
      )
    ) {
      map.set(
        key,
        {
          ...yacht,
          name,
        }
      );
    }
  }

  return Array.from(
    map.values()
  );
}

function deduplicateWindows(
  windows:
    AdaptiveAvailabilityWindow[]
): AdaptiveAvailabilityWindow[] {
  const map =
    new Map<
      string,
      AdaptiveAvailabilityWindow
    >();

  for (
    const window
    of windows
  ) {
    const key = [
      normalizeName(
        window.yachtName
      ),

      window.startDate,

      window.endDate,

      window.status,
    ].join(":");

    const existing =
      map.get(
        key
      );

    if (
      !existing ||
      window.confidence >
        existing.confidence
    ) {
      map.set(
        key,
        window
      );
    }
  }

  return Array
    .from(
      map.values()
    )
    .sort(
      (
        first,
        second
      ) =>
        first.startDate.localeCompare(
          second.startDate
        )
    );
}

function normalizeIsoDate(
  value: string
): string | null {
  const trimmed =
    value.trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      trimmed
    )
  ) {
    return null;
  }

  const date =
    new Date(
      `${trimmed}T00:00:00.000Z`
    );

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date
        .toISOString()
        .slice(
          0,
          10
        );
}

function normalizeCurrency(
  value:
    string |
    null
): string | null {
  if (!value) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toUpperCase();

  const aliases:
    Record<
      string,
      string
    > = {
      "€": "EUR",
      "$": "USD",
      "£": "GBP",
    };

  const result =
    aliases[
      normalized
    ] ??
    normalized;

  return /^[A-Z]{3}$/.test(
    result
  )
    ? result
    : null;
}

function normalizeName(
  value: string
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
    );
}

function clampConfidence(
  value: number
): number {
  if (
    !Number.isFinite(
      value
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      1,
      value
    )
  );
}