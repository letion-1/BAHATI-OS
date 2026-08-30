import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  NormalizedAvailability,
  NormalizedYacht,
  ParserResult,
} from "@/lib/data-sources/parsers/types";

export type ImportSupabaseClient = SupabaseClient;

export type ImportContext = {
  supabase: ImportSupabaseClient;
  companyId: string;
  sourceId: string;
  syncedAt: string;
};

export type FleetImportRecord = {
  id: string;
  externalId: string;
  name: string;
  currency: string;
};

export type FleetImportResult = {
  inserted: number;
  updated: number;
  total: number;
  yachtsBySourceKey: Map<string, FleetImportRecord>;
};

export type AvailabilityImportResult = {
  deleted: number;
  inserted: number;
  skipped: number;
  total: number;
};

export type WorkbookImportResult = {
  access?: {
    profilesWritten: number;
    /** True when the source has no access_type, so yachts defaulted to reference. */
    unclassified: boolean;
  };
  parser: {
    parserId: string;
    layout: string;
    confidence: number;
    warnings: string[];
  };

  fleet: {
    inserted: number;
    updated: number;
    total: number;
  };

  availability: {
    deleted: number;
    inserted: number;
    skipped: number;
    total: number;
  };
};

export type ImportYachtsInput = ImportContext & {
  yachts: NormalizedYacht[];
};

export type ImportAvailabilityInput = ImportContext & {
  availability: NormalizedAvailability[];
  yachtsBySourceKey: Map<string, FleetImportRecord>;
};

export type ImportParsedWorkbookInput = ImportContext & {
  parsed: ParserResult;
};