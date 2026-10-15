-- Sample agencies (onboarding): an admin can create ONE sample agency next to the
-- real one, with demo data, to try the app; it is deleted as a whole when no
-- longer needed (cascade, which is also the only way ledger entries go away).
-- It can't extend the free trial: it has the trial's 10-contract limit, no tax id
-- and its own 21 days; users can't turn an agency into a sample or back.

alter table public.organizations add constraint organizations_sample check (is_sample = (sample_of is not null));
create unique index organizations_one_sample on public.organizations (sample_of) where sample_of is not null;

create or replace function public.create_sample_organization(p_parent uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_parent public.organizations%rowtype;
  v_org uuid;
begin
  if not private.has_role(p_parent, 'admin') then
    raise exception 'Solo un administrador puede crear la inmobiliaria de ejemplo' using errcode = 'insufficient_privilege';
  end if;
  select * into v_parent from public.organizations where id = p_parent;
  if v_parent.is_sample then
    raise exception 'Esta ya es una inmobiliaria de ejemplo' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.organizations where sample_of = p_parent) then
    raise exception 'Ya tenés una inmobiliaria de ejemplo' using errcode = 'unique_violation';
  end if;

  insert into public.organizations (
    name, country_code, default_currency, timezone, locale, trial_ends_at, created_by, is_sample, sample_of
  )
  values (
    'Ejemplo · ' || v_parent.name, v_parent.country_code, v_parent.default_currency, v_parent.timezone, v_parent.locale,
    now() + interval '21 days', v_user, true, p_parent
  )
  returning id into v_org;

  insert into public.memberships (organization_id, user_id, role) values (v_org, v_user, 'admin');
  return v_org;
end;
$$;

create or replace function public.delete_sample_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_role(p_org, 'admin') or not exists (select 1 from public.organizations where id = p_org and is_sample) then
    raise exception 'Solo se puede borrar una inmobiliaria de ejemplo propia' using errcode = 'insufficient_privilege';
  end if;
  delete from public.organizations where id = p_org;
end;
$$;

revoke all on function public.create_sample_organization(uuid), public.delete_sample_organization(uuid) from public, anon;
grant execute on function public.create_sample_organization(uuid), public.delete_sample_organization(uuid) to authenticated;

-- Being a sample is decided by the functions above, never by users.
create or replace function private.protect_organizations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
    new.country_code, new.default_currency, new.subscription_status, new.trial_ends_at, new.created_by,
    new.plan_id, new.extra_contract_blocks, new.is_sample, new.sample_of
  ) is distinct from (
    old.country_code, old.default_currency, old.subscription_status, old.trial_ends_at, old.created_by,
    old.plan_id, old.extra_contract_blocks, old.is_sample, old.sample_of
  ) then
    raise exception 'No se puede cambiar el país, la moneda ni la suscripción de la inmobiliaria'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- The internal panel lists real agencies only.
create or replace function public.admin_organizations(p_query text default null)
returns table (
  id uuid,
  name text,
  tax_id text,
  country_code char(2),
  created_at timestamptz,
  subscription_status public.subscription_status,
  trial_ends_at timestamptz,
  plan_name text,
  active_contracts integer,
  members integer,
  owner_email text,
  last_payment_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  return query
  select o.id, o.name, o.tax_id, o.country_code, o.created_at, o.subscription_status, o.trial_ends_at, p.name,
    (select count(*)::integer from public.contracts c where c.organization_id = o.id and c.status = 'active' and c.deleted_at is null),
    (select count(*)::integer from public.memberships m where m.organization_id = o.id),
    (select u.email::text from auth.users u where u.id = o.created_by),
    (select max(sp.paid_at) from public.subscription_payments sp where sp.organization_id = o.id)
  from public.organizations o
  left join public.plans p on p.id = o.plan_id
  where not o.is_sample and (p_query is null or trim(p_query) = ''
     or o.name ilike '%' || p_query || '%'
     or o.tax_id ilike '%' || regexp_replace(p_query, '\D', '', 'g') || '%' and regexp_replace(p_query, '\D', '', 'g') <> ''
     or exists (
       select 1 from public.memberships m join auth.users u on u.id = m.user_id
       where m.organization_id = o.id and u.email ilike '%' || p_query || '%')
  )
  order by o.created_at desc
  limit 200;
end;
$$;
