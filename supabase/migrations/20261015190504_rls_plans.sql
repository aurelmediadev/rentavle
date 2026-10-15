-- Plans, trial and read-only accounts (docs/01-vision-y-producto.md, "Modelo de negocio").
--
-- * plans: readable by signed-in users; written by migrations or the admin panel.
-- * create_organization: the trial is always 21 days and needs a tax id (one trial
--   per CUIT: unique index organizations_country_tax_id_key). Before, both came
--   from the caller.
-- * An agency whose trial ended or whose subscription was cancelled is read-only:
--   users can see and export everything but not change business data. Server
--   code (jobs, webhooks, security definer functions) isn't affected.
-- * Active contracts are limited by plan (trial: 10), checked at commit so a
--   renewal (one ends, another starts) doesn't trip the limit.
-- Same rules in TypeScript: packages/domain/src/subscription.ts.

revoke all on public.plans from anon;
revoke insert, update, delete on public.plans from authenticated;
create policy "plans: signed-in users read" on public.plans
  for select to authenticated using (true);

insert into public.plans (code, country_code, name, max_active_contracts, monthly_price, annual_price, currency, extra_block_contracts, extra_block_price, sort_order)
values
  ('inicial', 'AR', 'Inicial', 40, 35000, 350000, 'ARS', null, null, 1),
  ('profesional', 'AR', 'Profesional', 120, 59000, 590000, 'ARS', null, null, 2),
  ('corporativo', 'AR', 'Corporativo', 300, 89000, 890000, 'ARS', 100, 15000, 3);

--------------------------------------------------------------------------------
-- Creating an organization: fixed trial, tax id required.
--------------------------------------------------------------------------------
drop function public.create_organization(text, text, text, text, text, text, integer);

create or replace function public.create_organization(
  p_name text,
  p_country_code text,
  p_default_currency text,
  p_timezone text,
  p_locale text,
  p_tax_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if nullif(trim(p_tax_id), '') is null then
    raise exception 'Falta el número fiscal de la inmobiliaria' using errcode = 'check_violation';
  end if;

  insert into public.organizations (
    name, country_code, default_currency, timezone, locale, tax_id,
    trial_ends_at, created_by
  )
  values (
    trim(p_name), upper(p_country_code), upper(p_default_currency), p_timezone, p_locale,
    trim(p_tax_id), now() + interval '21 days', v_user
  )
  returning id into v_org;

  insert into public.memberships (organization_id, user_id, role)
  values (v_org, v_user, 'admin');

  return v_org;
end;
$$;

revoke all on function public.create_organization(text, text, text, text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text) to authenticated;

--------------------------------------------------------------------------------
-- Access rules.
--------------------------------------------------------------------------------
create or replace function private.org_writable(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select o.subscription_status in ('active', 'past_due')
        or (o.subscription_status = 'trialing' and o.trial_ends_at > now())
    from public.organizations o where o.id = p_org
  ), false);
$$;

-- Active contracts allowed; null = unlimited (pilots without a plan).
create or replace function private.contract_limit(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when o.subscription_status = 'trialing' then 10
    when p.id is null then null
    else p.max_active_contracts + coalesce(p.extra_block_contracts, 0) * o.extra_contract_blocks
  end
  from public.organizations o
  left join public.plans p on p.id = o.plan_id
  where o.id = p_org;
$$;

revoke all on function private.org_writable(uuid), private.contract_limit(uuid) from public;
grant execute on function private.org_writable(uuid), private.contract_limit(uuid) to authenticated;

create or replace function private.require_writable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
begin
  if current_user = 'authenticated' and not private.org_writable(v_org) then
    raise exception 'La cuenta está en modo solo lectura: elegí un plan en Suscripción para seguir cargando datos'
      using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'bank_accounts', 'cash_accounts', 'charge_allocations', 'charges', 'client_contacts', 'clients',
    'communications', 'contract_events', 'contract_parties', 'contracts', 'message_templates', 'movements',
    'properties', 'property_owners', 'recurring_charges', 'rent_periods', 'settlement_lines', 'documents'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function private.require_writable()',
      t || '_require_writable', t);
  end loop;
end;
$$;

create or replace function private.check_contract_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_active integer;
begin
  if new.status <> 'active' or new.deleted_at is not null then
    return null;
  end if;
  v_limit := private.contract_limit(new.organization_id);
  if v_limit is null then
    return null;
  end if;
  select count(*) into v_active
  from public.contracts
  where organization_id = new.organization_id and status = 'active' and deleted_at is null;
  if v_active > v_limit then
    raise exception 'Llegaste al límite de % contratos activos de tu plan: pasá a un plan más grande en Suscripción', v_limit
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger contracts_limit
  after insert or update on public.contracts
  deferrable initially deferred
  for each row execute function private.check_contract_limit();

--------------------------------------------------------------------------------
-- The plan is part of the billing data users can't change themselves.
--------------------------------------------------------------------------------
create or replace function private.protect_organizations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
    new.country_code, new.default_currency, new.subscription_status, new.trial_ends_at, new.created_by,
    new.plan_id, new.extra_contract_blocks
  ) is distinct from (
    old.country_code, old.default_currency, old.subscription_status, old.trial_ends_at, old.created_by,
    old.plan_id, old.extra_contract_blocks
  ) then
    raise exception 'No se puede cambiar el país, la moneda ni la suscripción de la inmobiliaria'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
