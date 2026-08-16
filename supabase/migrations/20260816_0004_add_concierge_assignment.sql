-- Yacht OS
-- Concierge assignment + due-date ownership layer

alter table public.charter_concierge_items
  add column if not exists assigned_to uuid null;

alter table public.charter_concierge_items
  add column if not exists assigned_by uuid null;

alter table public.charter_concierge_items
  add column if not exists assigned_at timestamptz null;

alter table public.charter_concierge_items
  add column if not exists due_at timestamptz null;

create index if not exists charter_concierge_items_assigned_to_idx
  on public.charter_concierge_items (
    company_id,
    assigned_to
  );

create index if not exists charter_concierge_items_due_at_idx
  on public.charter_concierge_items (
    company_id,
    due_at
  );

comment on column public.charter_concierge_items.assigned_to is
  'Supabase Auth user ID of the workspace member responsible for this concierge request.';

comment on column public.charter_concierge_items.assigned_by is
  'Supabase Auth user ID that most recently assigned the concierge request.';

comment on column public.charter_concierge_items.assigned_at is
  'Timestamp when the current assignment was made.';

comment on column public.charter_concierge_items.due_at is
  'Internal operational deadline for the concierge request.';