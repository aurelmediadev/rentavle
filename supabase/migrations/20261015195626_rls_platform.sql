-- Internal admin panel (Rentavle staff). Staff don't get extra RLS rights on the
-- agencies' tables: they read and change organizations only through these
-- security definer functions, which check private.is_platform_admin() and log
-- every change in platform_audit_log.

revoke all on public.platform_admins, public.platform_audit_log from anon, authenticated;
grant select on public.platform_admins to authenticated;

create policy "platform_admins: see yourself" on public.platform_admins
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

revoke all on function private.is_platform_admin() from public;
grant execute on function private.is_platform_admin() to authenticated;

create or replace function private.require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Solo para el equipo de Rentavle' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

--------------------------------------------------------------------------------
-- Organizations list.
--------------------------------------------------------------------------------
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
  where p_query is null or trim(p_query) = ''
     or o.name ilike '%' || p_query || '%'
     or o.tax_id ilike '%' || regexp_replace(p_query, '\D', '', 'g') || '%' and regexp_replace(p_query, '\D', '', 'g') <> ''
     or exists (
       select 1 from public.memberships m join auth.users u on u.id = m.user_id
       where m.organization_id = o.id and u.email ilike '%' || p_query || '%')
  order by o.created_at desc
  limit 200;
end;
$$;

--------------------------------------------------------------------------------
-- One organization: data, members, subscriptions, payments and audit trail.
--------------------------------------------------------------------------------
create or replace function public.admin_organization_detail(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform private.require_platform_admin();
  select jsonb_build_object(
    'organization', to_jsonb(o) || jsonb_build_object('plan_code', p.code, 'plan_name', p.name),
    'usage', jsonb_build_object(
      'active_contracts', (select count(*) from public.contracts c where c.organization_id = o.id and c.status = 'active' and c.deleted_at is null),
      'clients', (select count(*) from public.clients c where c.organization_id = o.id and c.deleted_at is null),
      'properties', (select count(*) from public.properties x where x.organization_id = o.id and x.deleted_at is null),
      'limit', private.contract_limit(o.id)),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('email', u.email, 'role', m.role, 'created_at', m.created_at) order by m.created_at)
      from public.memberships m join auth.users u on u.id = m.user_id where m.organization_id = o.id), '[]'),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'plan', sp.name, 'cycle', s.cycle, 'amount', s.amount, 'currency', s.currency, 'status', s.status,
        'provider', s.provider, 'provider_subscription_id', s.provider_subscription_id, 'next_payment_date', s.next_payment_date,
        'created_at', s.created_at) order by s.created_at desc)
      from public.subscriptions s join public.plans sp on sp.id = s.plan_id where s.organization_id = o.id), '[]'),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('amount', x.amount, 'currency', x.currency, 'status', x.status, 'paid_at', x.paid_at,
        'provider_payment_id', x.provider_payment_id, 'created_at', x.created_at) order by x.created_at desc)
      from public.subscription_payments x where x.organization_id = o.id), '[]'),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object('action', a.action, 'details', a.details, 'created_at', a.created_at, 'actor', u.email)
        order by a.created_at desc)
      from public.platform_audit_log a left join auth.users u on u.id = a.actor_id where a.organization_id = o.id), '[]')
  )
  into v
  from public.organizations o
  left join public.plans p on p.id = o.plan_id
  where o.id = p_org;
  return v;
end;
$$;

--------------------------------------------------------------------------------
-- Changing an organization's access: status, plan (null = free, e.g. pilots),
-- extra blocks and trial end. Always with a reason, always logged.
--------------------------------------------------------------------------------
create or replace function public.admin_set_access(
  p_org uuid,
  p_status public.subscription_status,
  p_plan_code text,
  p_extra_blocks integer,
  p_trial_ends_on date,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.organizations%rowtype;
  v_plan uuid;
  v_trial_end timestamptz;
begin
  perform private.require_platform_admin();
  if length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Contá brevemente el motivo del cambio' using errcode = 'check_violation';
  end if;
  select * into v_before from public.organizations where id = p_org for update;
  if not found then
    raise exception 'Organización inexistente' using errcode = 'no_data_found';
  end if;
  if p_plan_code is not null then
    select id into v_plan from public.plans where code = p_plan_code and country_code = v_before.country_code;
    if v_plan is null then
      raise exception 'Plan inexistente: %', p_plan_code using errcode = 'check_violation';
    end if;
  end if;
  -- A trial ends at the end of the chosen day, in the agency's time zone.
  v_trial_end := coalesce(((p_trial_ends_on + 1)::timestamp at time zone v_before.timezone) - interval '1 second', v_before.trial_ends_at);
  if p_status = 'trialing' and v_trial_end is null then
    raise exception 'Una prueba necesita fecha de fin' using errcode = 'check_violation';
  end if;

  update public.organizations
  set subscription_status = p_status,
      plan_id = v_plan,
      extra_contract_blocks = greatest(coalesce(p_extra_blocks, 0), 0),
      trial_ends_at = v_trial_end
  where id = p_org;

  insert into public.platform_audit_log (actor_id, organization_id, action, details)
  values ((select auth.uid()), p_org, 'set_access', jsonb_build_object(
    'note', trim(p_note),
    'before', jsonb_build_object('status', v_before.subscription_status, 'plan_id', v_before.plan_id,
      'extra_blocks', v_before.extra_contract_blocks, 'trial_ends_at', v_before.trial_ends_at),
    'after', jsonb_build_object('status', p_status, 'plan_code', p_plan_code,
      'extra_blocks', greatest(coalesce(p_extra_blocks, 0), 0), 'trial_ends_at', v_trial_end)));
end;
$$;

revoke all on function public.admin_organizations(text), public.admin_organization_detail(uuid),
  public.admin_set_access(uuid, public.subscription_status, text, integer, date, text) from public, anon;
grant execute on function public.admin_organizations(text), public.admin_organization_detail(uuid),
  public.admin_set_access(uuid, public.subscription_status, text, integer, date, text) to authenticated;
