import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  RETENTION_YEARS_ACCOUNTING_RECORDS,
  retentionUntil,
} from "./retention";

/**
 * Execute an accepted erasure request.
 *
 * Runs in three passes, in this order, and the order is the point.
 *
 *   1. IMMEDIATE   Art. 9 health data and every live share token. No
 *                  retention basis exists for either, and a token outliving
 *                  the data it points at is the worst possible outcome.
 *
 *   2. RESTRICT    Records under §147 AO / §257 HGB. Hidden from the
 *                  application under Art. 18, kept for the tax authority,
 *                  stamped with the date they may finally go.
 *
 *   3. ERASE       Everything with no retention basis: inquiries, proposals,
 *                  notifications, portals, connected mailboxes.
 *
 * Clients attached to a retained charter are anonymised rather than deleted.
 * The charter needs a counterparty for the tax record; it does not need a
 * name, an email or a phone number.
 *
 * Runs under the service role. The cascade crosses every table and touches
 * auth users, so it must not be expressible through a normal session.
 */

export type DeletionScope = "member" | "company" | "client";

export type DeletionOutcome = {
  deleted: Record<string, number>;
  restricted: Record<string, number>;
  anonymized: Record<string, number>;
};

/** Art. 9(1): health data. No commercial retention basis, so it goes first. */
async function eraseSpecialCategoryData(
  admin: SupabaseClient,
  companyId: string,
  outcome: DeletionOutcome
): Promise<void> {
  const guests = await admin
    .from("charter_guests")
    .delete()
    .eq("company_id", companyId)
    .select("id");

  if (guests.error) {
    throw new Error(
      `Could not erase guest health data: ${guests.error.message}`
    );
  }

  outcome.deleted.charter_guests = guests.data?.length ?? 0;

  const portals = await admin
    .from("guest_portals")
    .delete()
    .eq("company_id", companyId)
    .select("id");

  if (portals.error) {
    throw new Error(`Could not erase guest portals: ${portals.error.message}`);
  }

  outcome.deleted.guest_portals = portals.data?.length ?? 0;
}

/**
 * Every link that can still be opened by someone holding a URL.
 *
 * Revoking is not enough. A revoked row is a row, and the point of this pass
 * is that no path into the data survives the request.
 */
async function revokeShareTokens(
  admin: SupabaseClient,
  companyId: string,
  outcome: DeletionOutcome
): Promise<void> {
  for (const table of [
    "proposal_share_links",
    "charter_itinerary_shares",
  ] as const) {
    const result = await admin
      .from(table)
      .delete()
      .eq("company_id", companyId)
      .select("id");

    if (result.error) {
      throw new Error(
        `Could not revoke ${table}: ${result.error.message}`
      );
    }

    outcome.deleted[table] = result.data?.length ?? 0;
  }
}

/**
 * Art. 18: hide, stamp, keep.
 *
 * The retention clock starts at the end of the calendar year the record arose
 * in, per §147(4) AO, which retentionUntil handles. A charter with no start
 * date falls back to now, which over-retains slightly. That is the safe
 * direction: over-retaining is a minimisation problem, under-retaining is
 * §379 AO.
 */
async function restrictRetainedRecords(
  admin: SupabaseClient,
  companyId: string,
  outcome: DeletionOutcome
): Promise<void> {
  const now = new Date();

  const charters = await admin
    .from("charters")
    .select("id, start_date, created_at")
    .eq("company_id", companyId)
    .is("restricted_at", null);

  if (charters.error) {
    throw new Error(`Could not read charters: ${charters.error.message}`);
  }

  for (const charter of charters.data ?? []) {
    const basis =
      charter.start_date ?? charter.created_at ?? now.toISOString();

    const expiry = retentionUntil(
      new Date(basis),
      RETENTION_YEARS_ACCOUNTING_RECORDS
    );

    const update = await admin
      .from("charters")
      .update({
        restricted_at: now.toISOString(),
        retention_until: expiry.toISOString().slice(0, 10),
      })
      .eq("id", charter.id)
      .eq("company_id", companyId);

    if (update.error) {
      throw new Error(
        `Could not restrict charter ${charter.id}: ${update.error.message}`
      );
    }
  }

  outcome.restricted.charters = charters.data?.length ?? 0;

  /*
   * No `proposals` table exists: a proposal is an `inquiries` row with
   * `proposal_yachts` attached, and inquiries are erased in the pass below.
   * Listing one here failed against the real schema.
   */
  for (const table of [
    "charter_payment_schedule",
    "documents",
  ] as const) {
    const result = await admin
      .from(table)
      .update({ restricted_at: now.toISOString() })
      .eq("company_id", companyId)
      .is("restricted_at", null)
      .select("id");

    if (result.error) {
      throw new Error(`Could not restrict ${table}: ${result.error.message}`);
    }

    outcome.restricted[table] = result.data?.length ?? 0;
  }
}

/**
 * Replace identifying fields with a stable pseudonym.
 *
 * Stable rather than random so a retained charter still reads coherently to
 * an auditor: the same counterparty across three charters remains recognisably
 * one counterparty, without being a person.
 */
async function anonymizeClients(
  admin: SupabaseClient,
  companyId: string,
  outcome: DeletionOutcome
): Promise<void> {
  const now = new Date().toISOString();

  const clients = await admin
    .from("clients")
    .select("id")
    .eq("company_id", companyId)
    .is("anonymized_at", null);

  if (clients.error) {
    throw new Error(`Could not read clients: ${clients.error.message}`);
  }

  for (const [index, client] of (clients.data ?? []).entries()) {
    const update = await admin
      .from("clients")
      .update({
        name: `Erased client ${index + 1}`,
        email: null,
        phone: null,
        notes: null,
        anonymized_at: now,
      })
      .eq("id", client.id)
      .eq("company_id", companyId);

    if (update.error) {
      throw new Error(
        `Could not anonymise client ${client.id}: ${update.error.message}`
      );
    }
  }

  outcome.anonymized.clients = clients.data?.length ?? 0;
}

/** No retention basis, no reason to keep any of it. */
async function eraseOperationalData(
  admin: SupabaseClient,
  companyId: string,
  outcome: DeletionOutcome
): Promise<void> {
  for (const table of [
    "email_drafts",
    "email_connections",
    "notifications",
    "availability_checks",
    "inquiries",
  ] as const) {
    const result = await admin
      .from(table)
      .delete()
      .eq("company_id", companyId)
      .select("id");

    if (result.error) {
      throw new Error(`Could not erase ${table}: ${result.error.message}`);
    }

    outcome.deleted[table] = result.data?.length ?? 0;
  }
}

export async function executeDeletion({
  admin,
  companyId,
  scope,
}: {
  admin: SupabaseClient;
  companyId: string;
  scope: DeletionScope;
}): Promise<DeletionOutcome> {
  const outcome: DeletionOutcome = {
    deleted: {},
    restricted: {},
    anonymized: {},
  };

  /*
   * A member leaving takes nothing with them. The inquiries and charters they
   * created belong to the brokerage, not to the person who typed them, so
   * only the membership row goes and authorship is detached by the caller.
   */
  if (scope === "member") {
    return outcome;
  }

  await eraseSpecialCategoryData(admin, companyId, outcome);
  await revokeShareTokens(admin, companyId, outcome);
  await restrictRetainedRecords(admin, companyId, outcome);
  await anonymizeClients(admin, companyId, outcome);
  await eraseOperationalData(admin, companyId, outcome);

  return outcome;
}