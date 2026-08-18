-- Yacht OS
-- Secure public sharing for charter itineraries.

create table if not exists public.charter_itinerary_shares (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  charter_id uuid not null
    references public.charters(id)
    on delete cascade,

  itinerary_id uuid not null
    references public.charter_itineraries(id)
    on delete cascade,

  token text not null unique,

  is_active boolean not null default true,

  hero_image_url text null,

  published_at timestamptz not null default now(),
  expires_at timestamptz null,

  view_count integer not null default 0
    check (view_count >= 0),

  last_viewed_at timestamptz null,

  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint charter_itinerary_shares_one_per_charter
    unique (company_id, charter_id)
);

create index if not exists charter_itinerary_shares_token_idx
  on public.charter_itinerary_shares (token);

create index if not exists charter_itinerary_shares_charter_idx
  on public.charter_itinerary_shares (
    company_id,
    charter_id,
    is_active
  );

alter table public.charter_itinerary_shares
  enable row level security;

comment on table public.charter_itinerary_shares is
  'Secure public-share records for guest-facing charter itineraries.';

comment on column public.charter_itinerary_shares.hero_image_url is
  'Optional broker-selected hero image. Public itinerary falls back to the bundled Yacht OS yacht hero placeholder when unset or invalid.';