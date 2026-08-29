-- ============================================================================
-- 20260824_0013_add_charter_contract_links.sql
--
-- A shareable link for the signed-agreement stage of a charter.
--
-- The contract tab can already generate a PDF and mail it through Gmail. That
-- covers the case where the broker has a working Google connection and the
-- client reads attachments. Neither is reliable: 2.3MB agreements are dropped
-- by corporate mail filters, forwarded attachments go stale the moment a v2 is
-- generated, and a broker without Gmail connected has no delivery path at all.
--
-- A link solves those. The client always sees the current version, the broker
-- can send it over WhatsApp or any channel they already use, and opens are
-- recorded so "did they get it" stops being a phone call.
--
-- This table mirrors proposal_share_links deliberately. That pattern is
-- already understood in this codebase, its public route is already written
-- against a token hash, and copying it means one mental model for both links
-- rather than two half-remembered ones.
--
-- SECURITY
--
-- Only the SHA-256 hash of the token is stored. A database leak therefore
-- yields no working links. This matches proposal_share_links, and corrects
-- the inconsistency noted for itinerary share tokens, which are still held in
-- plaintext.
--
-- The token is a 32-byte base64url value, so guessing is not a practical
-- attack. Expiry and revocation exist for the realistic case instead: a link
-- forwarded beyond the person it was meant for.
-- ============================================================================

create table if not exists public.charter_contract_links (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  charter_id uuid not null
    references public.charters(id)
    on delete cascade,

  /*
   * Hash only. The raw token is returned once, when the link is created, and
   * is never recoverable afterwards. Rotating is cheap; storing a recoverable
   * secret to save that is not a trade worth making.
   */
  token_hash text not null,

  is_active boolean not null default true,
  expires_at timestamptz,
  revoked_at timestamptz,

  last_opened_at timestamptz,
  opened_count integer not null default 0,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.charter_contract_links is
  'Expiring, revocable public links to a charter agreement PDF. Only the token hash is stored.';

comment on column public.charter_contract_links.token_hash is
  'SHA-256 of the raw token. Public lookup hashes the incoming token and matches on this column.';

/*
 * The public route's only query is by token hash, on every page load of a
 * link a client may refresh several times. Unique because two links sharing a
 * hash would make that lookup ambiguous, and a collision means something has
 * gone wrong that should fail loudly rather than resolve arbitrarily.
 */
create unique index if not exists charter_contract_links_token_hash_idx
  on public.charter_contract_links (token_hash);

-- The broker-facing query: the active link for this charter, if any.
create index if not exists charter_contract_links_charter_idx
  on public.charter_contract_links (company_id, charter_id, is_active);

-- ---------------------------------------------------------------- RLS

alter table public.charter_contract_links enable row level security;

/*
 * Application queries run through the service-role client, which bypasses
 * RLS. These policies are the second line of defence for the case where a
 * handler forgets its company_id filter, matching the reasoning in
 * 20260821_0011.
 *
 * Written against is_company_member, which already exists from that
 * migration.
 */
drop policy if exists charter_contract_links_member_read
  on public.charter_contract_links;

create policy charter_contract_links_member_read
  on public.charter_contract_links
  for select
  to authenticated
  using (public.is_company_member(company_id));

drop policy if exists charter_contract_links_member_write
  on public.charter_contract_links;

create policy charter_contract_links_member_write
  on public.charter_contract_links
  for all
  to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

-- ---------------------------------------------------------------- verify

do $$
begin
  if not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relname = 'charter_contract_links'
  ) then
    raise exception
      'charter_contract_links has RLS enabled with no policy: deny-all for authenticated users.';
  end if;

  raise notice 'charter_contract_links: created with member read and write policies';
end
$$;