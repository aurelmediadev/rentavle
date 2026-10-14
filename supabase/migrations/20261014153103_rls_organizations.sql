-- Row Level Security for organizations, memberships, invitations and profiles.
-- Every business table is isolated per organization: a user only sees rows of
-- organizations they belong to (docs/05-arquitectura.md, "Multi-tenant y seguridad").

-- Helpers live in a schema that is not exposed through the Supabase API.
create schema if not exists private;
grant usage on schema private to authenticated;

-- security definer so policies on memberships can call it without recursing.
create or replace function private.is_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_role(org_id uuid, required public.membership_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
      and (m.role = required or m.role = 'admin')
  );
$$;

-- Users who share at least one organization with the current user.
create or replace function private.shares_organization(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other_user
  );
$$;

revoke all on function private.is_member(uuid) from public;
revoke all on function private.has_role(uuid, public.membership_role) from public;
revoke all on function private.shares_organization(uuid) from public;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.membership_role) to authenticated;
grant execute on function private.shares_organization(uuid) to authenticated;

-- Anonymous visitors never read these tables.
revoke all on public.profiles, public.organizations, public.memberships, public.invitations from anon;

--------------------------------------------------------------------------------
-- profiles
--------------------------------------------------------------------------------
create policy "profiles: read own and teammates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_organization(id));

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- A profile row is created for every new auth user.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

--------------------------------------------------------------------------------
-- organizations
--------------------------------------------------------------------------------
create policy "organizations: members read" on public.organizations
  for select to authenticated
  using (private.is_member(id));

create policy "organizations: admins update" on public.organizations
  for update to authenticated
  using (private.has_role(id, 'admin'))
  with check (private.has_role(id, 'admin'));

-- No insert/delete policies: organizations are created through
-- public.create_organization() and never deleted by users.

--------------------------------------------------------------------------------
-- memberships
--------------------------------------------------------------------------------
create policy "memberships: members read" on public.memberships
  for select to authenticated
  using (private.is_member(organization_id));

create policy "memberships: admins update" on public.memberships
  for update to authenticated
  using (private.has_role(organization_id, 'admin'))
  with check (private.has_role(organization_id, 'admin'));

create policy "memberships: admins remove, users leave" on public.memberships
  for delete to authenticated
  using (private.has_role(organization_id, 'admin') or user_id = (select auth.uid()));

-- Inserts only happen through create_organization() and accept_invitation().

-- An organization always keeps at least one admin.
create or replace function private.ensure_admin_remains()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     and exists (select 1 from public.organizations o where o.id = old.organization_id)
     and not exists (
       select 1 from public.memberships m
       where m.organization_id = old.organization_id
         and m.role = 'admin'
         and m.id <> old.id
     )
  then
    raise exception 'La organización debe tener al menos un administrador'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_keep_one_admin
  before update or delete on public.memberships
  for each row execute function private.ensure_admin_remains();

--------------------------------------------------------------------------------
-- invitations
--------------------------------------------------------------------------------
create policy "invitations: admins manage" on public.invitations
  for all to authenticated
  using (private.has_role(organization_id, 'admin'))
  with check (private.has_role(organization_id, 'admin') and invited_by = (select auth.uid()));

--------------------------------------------------------------------------------
-- RPC: create an organization and make the caller its admin, atomically.
-- Country defaults (currency, timezone, locale) are resolved by the app from
-- its CountryPack and passed in.
--------------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_country_code text,
  p_default_currency text,
  p_timezone text,
  p_locale text,
  p_tax_id text default null,
  p_trial_days integer default 21
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

  insert into public.organizations (
    name, country_code, default_currency, timezone, locale, tax_id,
    trial_ends_at, created_by
  )
  values (
    trim(p_name), upper(p_country_code), upper(p_default_currency), p_timezone, p_locale,
    nullif(trim(p_tax_id), ''), now() + make_interval(days => p_trial_days), v_user
  )
  returning id into v_org;

  insert into public.memberships (organization_id, user_id, role)
  values (v_org, v_user, 'admin');

  return v_org;
end;
$$;

revoke all on function public.create_organization(text, text, text, text, text, text, integer) from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text, integer) to authenticated;

--------------------------------------------------------------------------------
-- RPC: accept an invitation. The token arrives in clear text from the link;
-- only its SHA-256 is stored. The signed-in email must match the invitation.
--------------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text := lower((select auth.jwt()) ->> 'email');
  v_invitation public.invitations%rowtype;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_invitation
  from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found or v_invitation.accepted_at is not null or v_invitation.expires_at < now() then
    raise exception 'La invitación no es válida o venció' using errcode = 'P0002';
  end if;

  if v_invitation.email <> v_email then
    raise exception 'La invitación es para otro email' using errcode = '42501';
  end if;

  insert into public.memberships (organization_id, user_id, role, invited_by)
  values (v_invitation.organization_id, v_user, v_invitation.role, v_invitation.invited_by)
  on conflict (organization_id, user_id) do nothing;

  update public.invitations
  set accepted_at = now(), accepted_by = v_user
  where id = v_invitation.id;

  return v_invitation.organization_id;
end;
$$;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
