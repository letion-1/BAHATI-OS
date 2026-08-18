-- Yacht OS
-- Stable encrypted Charter Portal tokens for resendable post-contract client access.

alter table public.guest_portals
  add column if not exists token_encrypted text null;

comment on column public.guest_portals.token_encrypted is
  'Encrypted raw Charter Portal token. Public lookup still uses token_hash; the encrypted value exists only so Yacht OS can resend the same secure client link without rotating it.';

create index if not exists guest_portals_company_charter_status_idx
  on public.guest_portals (
    company_id,
    charter_id,
    status
  );