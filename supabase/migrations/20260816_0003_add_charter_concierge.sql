create table if not exists public.charter_concierge_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  charter_id uuid not null references public.charters(id) on delete cascade,

  category text not null check (
    category in (
      'transfer',
      'restaurant',
      'provisioning',
      'activity',
      'special_request',
      'crew_coordination',
      'other'
    )
  ),

  title text not null,
  description text,

  status text not null default 'pending' check (
    status in (
      'pending',
      'planning',
      'confirmed',
      'completed',
      'cancelled'
    )
  ),

  priority text not null default 'normal' check (
    priority in (
      'normal',
      'high',
      'urgent'
    )
  ),

  scheduled_at timestamptz,
  location text,

  vendor_name text,
  vendor_contact text,

  estimated_cost numeric(14,2) check (
    estimated_cost is null or estimated_cost >= 0
  ),

  currency text not null default 'EUR',

  source text not null default 'broker' check (
    source in (
      'broker',
      'client',
      'crew',
      'owner',
      'other'
    )
  ),

  client_visible boolean not null default false,

  notes text,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists charter_concierge_items_company_charter_idx
  on public.charter_concierge_items(company_id, charter_id);

create index if not exists charter_concierge_items_status_idx
  on public.charter_concierge_items(company_id, charter_id, status);

create index if not exists charter_concierge_items_scheduled_at_idx
  on public.charter_concierge_items(company_id, charter_id, scheduled_at);

alter table public.charter_concierge_items enable row level security;