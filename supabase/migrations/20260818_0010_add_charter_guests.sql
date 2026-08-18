-- Yacht OS
-- Charter Guest Intelligence foundation
-- Created: 2026-08-18
--
-- Adds individual guest records for operational charter management.
-- The existing charters.guests column remains the expected headcount.
-- This table stores the actual guest profiles attached to the charter.
--
-- Passport document numbers/files are intentionally NOT stored here.
-- Those should live in a separate protected/encrypted document vault.

create table if not exists public.charter_guests (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  charter_id uuid not null
    references public.charters(id)
    on delete cascade,

  full_name text not null,

  guest_role text not null default 'guest'
    check (
      guest_role in (
        'primary_charterer',
        'guest',
        'child',
        'staff',
        'other'
      )
    ),

  is_primary boolean not null default false,

  email text,
  phone text,
  nationality text,
  date_of_birth date,

  passport_status text not null default 'not_requested'
    check (
      passport_status in (
        'not_requested',
        'requested',
        'received',
        'verified',
        'expired',
        'not_required'
      )
    ),

  passport_country text,
  passport_expiry date,

  dietary_requirements text,
  allergies text,
  accessibility_notes text,

  arrival_airport text,
  arrival_flight text,
  arrival_at timestamptz,
  arrival_transfer_notes text,

  departure_airport text,
  departure_flight text,
  departure_at timestamptz,
  departure_transfer_notes text,

  cabin_preference text,
  bed_preference text,

  notes text,

  profile_status text not null default 'incomplete'
    check (
      profile_status in (
        'incomplete',
        'in_progress',
        'complete'
      )
    ),

  sort_order integer not null default 0
    check (sort_order >= 0),

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists charter_guests_company_charter_idx
  on public.charter_guests (
    company_id,
    charter_id
  );

create index if not exists charter_guests_charter_sort_idx
  on public.charter_guests (
    charter_id,
    sort_order,
    created_at
  );

create index if not exists charter_guests_company_status_idx
  on public.charter_guests (
    company_id,
    profile_status
  );

create index if not exists charter_guests_arrival_idx
  on public.charter_guests (
    charter_id,
    arrival_at
  );

create unique index if not exists charter_guests_one_primary_per_charter_idx
  on public.charter_guests (charter_id)
  where is_primary = true;

alter table public.charter_guests
  enable row level security;

comment on table public.charter_guests is
  'Individual guest profiles attached to an operational charter. charters.guests remains the expected headcount.';

comment on column public.charter_guests.guest_role is
  'Operational role of the person on the charter, separate from client ownership of the booking.';

comment on column public.charter_guests.is_primary is
  'Marks the primary charter guest. At most one primary guest is allowed per charter.';

comment on column public.charter_guests.passport_status is
  'Tracks passport readiness without storing passport document numbers in this table.';

comment on column public.charter_guests.profile_status is
  'Broker-facing completeness state for manifest and guest-preparation workflows.';

comment on column public.charter_guests.sort_order is
  'Stable display order for guest manifests and charter workspace presentation.';