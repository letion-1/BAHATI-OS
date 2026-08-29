-- ============================================================================
-- 20260829_0015_restrict_processing_rls.sql
--
-- Make Art. 18 restriction of processing real.
--
-- The previous migration added `restricted_at` to the tables under German
-- retention obligations, and the deletion worker sets it. On its own that is a
-- column nobody reads: a restricted charter still appears in the charter list,
-- still matches searches, still opens. The record is "restricted" in name only,
-- which is the worst of both worlds — the appearance of compliance without it.
--
-- Art. 18(2) is specific about what restricted means. Beyond storage, the data
-- may only be processed with consent, for legal claims, to protect another
-- person, or in the public interest. Ordinary business use by the brokerage is
-- none of those. So the rows have to leave the application entirely while
-- remaining in the database for §147 AO.
--
-- WHY RLS RATHER THAN QUERY FILTERS
--
-- The alternative was adding `.is("restricted_at", null)` to every query that
-- touches these four tables. There are dozens, spread across API routes,
-- server components and the proposal builder, and the failure mode is silent:
-- one forgotten filter exposes restricted data with nothing to signal it.
--
-- A policy cannot be forgotten. Anything reached through an authenticated
-- session gets the filter whether or not the developer remembered, and new
-- code written next year inherits it for free.
--
-- THE SERVICE ROLE STILL SEES EVERYTHING
--
-- Deliberate, and the reason the retention obligation can still be met. A tax
-- auditor's export, and the worker that eventually hard-deletes these rows
-- once `retention_until` passes, both run under the service role and bypass
-- RLS. What must never happen is a broker seeing them in the product.
-- ============================================================================

begin;

do $$
declare
  target text;
  policy_name text;
begin
  /*
   * These three carry retention obligations under §147 AO / §257 HGB, so they
   * are the three the deletion worker restricts rather than deletes.
   *
   * `proposals` was listed here in an earlier draft and does not exist: a
   * proposal is an `inquiries` row with `proposal_yachts` attached. See the
   * note in migration 0014 about whether a sent proposal is a Handelsbrief
   * and therefore belongs in this list after all.
   *
   * charter_guests is deliberately absent: Art. 9 health data has no
   * retention basis and is hard-deleted, so there is never a restricted row
   * to hide.
   */
  foreach target in array array[
    'charters',
    'charter_payment_schedule',
    'documents'
  ]
  loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = target
    ) then
      raise notice '%: table missing, skipped', target;
      continue;
    end if;

    policy_name := target || '_tenant_isolation';

    execute format('drop policy if exists %I on public.%I', policy_name, target);

    /*
     * Same tenant check as before, with the restriction filter added.
     *
     * It appears in USING and WITH CHECK for a reason. USING alone would hide
     * restricted rows from reads while still allowing an UPDATE that happened
     * to target one by id, which would be processing restricted data — the
     * exact thing Art. 18 forbids. With both, a restricted row cannot be read,
     * changed, or deleted through a session.
     */
    execute format($p$
      create policy %I on public.%I
        for all
        to authenticated
        using (
          public.is_company_member(company_id)
          and restricted_at is null
        )
        with check (
          public.is_company_member(company_id)
          and restricted_at is null
        )
    $p$, policy_name, target);

    raise notice '%: restricted rows now hidden from authenticated sessions', target;
  end loop;
end $$;

/*
 * Anonymised clients are NOT hidden.
 *
 * They stay visible because a retained charter has to keep a counterparty for
 * the tax record, and a charter pointing at an invisible client reads as data
 * corruption to whoever opens it. The personal data is already gone from the
 * row: name replaced with a pseudonym, email, phone and notes cleared. What
 * remains identifies nobody, so there is nothing left to restrict.
 */

comment on column public.charters.restricted_at is
  'Set when Art. 18 restriction of processing applies. RLS hides these rows from authenticated sessions; the service role still sees them so the §147 AO retention obligation can be met.';

commit;