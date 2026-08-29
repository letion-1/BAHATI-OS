-- ============================================================================
-- 20260829_0014_add_account_deletion.sql
--
-- Account deletion under Art. 17 GDPR, and the German retention law that
-- partially overrides it.
--
-- THE CONFLICT THIS TABLE EXISTS TO RESOLVE
--
-- Art. 17(1) gives a data subject the right to erasure. Art. 17(3)(b) suspends
-- that right where processing is necessary for compliance with a legal
-- obligation, and German commercial and tax law imposes several:
--
--   §147(1) Nr. 1, 4a AO  books, inventories, annual accounts   10 years
--   §147(1) Nr. 4 AO      Buchungsbelege, invoices               8 years
--   §147(1) Nr. 2, 3 AO   commercial letters, incl. email        6 years
--   §257(4) HGB           mirrors the above in commercial law
--
-- The eight-year figure is recent. Buchungsbelege were ten years until the
-- Viertes Bürokratieentlastungsgesetz shortened them with effect from
-- 1 January 2025, applying to any document whose old period had not already
-- expired by 31 December 2024. Anything written before that date against the
-- old ten-year rule is now over-retaining.
--
-- §147(3) Satz 5 AO adds a condition that no fixed number captures: the period
-- does not end while the documents still matter for a tax whose assessment
-- period under §169 AO is still open. An audit in progress extends it. That is
-- why `retention_until` is a column holding a date rather than a period
-- computed on read: a human has to be able to push it out.
--
-- So a signed charter agreement cannot be deleted on request. The answer is
-- Art. 18 restriction of processing instead: the row survives, is hidden from
-- the application, and remains reachable only for the legal purpose that
-- requires it.
--
-- WHAT IS NOT SUBJECT TO ANY OF THIS
--
-- charter_guests holds allergies, dietary requirements and accessibility
-- needs. That is Art. 9 special-category health data with no commercial
-- retention basis at all. It is deleted immediately on request, before
-- anything else, and it is the reason this migration exists at all rather
-- than a soft-delete flag on companies.
--
-- NOT LEGAL ADVICE
--
-- The periods below are drawn from the published statutes and from IHK and
-- tax-advisory summaries of them, not from counsel retained for this product.
-- They are defined once, in lib/gdpr/retention.ts, so that a lawyer can change
-- them in one place. Whether a charter agreement is a Buchungsbeleg at 8 years
-- or a Handelsbrief at 6 is exactly the sort of question this file cannot
-- answer for you.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Deletion requests
-- ---------------------------------------------------------------------------

create table if not exists public.deletion_requests (
  id uuid primary key default gen_random_uuid(),

  /*
   * Which company the request concerns. Retained even for a member-scope
   * request, because that is what every RLS policy in this schema filters on
   * and a request nobody can see is a request nobody can cancel.
   */
  company_id uuid not null
    references public.companies (id) on delete cascade,

  /*
   * 'member'  one person leaves a workspace. Their identity goes; the
   *           inquiries and charters they created belong to the company and
   *           stay, with authorship detached.
   *
   * 'company' the brokerage closes its account. Art. 28(3)(g): as processor,
   *           delete or return the personal data on termination of services.
   *
   * 'client'  a client or guest has asked the broker to erase them. The
   *           broker is the controller here; this platform assists under
   *           Art. 28(3)(e).
   */
  scope text not null
    check (scope in ('member', 'company', 'client')),

  /** Set for scope 'member'. The auth user being removed. */
  subject_user_id uuid,

  /** Set for scope 'client'. The client row being erased. */
  subject_client_id uuid
    references public.clients (id) on delete set null,

  requested_by uuid,

  /*
   * Free text from the requester. Not required: Art. 17 does not oblige a
   * data subject to justify the request, and a mandatory reason field would
   * imply otherwise.
   */
  reason text,

  requested_at timestamptz not null default now(),

  /*
   * When the cascade runs. Art. 12(3) allows one month to respond, so a grace
   * period costs nothing legally and buys back the mistaken click, which is
   * the most likely way a broker loses a season of work.
   *
   * Art. 9 data and live share tokens do NOT wait for this. They are cleared
   * as soon as the request is accepted.
   */
  scheduled_for timestamptz not null,

  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'cancelled', 'failed')),

  cancelled_at timestamptz,
  cancelled_by uuid,
  completed_at timestamptz,

  /*
   * What the run actually did, per table. Art. 5(2) puts the burden of
   * demonstrating compliance on the controller, and "we believe it ran" is
   * not a demonstration. Counts only, never the deleted values.
   */
  execution_log jsonb not null default '{}'::jsonb,

  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deletion_requests_company_idx
  on public.deletion_requests (company_id);

