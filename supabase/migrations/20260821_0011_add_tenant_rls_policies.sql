-- ============================================================================
-- 20260821_0011_add_tenant_rls_policies.sql
--
-- Row Level Security policies for every company-scoped table.
--
-- THE PROBLEM
--
-- Eleven tables currently run `enable row level security` with zero policies
-- defined. In Postgres that means deny-all for the `authenticated` role. The
-- application works anyway because it routes those queries through the
-- service-role key, which bypasses RLS entirely.
--
-- The practical effect is that tenant isolation depends solely on every
-- handler remembering to write `.eq("company_id", ...)`. There is no second
-- line of defence. One forgotten filter is a cross-tenant data leak, and the
-- tables in that set hold passport readiness, dates of birth, allergies and
-- accessibility requirements.
--
-- It also produces a subtler failure: a query against these tables using the
-- browser client returns zero rows rather than an error. Guards written that
-- way silently pass. That has already caused three bugs in this codebase.
--
-- SAFETY
--
-- Verified before writing this migration:
--   * 117 queries against these tables use the service-role client
--   * 0 queries use the browser client
--
-- Service role has BYPASSRLS, so adding policies cannot break an existing
-- read or write. This migration hardens the database without changing
-- application behaviour.
--
-- WHAT IT DOES NOT DO
--
-- It does not cover the core tables (inquiries, fleet, clients, proposals,
-- availability, documents, notifications, data_sources). Those were created
-- outside this migrations directory and are not in version control, so their
-- exact shape cannot be verified here. Run `supabase db pull` to commit the
-- baseline, then extend the table list at the bottom of this file.
-- ============================================================================

-- ---------------------------------------------------------------- helpers

/*
 * SECURITY DEFINER so the function can read company_members without being
 * subject to that table's own policy, which would otherwise recurse.
 *
 * STABLE so Postgres evaluates it once per statement rather than once per
 * row. On a large table the difference is minutes.
 *
 * search_path is pinned. Without it, a caller can prepend a schema they
 * control and have this function resolve `company_members` to their own
 * table. That is the standard SECURITY DEFINER escalation.
 *
 * `(select auth.uid())` rather than a bare call, so the planner treats it as
 * a constant per statement instead of re-evaluating per row.
 */
create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = target_company_id
      and cm.user_id = (select auth.uid())
  );
$$;

comment on function public.is_company_member(uuid) is
  'True when the current authenticated user holds a membership in the given company. Used by every tenant RLS policy.';

revoke all on function public.is_company_member(uuid) from public;
grant execute on function public.is_company_member(uuid) to authenticated;


create or replace function public.has_company_role(
  target_company_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = target_company_id
      and cm.user_id = (select auth.uid())
      and cm.role = any(allowed_roles)
  );
$$;

comment on function public.has_company_role(uuid, text[]) is
  'True when the current user holds one of the given roles in the company.';

revoke all on function public.has_company_role(uuid, text[]) from public;
grant execute on function public.has_company_role(uuid, text[]) to authenticated;


-- ---------------------------------------------------------------- policies

/*
 * Applied by loop rather than written out eleven times, so a table added
 * later picks up the same policy by adding one name to the array.
 *
 * FOR ALL with both USING and WITH CHECK: USING governs which rows are
 * visible to select, update and delete; WITH CHECK governs what insert and
 * update may write. Without WITH CHECK, a user could move a row out of their
 * own company and into someone else's.
 */
do $$
declare
  target text;
  policy_name text;
  company_scoped text[] := array[
    'proposal_confirmations',
    'charters',
    'charter_payment_schedule',
    'charter_concierge_items',
    'guest_portals',
    'charter_itineraries',
    'charter_itinerary_legs',
    'charter_itinerary_days',
    'charter_itinerary_activities',
    'charter_itinerary_shares',
    'charter_guests'
  ];
begin
  foreach target in array company_scoped loop
    -- Tolerate a table that does not exist in this environment rather than
    -- failing the whole migration.
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = target
    ) then
      raise notice 'skipping %: table not present', target;
      continue;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = target
        and column_name = 'company_id'
    ) then
      raise warning 'skipping %: no company_id column', target;
      continue;
    end if;

    policy_name := target || '_tenant_isolation';

    execute format('alter table public.%I enable row level security', target);
    execute format('drop policy if exists %I on public.%I', policy_name, target);

    execute format($p$
      create policy %I on public.%I
        for all
        to authenticated
        using (public.is_company_member(company_id))
        with check (public.is_company_member(company_id))
    $p$, policy_name, target);

    -- Every policy filters on company_id, so an index on it stops being
    -- optional the moment RLS is live: without one, Postgres re-evaluates
    -- the predicate across a full scan.
    execute format(
      'create index if not exists %I on public.%I (company_id)',
      'idx_' || target || '_company_id', target
    );

    raise notice 'tenant policy applied to public.%', target;
  end loop;
end
$$;


-- ---------------------------------------------------------------- roots

/*
 * company_members is the root of the graph. It cannot use is_company_member
 * without recursing, so it is scoped by user_id directly.
 *
 * No write policy is granted on purpose. Membership changes go through the
 * service role during provisioning and invitation. A broker must not be able
 * to add themselves to another company.
 */
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'company_members'
  ) then
    alter table public.company_members enable row level security;

    drop policy if exists company_members_self_read on public.company_members;
    create policy company_members_self_read on public.company_members
      for select
      to authenticated
      using (user_id = (select auth.uid()));

    raise notice 'company_members: self-read policy applied';
  end if;
end
$$;

/*
 * companies is scoped by its own primary key rather than a company_id column.
 * Updates are limited to owners and admins.
 */
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'companies'
  ) then
    alter table public.companies enable row level security;

    drop policy if exists companies_member_read on public.companies;
    create policy companies_member_read on public.companies
      for select
      to authenticated
      using (public.is_company_member(id));

    drop policy if exists companies_owner_update on public.companies;
    create policy companies_owner_update on public.companies
      for update
      to authenticated
      using (public.has_company_role(id, array['owner', 'admin']))
      with check (public.has_company_role(id, array['owner', 'admin']));

    raise notice 'companies: member-read and owner-update policies applied';
  end if;
end
$$;


-- ---------------------------------------------------------------- verify

/*
 * Fails loudly if any table still has RLS on with no policy. That state is
 * what this migration exists to correct, and reaching the end of it while
 * still in that state means something above was skipped.
 */
do $$
declare
  offending text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
  into offending
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  if offending is not null then
    raise exception
      'RLS enabled with no policy on: %. Those tables are deny-all for authenticated users.',
      offending;
  end if;

  raise notice 'verified: every RLS-enabled table has at least one policy';
end
$$;
