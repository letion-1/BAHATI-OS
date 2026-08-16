-- Yacht OS
-- Final Approval Workflow
-- Created: 2026-08-16
--
-- One confirmation record per proposal/inquiry.
-- The selected yacht comes from proposal_client_selections.
-- The approval route is determined by the selected yacht's access profile.

create table if not exists public.proposal_confirmations (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  proposal_id uuid not null
    references public.inquiries(id)
    on delete cascade,

  proposal_yacht_id uuid
    references public.proposal_yachts(id)
    on delete set null,

  fleet_id uuid
    references public.fleet(id)
    on delete set null,

  confirmation_type text not null
    check (
      confirmation_type in (
        'internal_confirmation',
        'owner_approval',
        'manager_confirmation',
        'reference_only'
      )
    ),

  status text not null default 'not_started'
    check (
      status in (
        'not_started',
        'confirmation_required',
        'confirmation_requested',
        'owner_approval_pending',
        'manager_confirmation_pending',
        'confirmed',
        'declined',
        'expired',
        'cancelled',
        'blocked'
      )
    ),

  requested_at timestamptz,
  requested_by uuid,

  confirmed_at timestamptz,
  confirmed_by uuid,

  declined_at timestamptz,
  declined_by uuid,

  cancelled_at timestamptz,
  cancelled_by uuid,

  contact_name text,
  contact_email text,

  notes text,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint proposal_confirmations_company_proposal_unique
    unique (company_id, proposal_id)
);

create index if not exists proposal_confirmations_company_status_idx
  on public.proposal_confirmations (company_id, status);

create index if not exists proposal_confirmations_proposal_yacht_idx
  on public.proposal_confirmations (proposal_yacht_id);

create index if not exists proposal_confirmations_fleet_idx
  on public.proposal_confirmations (fleet_id);

alter table public.proposal_confirmations
  enable row level security;

comment on table public.proposal_confirmations is
  'Tracks the operational confirmation/approval state for the client-selected yacht on a proposal.';

comment on column public.proposal_confirmations.confirmation_type is
  'internal_confirmation for controlled yachts, owner_approval for managed yachts, manager_confirmation for broker-access yachts, reference_only for non-operational reference yachts.';

comment on column public.proposal_confirmations.status is
  'Operational approval state. This is intentionally separate from proposal status and client selection state.';