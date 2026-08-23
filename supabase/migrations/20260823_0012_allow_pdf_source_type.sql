-- ============================================================================
-- 20260823_0012_allow_pdf_source_type.sql
--
-- Allow 'pdf' in data_sources.source_type.
--
-- The table was created before PDF was a supported source, so a check
-- constraint on source_type still lists only the original three. The
-- application accepts PDF uploads and parses them correctly, then fails at
-- the final insert with a constraint violation the broker sees as
-- "Could not create the data source."
--
-- This finds the existing constraint by inspecting the column rather than
-- assuming a name, because the constraint may have been created inline
-- (data_sources_source_type_check) or explicitly with another name.
-- ============================================================================

do $$
declare
  constraint_name text;
  allowed text[] := array[
    'google_sheets',
    'dropbox_excel',
    'website',
    'pdf'
  ];
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'data_sources'
  ) then
    raise notice 'data_sources not present, nothing to do';
    return;
  end if;

  -- Find any check constraint on the table that mentions source_type.
  select con.conname
  into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'data_sources'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%source_type%'
  limit 1;

  if constraint_name is not null then
    execute format(
      'alter table public.data_sources drop constraint %I',
      constraint_name
    );
    raise notice 'dropped existing constraint %', constraint_name;
  else
    raise notice 'no existing source_type constraint found';
  end if;

  -- Recreate with pdf included. NOT VALID is deliberately not used: any row
  -- already present must satisfy the new list, and every existing value is
  -- in it.
  alter table public.data_sources
    add constraint data_sources_source_type_check
    check (
      source_type in (
        'google_sheets',
        'dropbox_excel',
        'website',
        'pdf'
      )
    );

  raise notice 'source_type now accepts: %', array_to_string(allowed, ', ');
end
$$;


-- ---------------------------------------------------------------- verify
do $$
declare
  definition text;
begin
  select pg_get_constraintdef(con.oid)
  into definition
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'data_sources'
    and con.conname = 'data_sources_source_type_check';

  if definition is null then
    raise exception 'constraint was not created';
  end if;

  if definition not ilike '%pdf%' then
    raise exception 'constraint does not include pdf: %', definition;
  end if;

  raise notice 'verified: %', definition;
end
$$;