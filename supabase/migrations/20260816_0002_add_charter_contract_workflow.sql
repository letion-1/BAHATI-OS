-- Bahari OS
-- Charter / Contract Workflow
-- Created: 2026-08-16
--
-- Converts a fully confirmed proposal into an operational charter record.
-- Reuses the existing documents system for charter agreements, invoices,
-- APA files and payment receipts.

create table if not exists public.charters (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  proposal_id uuid not null
    references public.inquiries(id)
    on delete restrict,

  confirmation_id uuid not null
    references public.proposal_confirmations(id)
    on delete restrict,

  proposal_yacht_id uuid
    references public.proposal_yachts(id)
    on delete set null,

  fleet_id uuid
    references public.fleet(id)
    on delete set null,

  reference text not null,

  client_name text not null,
  client_email text,
  client_phone text,

  yacht_name text not null,

  start_date date,
  end_date date,
  destination text,
  embarkation_port text,
  disembarkation_port text,
  guests integer,

  currency text not null default 'EUR',

  charter_fee numeric(14,2),
  vat_percent numeric(7,3),
  vat_amount numeric(14,2),

  apa_percent numeric(7,3),
  apa_amount numeric(14,2),

  deposit_percent numeric(7,3),
  deposit_amount numeric(14,2),
  balance_amount numeric(14,2),

  total_contract_value numeric(14,2),

  charter_status text not null default 'draft'
    check (
      charter_status in (
        'draft',
        'contracting',
        'confirmed',
        'active',
        'completed',
        'cancelled'
      )
    ),

  contract_status text not null default 'not_started'
    check (
      contract_status in (
        'not_started',
        'draft',
        'ready',
        'sent',
        'signed',
        'declined',
        'expired',
        'cancelled'
      )
    ),

  payment_status text not null default 'not_started'
    check (
      payment_status in (
        'not_started',
        'deposit_due',
        'deposit_paid',
        'balance_due',
        'partially_paid',
        'paid',
        'overdue',
        'cancelled'
      )
    ),

  contract_sent_at timestamptz,
  contract_signed_at timestamptz,

  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint charters_company_proposal_unique
    unique (company_id, proposal_id),

  constraint charters_company_reference_unique
    unique (company_id, reference),

  constraint charters_date_order_check
    check (
      start_date is null
      or end_date is null
      or end_date >= start_date
    ),

  constraint charters_guests_check
    check (
      guests is null
      or guests >= 0
    ),

  constraint charters_non_negative_money_check
    check (
      (charter_fee is null or charter_fee >= 0)
      and (vat_amount is null or vat_amount >= 0)
      and (apa_amount is null or apa_amount >= 0)
      and (deposit_amount is null or deposit_amount >= 0)
      and (balance_amount is null or balance_amount >= 0)
      and (total_contract_value is null or total_contract_value >= 0)
    )
);

create index if not exists charters_company_status_idx
  on public.charters (company_id, charter_status);

create index if not exists charters_company_contract_status_idx
  on public.charters (company_id, contract_status);

create index if not exists charters_company_payment_status_idx
  on public.charters (company_id, payment_status);

create index if not exists charters_fleet_idx
  on public.charters (fleet_id);

create index if not exists charters_start_date_idx
  on public.charters (start_date);

alter table public.charters
  enable row level security;


create table if not exists public.charter_payment_schedule (
  id uuid primary key default gen_random_uuid(),

  company_id uuid not null
    references public.companies(id)
    on delete cascade,

  charter_id uuid not null
    references public.charters(id)
    on delete cascade,

  payment_type text not null
    check (
      payment_type in (
        'deposit',
        'balance',
        'apa',
        'vat',
        'other'
      )
    ),

  label text,
  amount numeric(14,2) not null
    check (amount >= 0),

  currency text not null default 'EUR',

  due_date date,

  status text not null default 'not_due'
    check (
      status in (
        'not_due',
        'due',
        'paid',
        'partially_paid',
        'overdue',
        'waived',
        'cancelled'
      )
    ),

  amount_paid numeric(14,2) not null default 0
    check (amount_paid >= 0),

  paid_at timestamptz,
  payment_reference text,
  notes text,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists charter_payment_schedule_charter_idx
  on public.charter_payment_schedule (charter_id);

create index if not exists charter_payment_schedule_company_status_idx
  on public.charter_payment_schedule (company_id, status);

create index if not exists charter_payment_schedule_due_date_idx
  on public.charter_payment_schedule (due_date);

alter table public.charter_payment_schedule
  enable row level security;


-- Existing documents remain the file repository. This adds a direct charter
-- relationship so agreements, invoices, APA documents and receipts can move
-- with the charter instead of being tied only to the original proposal.
alter table public.documents
  add column if not exists charter_id uuid
    references public.charters(id)
    on delete set null;

create index if not exists documents_charter_idx
  on public.documents (charter_id);


comment on table public.charters is
  'Operational charter record created after the client-selected yacht is fully confirmed.';

comment on table public.charter_payment_schedule is
  'Tracks deposit, balance, APA, VAT and other scheduled charter payments.';

comment on column public.charters.proposal_id is
  'The original inquiry/proposal from which this charter was created.';

comment on column public.charters.confirmation_id is
  'The confirmed proposal confirmation that authorized creation of this charter.';

comment on column public.charters.contract_status is
  'Contract lifecycle kept separate from charter operational status.';

comment on column public.charters.payment_status is
  'High-level payment summary; detailed amounts and due dates live in charter_payment_schedule.';