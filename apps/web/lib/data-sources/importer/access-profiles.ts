import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Give every imported yacht an access profile, derived from its source.
 *
 * WHY THIS EXISTS
 *
 * `yacht_access_profiles` was already enforced at the point that matters:
 * /api/proposals refuses to put a yacht with access_type 'reference' in a
 * client-facing proposal. But nothing wrote profiles, so imported yachts had
 * none, and the proposal route's fallback filled the gap with:
 *
 *     access_type: "broker_access", client_proposal_permission: true
 *
 * Every imported hull was therefore treated as sellable. The enforcement was
 * real and the data it enforced against did not exist.
 *
 * WHY IT IS DERIVED FROM THE SOURCE
 *
 * A broker knows what a feed is when they connect it: our own fleet, a
 * partner's, a market reference sheet. Every yacht in that feed inherits it.
 * Asking per yacht would mean answering the same question forty times for one
 * upload, and the answer would be identical each time.
 *
 * WHAT AN UNCLASSIFIED SOURCE GETS
 *
 * The most restrictive profile available, not the most convenient one.
 *
 * An unclassified source is one nobody has told us about, and the two ways to
 * be wrong are not symmetrical. Treating a sellable yacht as reference-only
 * means a broker has to go and classify the source, which is mildly annoying
 * and self-correcting. Treating a reference-only yacht as sellable means a
 * client is quoted a hull the brokerage cannot deliver, which is discovered by
 * the client.
 */

export type SourceAccessClassification = {
  access_type: string | null;
  calendar_authority: string | null;
  booking_model: string | null;
};

type ProfileRow = {
  company_id: string;
  fleet_id: string;
  access_type: string;
  calendar_authority: string;
  booking_model: string;
  client_proposal_permission: boolean;
  public_listing_permission: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Only a yacht the brokerage controls or manages may reach a client without a
 * further check, and a reference yacht may never reach one at all.
 *
 * Expressed as a lookup rather than a chain of conditionals because it is a
 * policy table, and a policy table should be readable as one.
 */
const PROPOSAL_PERMISSION: Record<string, boolean> = {
  controlled: true,
  managed: true,
  broker_access: true,
  reference: false,
};

/**
 * Public listing is narrower than proposing. A partner's yacht can be offered
 * to a named client who asked; putting it on a public page implies the
 * brokerage represents it.
 */
const LISTING_PERMISSION: Record<string, boolean> = {
  controlled: true,
  managed: true,
  broker_access: false,
  reference: false,
};

/** Sensible booking model when a source names an access type but no model. */
const DEFAULT_BOOKING_MODEL: Record<string, string> = {
  controlled: "direct",
  managed: "confirmation_required",
  broker_access: "owner_approval_required",
  reference: "reference_only",
};

/** Who owns the calendar, when the source has not said. */
const DEFAULT_CALENDAR_AUTHORITY: Record<string, string> = {
  controlled: "our_company",
  managed: "charter_manager",
  broker_access: "owner",
  reference: "unknown",
};

export function resolveAccessProfile(
  source: SourceAccessClassification | null
): {
  accessType: string;
  calendarAuthority: string;
  bookingModel: string;
  clientProposalPermission: boolean;
  publicListingPermission: boolean;
  isUnclassified: boolean;
} {
  const accessType = source?.access_type ?? null;

  if (!accessType || !(accessType in PROPOSAL_PERMISSION)) {
    return {
      accessType: "reference",
      calendarAuthority: "unknown",
      bookingModel: "reference_only",
      clientProposalPermission: false,
      publicListingPermission: false,
      isUnclassified: true,
    };
  }

  return {
    accessType,
    calendarAuthority:
      source?.calendar_authority ??
      DEFAULT_CALENDAR_AUTHORITY[accessType] ??
      "unknown",
    bookingModel:
      source?.booking_model ?? DEFAULT_BOOKING_MODEL[accessType] ?? "reference_only",
    clientProposalPermission: PROPOSAL_PERMISSION[accessType] ?? false,
    publicListingPermission: LISTING_PERMISSION[accessType] ?? false,
    isUnclassified: false,
  };
}

/**
 * Write a profile for each imported yacht.
 *
 * Upserted on (company_id, fleet_id), so re-syncing a source refreshes the
 * profile it wrote rather than accumulating duplicates or silently keeping a
 * stale classification after the broker corrects the source.
 *
 * A broker who has edited one yacht's profile by hand will see that edit
 * overwritten on the next sync. That is the intended precedence: the source
 * classification is the standing answer, and a per-yacht exception should be
 * expressed by splitting the source rather than by an edit the next sync
 * quietly reverts.
 */
export async function importAccessProfiles({
  supabase,
  companyId,
  fleetIds,
  source,
  syncedAt,
  createdBy = null,
}: {
  supabase: SupabaseClient;
  companyId: string;
  fleetIds: string[];
  source: SourceAccessClassification | null;
  syncedAt: string;
  createdBy?: string | null;
}): Promise<{ written: number; unclassified: boolean }> {
  if (fleetIds.length === 0) {
    return { written: 0, unclassified: false };
  }

  const resolved = resolveAccessProfile(source);

  const rows: ProfileRow[] = fleetIds.map((fleetId) => ({
    company_id: companyId,
    fleet_id: fleetId,
    access_type: resolved.accessType,
    calendar_authority: resolved.calendarAuthority,
    booking_model: resolved.bookingModel,
    client_proposal_permission: resolved.clientProposalPermission,
    public_listing_permission: resolved.publicListingPermission,
    notes: resolved.isUnclassified
      ? "Source is not classified. Treated as reference until an access type is set on the data source."
      : null,
    created_by: createdBy,
    created_at: syncedAt,
    updated_at: syncedAt,
  }));

  const { error } = await supabase
    .from("yacht_access_profiles")
    .upsert(rows, { onConflict: "company_id,fleet_id" });

  /*
   * Thrown rather than logged. An import that writes fleet rows but no
   * profiles leaves exactly the state this module exists to prevent: yachts
   * with no profile, which the proposal route treats as broker-access and
   * proposable. Failing the sync is the safe direction.
   */
  if (error) {
    throw new Error(
      `Could not write access profiles: ${error.message}`
    );
  }

  return {
    written: rows.length,
    unclassified: resolved.isUnclassified,
  };
}