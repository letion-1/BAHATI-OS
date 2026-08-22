-- Bahari OS
-- Itinerary day structure and guest-facing experience planning

create table if not exists public.charter_itinerary_days (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  itinerary_id uuid not null references public.charter_itineraries(id) on delete cascade,
  charter_id uuid not null references public.charters(id) on delete cascade,

  position integer not null default 1 check (position > 0),
  charter_date date not null,
  title text not null,
  destination_name text null,

  overnight_type text not null default 'none'
    check (overnight_type in ('none', 'marina', 'anchorage', 'port', 'underway')),

  overnight_name text null,
  summary text null,
  guest_notes text null,
  internal_notes text null,
  guest_visible boolean not null default true,

  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint charter_itinerary_days_unique_date
    unique (company_id, itinerary_id, charter_date)
);

create table if not exists public.charter_itinerary_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  itinerary_id uuid not null references public.charter_itineraries(id) on delete cascade,
  charter_id uuid not null references public.charters(id) on delete cascade,
  day_id uuid not null references public.charter_itinerary_days(id) on delete cascade,

  position integer not null default 1 check (position > 0),

  activity_type text not null default 'activity'
    check (
      activity_type in (
        'activity',
        'dining',
        'transfer',
        'water_sports',
        'wellness',
        'beach_club',
        'culture',
        'nightlife',
        'shopping',
        'other'
      )
    ),

  title text not null,
  start_time time null,
  end_time time null,
  location text null,
  description text null,

  status text not null default 'planning'
    check (status in ('idea', 'planning', 'confirmed', 'completed', 'cancelled')),

  guest_visible boolean not null default true,

  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists charter_itinerary_days_lookup_idx
  on public.charter_itinerary_days (company_id, charter_id, charter_date);

create index if not exists charter_itinerary_activities_day_idx
  on public.charter_itinerary_activities (company_id, day_id, position);

create index if not exists charter_itinerary_activities_charter_idx
  on public.charter_itinerary_activities (company_id, charter_id);

alter table public.charter_itinerary_days enable row level security;
alter table public.charter_itinerary_activities enable row level security;

comment on table public.charter_itinerary_days is
  'Broker-managed day-by-day charter itinerary content.';

comment on table public.charter_itinerary_activities is
  'Activities, dining, transfers and experiences attached to itinerary days.';