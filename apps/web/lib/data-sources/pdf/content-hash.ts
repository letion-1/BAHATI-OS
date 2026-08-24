import "server-only";

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Duplicate upload detection.
 *
 * The preview endpoint used to write, so confirming an upload produced two
 * data sources for one file. That specific bug is fixed, but it left a real
 * gap behind: nothing ever stopped the same file being imported twice, and
 * once it is, every yacht in it appears twice in the availability timeline.
 *
 * That happens because importFleet scopes its dedupe to a single source:
 *
 *     .eq("company_id", companyId).eq("source_id", sourceId)
 *
 * A second data source for the same file is a different source_id, so the same
 * yacht is an insert rather than an update. M/Y Neptune and M/Y Ocean Pearl
 * each appearing twice on one timeline is exactly this.
 *
 * The dedupe is deliberately not widened to match across sources. Two
 * different brokers legitimately list the same hull, and merging those rows
 * would silently attribute one partner's availability to another's feed. The
 * duplicate is stopped at the door instead, where the intent is unambiguous:
 * byte-identical file, same company, already imported.
 */

/** Same bytes, same file. Cheap, exact, and no migration to store. */
export function hashPdfContent(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export type DuplicateSource = {
  id: string;
  name: string;
  importedAt: string | null;
};

/**
 * Find an existing import of the same bytes for this company.
 *
 * The hash lives in the configuration jsonb rather than its own column, so
 * this ships without a migration. If duplicate checks ever become hot enough
 * to matter, the index to add is:
 *
 *   create index data_sources_content_hash_idx
 *     on data_sources ((configuration ->> 'contentHash'))
 *     where configuration ->> 'contentHash' is not null;
 */
export async function findDuplicateUpload({
  supabase,
  companyId,
  contentHash,
}: {
  supabase: SupabaseClient;
  companyId: string;
  contentHash: string;
}): Promise<DuplicateSource | null> {
  const { data, error } = await supabase
    .from("data_sources")
    .select("id, name, last_synced_at, created_at")
    .eq("company_id", companyId)
    .eq("configuration->>contentHash", contentHash)
    .order("created_at", { ascending: true })
    .limit(1);

  /*
   * A failed lookup must not block the import.
   *
   * This check exists to prevent an inconvenience, not to enforce an
   * invariant. Refusing to import a broker's availability because a
   * convenience query failed would be the worse outcome of the two, so the
   * error is logged and the upload proceeds.
   */
  if (error) {
    console.error("Duplicate upload check failed:", error);
    return null;
  }

  const existing = data?.[0];

  if (!existing) {
    return null;
  }

  return {
    id: existing.id as string,
    name: (existing.name as string) ?? "an earlier upload",
    importedAt:
      (existing.last_synced_at as string | null) ??
      (existing.created_at as string | null) ??
      null,
  };
}