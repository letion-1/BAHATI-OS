import { importAvailability } from "./availability";
import { importFleet } from "./fleet";
import { importAccessProfiles } from "./access-profiles";

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

  /*
   * Read after the fleet import rather than before, so a source classified
   * mid-import still applies on this run rather than the next one.
   *
   * Selected with maybeSingle: a source row that has vanished mid-sync is a
   * null classification, which resolveAccessProfile treats as unclassified
   * and therefore reference-only. That is the right answer for a source
   * nobody can look up.
   */
  const { data: sourceRow } = await supabase
    .from("data_sources")
    .select("access_type, calendar_authority, booking_model")
    .eq("id", sourceId)
    .eq("company_id", companyId)
    .maybeSingle();

  const access = await importAccessProfiles({
    supabase,
    companyId,
    fleetIds: [...fleet.yachtsBySourceKey.values()].map(
      (record) => record.id
    ),
    source: sourceRow ?? null,
    syncedAt,
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

    /*
     * Surfaced rather than kept internal. A sync that imported forty yachts
     * as reference-only because nobody classified the source looks identical
     * to a successful one from the outside, and the broker would only find
     * out when a yacht failed to appear in a proposal.
     */
    access: {
      profilesWritten: access.written,
      unclassified: access.unclassified,
    },
  };
}