-- ============================================================================
-- 20260830_0016_add_source_access_classification.sql
--
-- Give data sources an access classification, and make it flow to the yachts
-- they import.
--
-- THE GAP THIS CLOSES
--
-- yacht_access_profiles already exists, and proposal creation already enforces
-- it: a yacht whose access_type is 'reference' is rejected from a
-- client-facing proposal. That half works.
--
-- What was missing is that nothing ever writes a profile. No importer creates
-- one, so every yacht arriving from a PDF, Excel sheet, Google Sheet or
-- website has no profile at all, and the proposal route falls back to:
--
--     access_type: "broker_access",
--     client_proposal_permission: true
--
-- Every imported yacht is therefore silently treated as bookable and
-- proposable. A market reference sheet listing hulls represented by another
-- house would put those hulls in front of a client as though the brokerage
-- could sell them.
--
-- The classification belongs on the SOURCE rather than being guessed per
-- yacht. A broker knows what a feed is when they connect it — this is our own
-- fleet, this is a partner's, this is market reference — and every yacht in
-- that feed inherits it. Asking per yacht would mean answering the same
-- question forty times for one upload.
--
-- Existing sources are left NULL rather than defaulted. A guess written into
-- the database is indistinguishable from a decision, and this is the field
-- that determines whether a hull can be sold. NULL means "not classified",
-- the importer treats it as the most restrictive option, and the data sources
-- page asks.
-- ============================================================================

begin;

alter table public.data_sources
  add column if not exists access_type text,
  add column if not exists calendar_authority text,
  add column if not exists booking_model text;

/*
 * Values match the enums already used by /api/yacht-access, so a source's
 * classification can be copied onto a profile without translation. Worth
 * noting 'reference' is the access type; 'reference_only' is the booking
 * model. They are easy to confuse and mean different things.
 */
alter table public.data_sources
  drop constraint if exists data_sources_access_type_check;

alter table public.data_sources
  add constraint data_sources_access_type_check
  check (
    access_type is null
    or access_type in ('controlled', 'managed', 'broker_access', 'reference')
  );

alter table public.data_sources
  drop constraint if exists data_sources_calendar_authority_check;

alter table public.data_sources
  add constraint data_sources_calendar_authority_check
  check (
    calendar_authority is null
    or calendar_authority in (
      'our_company', 'owner', 'charter_manager', 'operator', 'unknown'
    )
  );

alter table public.data_sources
  drop constraint if exists data_sources_booking_model_check;

alter table public.data_sources
  add constraint data_sources_booking_model_check
  check (
    booking_model is null
    or booking_model in (
      'direct', 'confirmation_required', 'owner_approval_required',
      'reference_only'
    )
  );

comment on column public.data_sources.access_type is
  'How this brokerage can work the yachts in this feed. Inherited by every yacht imported from it. NULL means unclassified, which the importer treats as the most restrictive option.';

/*
 * One profile per yacht. The importer upserts on this, so re-syncing a source
 * updates the profile it wrote rather than accumulating duplicates.
 *
 * Scoped to company_id as well as fleet_id even though fleet_id is already
 * unique per company: every other index in this schema leads with company_id,
 * and a tenant-scoped index is the one that stays correct if fleet rows are
 * ever shared or moved.
 */
create unique index if not exists yacht_access_profiles_fleet_idx
  on public.yacht_access_profiles (company_id, fleet_id);

commit;