/*
 * Partial index on the due queue. The worker asks "what is pending and ripe"
 * on a schedule; it should not scan completed history to find out.
 */
create index if not exists deletion_requests_due_idx
  on public.deletion_requests (scheduled_for)
  where status = 'pending';

/*
 * One live request per subject. Without this, a broker clicking twice creates
 * two cascades that race, and the second fails confusingly against rows the
 * first already removed.
 */
create unique index if not exists deletion_requests_one_live_company_idx
  on public.deletion_requests (company_id)
  where status in ('pending', 'processing') and scope = 'company';

create unique index if not exists deletion_requests_one_live_member_idx
  on public.deletion_requests (company_id, subject_user_id)
  where status in ('pending', 'processing') and scope = 'member';

-- ---------------------------------------------------------------------------
-- Restriction of processing, Art. 18
-- ---------------------------------------------------------------------------

/*
 * Added to the tables that carry a retention obligation. A restricted row is
 * invisible to the application but present for the tax authority.
 *
 * The alternative was moving these rows to an archive schema. Rejected: it
 * doubles the schema, and every join in the product would have to know about
 * both halves. A nullable timestamp that RLS already understands is smaller
 * and harder to get wrong.
 */

alter table public.charters
  add column if not exists restricted_at timestamptz,
  add column if not exists retention_until date;

alter table public.charter_payment_schedule
  add column if not exists restricted_at timestamptz;

/*
 * There is no `proposals` table. An earlier draft of this migration altered
 * one and failed on deploy.
 *
 * A proposal in this schema is an `inquiries` row with `proposal_yachts`
 * hanging off it, which is why `proposal_yachts.proposal_id` points at an
 * inquiry. Inquiries are erased outright by the deletion worker rather than
 * restricted.
 *
 * Whether that is correct is a live question, flagged rather than assumed: a
 * proposal sent to a client may be a Handelsbrief under §147(1) Nr. 2 AO,
 * which would put it under a six-year retention obligation and mean it should
 * be restricted here instead of deleted. That classification needs a lawyer,
 * not a guess in a migration.
 */

alter table public.documents
  add column if not exists restricted_at timestamptz;

/*
 * Anonymisation rather than deletion, for clients attached to a retained
 * charter. The charter has to keep a counterparty for the tax record; it does
 * not have to keep a name, an email or a phone number.
 */
alter table public.clients
  add column if not exists anonymized_at timestamptz;

create index if not exists charters_restricted_idx
  on public.charters (company_id)
  where restricted_at is not null;

create index if not exists clients_anonymized_idx
  on public.clients (company_id)
  where anonymized_at is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.deletion_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'deletion_requests'
      and policyname = 'deletion_requests_company_access'
  ) then
    /*
     * Members of the company can see and raise requests. Execution runs under
     * the service role and bypasses this, which is deliberate: the cascade
     * touches auth users and rows across every table, and it must not be
     * expressible through a normal session.
     */
    create policy deletion_requests_company_access
      on public.deletion_requests
      for all
      to authenticated
      using (public.is_company_member(company_id))
      with check (public.is_company_member(company_id));
  end if;
end $$;

comment on table public.deletion_requests is
  'Art. 17 GDPR erasure requests. Art. 9 data and share tokens are cleared on acceptance; records under §147 AO / §257 HGB retention are restricted under Art. 18 rather than deleted, until retention_until passes.';

comment on column public.charters.retention_until is
  'Date the §147 AO retention period ends. Extend by hand if a tax audit is open: §147(3) Satz 5 AO stops the period expiring while the §169 AO assessment period is still running.';

commit;