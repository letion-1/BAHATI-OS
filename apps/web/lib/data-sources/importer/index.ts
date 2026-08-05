import { importAvailability } from "./availability";
import { importFleet } from "./fleet";

import type {
  ImportParsedWorkbookInput,
  WorkbookImportResult,
} from "./types";

export type {
  AvailabilityImportResult,
  FleetImportRecord,
  FleetImportResult,
  ImportAvailabilityInput,
  ImportContext,
  ImportParsedWorkbookInput,
  ImportYachtsInput,
  WorkbookImportResult,
} from "./types";

export async function importParsedWorkbook({
  supabase,
  companyId,
  sourceId,
  syncedAt,
  parsed,
}: ImportParsedWorkbookInput): Promise<WorkbookImportResult> {
  const fleet = await importFleet({
    supabase,
    companyId,
    sourceId,
    syncedAt,
    yachts: parsed.yachts,
  });

  const availability = await importAvailability({
    supabase,
    companyId,
    sourceId,
    syncedAt,
    availability: parsed.availability,
    yachtsBySourceKey: fleet.yachtsBySourceKey,
  });

  return {
    parser: {
      parserId: parsed.parserId,
      layout: parsed.layout,
      confidence: parsed.confidence,
      warnings: parsed.warnings,
    },

    fleet: {
      inserted: fleet.inserted,
      updated: fleet.updated,
      total: fleet.total,
    },

    availability: {
      deleted: availability.deleted,
      inserted: availability.inserted,
      skipped: availability.skipped,
      total: availability.total,
    },
  };
}