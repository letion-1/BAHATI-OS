import type { NormalizedYacht } from "@/lib/data-sources/parsers/types";

import type {
  FleetImportRecord,
  FleetImportResult,
  ImportYachtsInput,
} from "./types";

type JsonRecord = Record<string, unknown>;

type ExistingFleetRow = {
  id: string;
  external_id: string | null;
  name: string;
  currency: string | null;
};

export async function importFleet({
  supabase,
  companyId,
  sourceId,
  syncedAt,
  yachts,
}: ImportYachtsInput): Promise<FleetImportResult> {
  const uniqueYachts = deduplicateYachts(yachts);

  const { data: existingRows, error: existingError } =
    await supabase
      .from("fleet")
      .select("id, external_id, name, currency")
      .eq("company_id", companyId)
      .eq("source_id", sourceId);

  if (existingError) {
    throw new Error(
      `Could not load existing fleet records: ${existingError.message}`
    );
  }

  const existingByExternalId = new Map<string, ExistingFleetRow>();

  for (const row of (existingRows ?? []) as ExistingFleetRow[]) {
    if (row.external_id) {
      existingByExternalId.set(row.external_id, row);
    }
  }

  const yachtsBySourceKey = new Map<
    string,
    FleetImportRecord
  >();

  let inserted = 0;
  let updated = 0;

  for (const yacht of uniqueYachts) {
    const sourceKey = requiredString(yacht.sourceKey);

    if (!sourceKey) {
      throw new Error(
        `A parsed yacht named "${yacht.name}" has no sourceKey.`
      );
    }

    const name =
      requiredString(yacht.name) ??
      `Unnamed yacht ${sourceKey}`;

    const metadata = getMetadata(yacht);

    const currency =
      getString(metadata, "currency") ??
      getString(metadata, "rateCurrency") ??
      "EUR";

    const payload = buildFleetPayload({
      yacht,
      metadata,
      companyId,
      sourceId,
      sourceKey,
      name,
      currency,
      syncedAt,
    });

    const existing = existingByExternalId.get(sourceKey);

    if (existing) {
      const { data: updatedRow, error: updateError } =
        await supabase
          .from("fleet")
          .update(payload)
          .eq("id", existing.id)
          .eq("company_id", companyId)
          .select("id, external_id, name, currency")
          .single();

      if (updateError || !updatedRow) {
        throw new Error(
          `Could not update yacht "${name}": ${
            updateError?.message ?? "No row was returned."
          }`
        );
      }

      const result = updatedRow as ExistingFleetRow;

      yachtsBySourceKey.set(sourceKey, {
        id: result.id,
        externalId: result.external_id ?? sourceKey,
        name: result.name,
        currency: result.currency ?? currency,
      });

      updated += 1;
      continue;
    }

    const { data: insertedRow, error: insertError } =
      await supabase
        .from("fleet")
        .insert(payload)
        .select("id, external_id, name, currency")
        .single();

    if (insertError || !insertedRow) {
      throw new Error(
        `Could not insert yacht "${name}": ${
          insertError?.message ?? "No row was returned."
        }`
      );
    }

    const result = insertedRow as ExistingFleetRow;

    yachtsBySourceKey.set(sourceKey, {
      id: result.id,
      externalId: result.external_id ?? sourceKey,
      name: result.name,
      currency: result.currency ?? currency,
    });

    inserted += 1;
  }

  return {
    inserted,
    updated,
    total: inserted + updated,
    yachtsBySourceKey,
  };
}

