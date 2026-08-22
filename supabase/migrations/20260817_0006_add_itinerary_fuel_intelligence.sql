-- Bahari OS
-- Itinerary + Fuel Intelligence foundation

create table if not exists public.charter_itineraries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  charter_id uuid not null references public.charters(id) on delete cascade,

  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'planning', 'ready', 'shared')),

  cruising_speed_knots numeric(8,2) null
    check (cruising_speed_knots is null or cruising_speed_knots > 0),

  fuel_burn_lph numeric(12,2) null
    check (fuel_burn_lph is null or fuel_burn_lph >= 0),

  fuel_price_per_liter numeric(12,4) null
    check (fuel_price_per_liter is null or fuel_price_per_liter >= 0),

  fuel_currency text not null default 'EUR',

  contingency_percent numeric(7,3) not null default 10
    check (contingency_percent >= 0 and contingency_percent <= 100),

  notes text null,

  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint charter_itineraries_company_charter_unique
    unique (company_id, charter_id)
);

create table if not exists public.charter_itinerary_legs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  itinerary_id uuid not null references public.charter_itineraries(id) on delete cascade,
  charter_id uuid not null references public.charters(id) on delete cascade,

  position integer not null default 1
    check (position > 0),

  charter_date date null,

  from_name text not null,
  to_name text not null,

  from_lat numeric(10,7) null
    check (from_lat is null or (from_lat >= -90 and from_lat <= 90)),
  from_lon numeric(10,7) null
    check (from_lon is null or (from_lon >= -180 and from_lon <= 180)),
  to_lat numeric(10,7) null
    check (to_lat is null or (to_lat >= -90 and to_lat <= 90)),
  to_lon numeric(10,7) null
    check (to_lon is null or (to_lon >= -180 and to_lon <= 180)),

  distance_nm numeric(12,3) null
    check (distance_nm is null or distance_nm >= 0),

  distance_source text not null default 'manual'
    check (distance_source in ('manual', 'coordinates')),

  departure_time time null,
  arrival_time time null,

  cruising_speed_knots numeric(8,2) null
    check (cruising_speed_knots is null or cruising_speed_knots > 0),

  fuel_burn_lph numeric(12,2) null
    check (fuel_burn_lph is null or fuel_burn_lph >= 0),

  fuel_price_per_liter numeric(12,4) null
    check (fuel_price_per_liter is null or fuel_price_per_liter >= 0),

  guest_visible boolean not null default true,
  notes text null,

  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists charter_itineraries_company_idx
  on public.charter_itineraries(company_id, updated_at desc);

create index if not exists charter_itinerary_legs_itinerary_idx
  on public.charter_itinerary_legs(itinerary_id, position);

create index if not exists charter_itinerary_legs_charter_idx
  on public.charter_itinerary_legs(company_id, charter_id, charter_date);

alter table public.charter_itineraries enable row level security;
alter table public.charter_itinerary_legs enable row level security;

comment on table public.charter_itineraries is
  'Per-charter itinerary assumptions and fuel model.';

comment on table public.charter_itinerary_legs is
  'Ordered charter route legs with manual or coordinate-derived nautical distance.';