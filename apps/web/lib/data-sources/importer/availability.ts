import type { NormalizedAvailability } from "@/lib/data-sources/parsers/types";

import type {
  AvailabilityImportResult,
  FleetImportRecord,
  ImportAvailabilityInput,
} from "./types";

type JsonRecord = Record<string, unknown>;

const INSERT_BATCH_SIZE = 500;

export async function importAvailability({
  supabase,
  companyId,
  sourceId,
  syncedAt,
  availability,
  yachtsBySourceKey,
}: ImportAvailabilityInput): Promise<AvailabilityImportResult> {
  /*
   * Availability is treated as a source snapshot.
   *
   * Each successful sync replaces the previous availability rows
   * from this source. This removes stale bookings and avoids
   * duplicate calendar records.
   */
  const { data: deletedRows, error: deleteError } =
    await supabase
      .from("availability")
      .delete()
      .eq("company_id", companyId)
      .eq("source_id", sourceId)
      .select("id");

  if (deleteError) {
    throw new Error(
      `Could not clear old availability: ${deleteError.message}`
    );
  }

  const payloads: Record<string, unknown>[] = [];

  let skipped = 0;

  for (const item of availability) {
    const yachtSourceKey =
      requiredString(item.yachtSourceKey);

    if (!yachtSourceKey) {
      skipped += 1;
      continue;
    }

    const yacht =
      yachtsBySourceKey.get(yachtSourceKey);

    if (!yacht) {
      skipped += 1;
      continue;
    }

    const startDate =
      normalizeDate(item.startDate);

    const endDate =
      normalizeDate(item.endDate);

    if (!startDate || !endDate) {
      skipped += 1;
      continue;
    }

    const metadata = getMetadata(item);

    const externalId =
      requiredString(item.sourceKey) ??
      buildExternalId({
        yachtSourceKey,
        startDate,
        endDate,
        status: item.status,
      });

    payloads.push({
      company_id: companyId,
      fleet_id: yacht.id,
      source_id: sourceId,
      external_id: externalId,

      start_date: startDate,
      end_date: endDate,

      status:
        normalizeStatus(item.status),

      location:
        getString(metadata, "location"),

      region:
        getString(metadata, "region"),

      embarkation_port:
        getString(metadata, "embarkationPort"),

      disembarkation_port:
        getString(metadata, "disembarkationPort"),

      weekly_rate:
        normalizeNumber(item.price),

      currency:
        normalizeCurrency(item.currency) ??
        yacht.currency ??
        "EUR",

      notes:
        getString(metadata, "notes") ??
        getString(metadata, "rawText"),

      raw_data: {
        parser_availability: item,
        metadata,
      },

      source_updated_at:
        getDateTime(metadata, "sourceUpdatedAt"),

      last_synced_at: syncedAt,
      updated_at: syncedAt,
    });
  }

  let inserted = 0;

  for (
    let index = 0;
    index < payloads.length;
    index += INSERT_BATCH_SIZE
  ) {
    const batch = payloads.slice(
      index,
      index + INSERT_BATCH_SIZE
    );

    const { data, error } =
      await supabase
        .from("availability")
        .insert(batch)
        .select("id");

    if (error) {
      throw new Error(
        `Could not insert availability batch: ${error.message}`
      );
    }

    inserted += data?.length ?? batch.length;
  }

  return {
    deleted: deletedRows?.length ?? 0,
    inserted,
    skipped,
    total: availability.length,
  };
}

function buildExternalId({
  yachtSourceKey,
  startDate,
  endDate,
  status,
}: {
  yachtSourceKey: string;
  startDate: string;
  endDate: string;
  status: unknown;
}): string {
  return [
    yachtSourceKey,
    startDate,
    endDate,
    normalizeStatus(status),
  ].join(":");
}

function normalizeStatus(
  value: unknown
): string {
  if (typeof value !== "string") {
    return "unavailable";
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  const aliases: Record<string, string> = {
    free: "available",
    open: "available",
    available: "available",

    provisional: "provisional",
    tentative: "provisional",
    pending: "provisional",

    option: "option",
    hold: "option",
    reserved: "option",

    booked: "booked",
    confirmed: "booked",
    sold: "booked",

    unavailable: "unavailable",
    unknown: "unavailable",
    blocked: "unavailable",
    closed: "unavailable",

    maintenance: "maintenance",
    out_of_service: "maintenance",
    dry_dock: "maintenance",
    inactive: "maintenance",
  };

  return aliases[normalized] ?? "unavailable";
}

function normalizeCurrency(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toUpperCase();

  if (!normalized) {
    return null;
  }

  const aliases: Record<string, string> = {
    "€": "EUR",
    "$": "USD",
    "£": "GBP",
  };

  return aliases[normalized] ?? normalized;
}

function normalizeNumber(
  value: unknown
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    const normalized = value
      .replace(/[^\d.,-]/g, "")
      .replace(/,(?=\d{3}\b)/g, "")
      .replace(",", ".");

    const parsed = Number(normalized);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function normalizeDate(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const date = new Date(trimmed);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString().slice(0, 10);
}

function getMetadata(
  value: NormalizedAvailability
): JsonRecord {
  return isRecord(value.metadata)
    ? value.metadata
    : {};
}

function getString(
  record: JsonRecord,
  key: string
): string | null {
  const value = record[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0
    ? trimmed
    : null;
}

function getDateTime(
  record: JsonRecord,
  key: string
): string | null {
  const value = getString(record, key);

  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

function requiredString(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0
    ? trimmed
    : null;
}

function isRecord(
  value: unknown
): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}