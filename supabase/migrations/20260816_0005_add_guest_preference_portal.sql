-- Bahari OS
-- Guest Preference Portal foundation

create extension if not exists pgcrypto;

create table if not exists public.guest_portals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  charter_id uuid not null references public.charters(id) on delete cascade,

  token_hash text null,
  token_hint text null,

  status text not null default 'draft'
    check (
      status in (
        'draft',
        'active',
        'submitted',
        'revoked'
      )
    ),

  expires_at timestamptz null,
  sent_at timestamptz null,
  opened_at timestamptz null,
  opened_count integer not null default 0
    check (opened_count >= 0),
  submitted_at timestamptz null,

  preferences jsonb not null default '{}'::jsonb,

  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint guest_portals_company_charter_unique
    unique (company_id, charter_id),

  constraint guest_portals_token_hash_unique
    unique (token_hash)
);

create index if not exists guest_portals_company_idx
  on public.guest_portals (
    company_id,
    updated_at desc
  );

create index if not exists guest_portals_charter_idx
  on public.guest_portals (
    charter_id
  );

alter table public.guest_portals enable row level security;

alter table public.charter_concierge_items
  add column if not exists guest_portal_id uuid null
    references public.guest_portals(id)
    on delete set null;

alter table public.charter_concierge_items
  add column if not exists guest_request_key text null;

create unique index if not exists charter_concierge_guest_request_unique
  on public.charter_concierge_items (
    guest_portal_id,
    guest_request_key
  );

create index if not exists charter_concierge_guest_portal_idx
  on public.charter_concierge_items (
    company_id,
    guest_portal_id
  );

comment on table public.guest_portals is
  'Secure per-charter guest preference portal state. Only token hashes are stored.';

comment on column public.guest_portals.preferences is
  'Latest structured guest preference submission for this charter.';

comment on column public.charter_concierge_items.guest_request_key is
  'Stable key used to synchronize a guest portal preference section into Concierge without duplicating requests.';