function buildFleetPayload({
  yacht,
  metadata,
  companyId,
  sourceId,
  sourceKey,
  name,
  currency,
  syncedAt,
}: {
  yacht: NormalizedYacht;
  metadata: JsonRecord;
  companyId: string;
  sourceId: string;
  sourceKey: string;
  name: string;
  currency: string;
  syncedAt: string;
}) {
  return {
    company_id: companyId,
    source_id: sourceId,
    external_id: sourceKey,

    source_row_reference:
      getString(metadata, "sourceCell") ??
      getString(metadata, "sourceRowReference"),

    name,
    slug: slugify(name),

    yacht_type:
      getString(metadata, "yachtType") ??
      getString(metadata, "type"),

    builder: getString(metadata, "builder"),
    model: getString(metadata, "model"),

    build_year:
      getInteger(metadata, "buildYear") ??
      getInteger(metadata, "year"),

    refit_year: getInteger(metadata, "refitYear"),

    length_meters:
      getNumber(metadata, "lengthMeters") ??
      getNumber(metadata, "length"),

    beam_meters:
      getNumber(metadata, "beamMeters") ??
      getNumber(metadata, "beam"),

    draft_meters:
      getNumber(metadata, "draftMeters") ??
      getNumber(metadata, "draft"),

    guest_capacity:
      getInteger(metadata, "guestCapacity") ??
      getInteger(metadata, "guests"),

    sleeping_guests:
      getInteger(metadata, "sleepingGuests"),

    cruising_guests:
      getInteger(metadata, "cruisingGuests"),

    cabin_count:
      getInteger(metadata, "cabinCount") ??
      getInteger(metadata, "cabins"),

    crew_count:
      getInteger(metadata, "crewCount") ??
      getInteger(metadata, "crew"),

    home_port:
      getString(metadata, "homePort") ??
      getString(metadata, "port"),

    cruising_regions:
      getStringArray(metadata, "cruisingRegions") ??
      getStringArray(metadata, "regions") ??
      [],

    weekly_rate_low:
      getNumber(metadata, "weeklyRateLow") ??
      getNumber(metadata, "rateLow"),

    weekly_rate_high:
      getNumber(metadata, "weeklyRateHigh") ??
      getNumber(metadata, "rateHigh"),

    currency,

    amenities:
      getStringArray(metadata, "amenities") ?? [],

    description: getString(metadata, "description"),

    hero_image_url:
      getString(metadata, "heroImageUrl") ??
      getString(metadata, "imageUrl"),

    brochure_url:
      getString(metadata, "brochureUrl"),

    status:
      getString(metadata, "status") ??
      "active",

    is_featured:
      getBoolean(metadata, "isFeatured") ??
      false,

    raw_data: {
      parser_yacht: yacht,
      metadata,
    },

    source_updated_at:
      getDateString(metadata, "sourceUpdatedAt"),

    last_synced_at: syncedAt,
    updated_at: syncedAt,
  };
}

function deduplicateYachts(
  yachts: NormalizedYacht[]
): NormalizedYacht[] {
  const bySourceKey = new Map<string, NormalizedYacht>();

  for (const yacht of yachts) {
    const sourceKey = requiredString(yacht.sourceKey);

    if (!sourceKey) {
      continue;
    }

    bySourceKey.set(sourceKey, yacht);
  }

  return [...bySourceKey.values()];
}

function getMetadata(value: {
  metadata?: unknown;
}): JsonRecord {
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

function getNumber(
  record: JsonRecord,
  key: string
): number | null {
  const value = record[key];

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

function getInteger(
  record: JsonRecord,
  key: string
): number | null {
  const value = getNumber(record, key);

  return value === null
    ? null
    : Math.round(value);
}

function getBoolean(
  record: JsonRecord,
  key: string
): boolean | null {
  const value = record[key];

  return typeof value === "boolean"
    ? value
    : null;
}

function getStringArray(
  record: JsonRecord,
  key: string
): string[] | null {
  const value = record[key];

  if (Array.isArray(value)) {
    const values = value
      .filter(
        (item): item is string =>
          typeof item === "string"
      )
      .map((item) => item.trim())
      .filter(Boolean);

    return values;
  }

  if (typeof value === "string") {
    return value
      .split(/[,;|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return null;
}

function getDateString(
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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