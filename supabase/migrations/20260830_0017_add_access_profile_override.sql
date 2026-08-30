-- ============================================================================
-- 20260830_0017_add_access_profile_override.sql
--
-- Let a single yacht disagree with its source.
--
-- Migration 0016 gave data sources an access classification and had every
-- yacht in the feed inherit it. That was too rigid, and the test plan for this
-- product says so: "Source E: Mixed Neptune Feed" carries one hull the
-- brokerage manages alongside others it only has broker access to. A partner
-- sends one spreadsheet and the yachts in it are not all the same thing.
--
-- So the source classification becomes a default rather than a verdict, and
-- this flag is what makes a per-yacht decision survive.
--
-- WHY A FLAG RATHER THAN COMPARING VALUES
--
-- The importer could ask "does this profile differ from what the source would
-- produce?" and treat a difference as intentional. That breaks the moment a
-- broker deliberately sets a yacht to the same value the source already
-- implies: the override is invisible, and if the source is later reclassified
-- the yacht moves with it even though someone had decided it should not.
--
-- Intent is a fact about what happened, not something to be inferred from the
-- data afterwards. A flag records it.
--
-- Without this, a broker classifies eight yachts on Monday and the Tuesday
-- sync silently reverts all eight, which is worse than not offering the
-- feature at all.
-- ============================================================================

begin;

alter table public.yacht_access_profiles
  add column if not exists is_overridden boolean not null default false;

alter table public.yacht_access_profiles
  add column if not exists overridden_by uuid;

alter table public.yacht_access_profiles
  add column if not exists overridden_at timestamptz;

comment on column public.yacht_access_profiles.is_overridden is
  'True when a person set this yacht''s access explicitly. The importer will not rewrite it from the source default.';

/*
 * Partial index on the exceptions, because that is the question the UI asks:
 * "which yachts in this source disagree with it?" The answer is almost always
 * a handful out of a hundred, so indexing only the true rows keeps it small.
 */
create index if not exists yacht_access_profiles_overridden_idx
  on public.yacht_access_profiles (company_id, fleet_id)
  where is_overridden = true;

/*
 * Existing profiles are left as not-overridden.
 *
 * Every profile in the table today was written by migration 0016's importer
 * from a source default, since nothing else wrote them. None of them
 * represents a decision anyone made, so none should be protected from the
 * next sync. Marking them overridden would freeze a set of defaults nobody
 * chose.
 */

commit;