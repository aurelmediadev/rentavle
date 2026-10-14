-- Clients, properties and their child rows: RLS, per-organization numbering and
-- ownership percentages. Every child row must belong to the same organization as
-- its parent; the policies check it so a member can't attach rows across agencies.

revoke all on public.org_counters, public.clients, public.client_contacts, public.bank_accounts,
  public.properties, public.property_owners from anon;
revoke all on public.org_counters from authenticated;

--------------------------------------------------------------------------------
-- Correlative numbers per organization ("Cliente #12")
--------------------------------------------------------------------------------
create or replace function private.next_number(org_id uuid, entity_name text)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.org_counters as c (organization_id, entity, last_number)
  values (org_id, entity_name, 1)
  on conflict (organization_id, entity) do update set last_number = c.last_number + 1
  returning last_number;
$$;

revoke all on function private.next_number(uuid, text) from public;

-- BEFORE INSERT trigger; the entity name is the trigger argument.
create or replace function private.assign_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.number := private.next_number(new.organization_id, tg_argv[0]);
  return new;
end;
$$;

-- Numbers are immutable once assigned.
create or replace function private.keep_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.number := old.number;
  new.organization_id := old.organization_id;
  return new;
end;
$$;

create trigger clients_assign_number before insert on public.clients
  for each row execute function private.assign_number('client');
create trigger clients_keep_number before update on public.clients
  for each row execute function private.keep_number();

create trigger properties_assign_number before insert on public.properties
  for each row execute function private.assign_number('property');
create trigger properties_keep_number before update on public.properties
  for each row execute function private.keep_number();

--------------------------------------------------------------------------------
-- clients
--------------------------------------------------------------------------------
create policy "clients: members read" on public.clients
  for select to authenticated using (private.is_member(organization_id));
create policy "clients: members create" on public.clients
  for insert to authenticated with check (private.is_member(organization_id));
create policy "clients: members update" on public.clients
  for update to authenticated
  using (private.is_member(organization_id)) with check (private.is_member(organization_id));
-- The app archives with deleted_at; physical deletes are admin-only.
create policy "clients: admins delete" on public.clients
  for delete to authenticated using (private.has_role(organization_id, 'admin'));

--------------------------------------------------------------------------------
-- client_contacts
--------------------------------------------------------------------------------
create policy "client_contacts: members manage" on public.client_contacts
  for all to authenticated
  using (private.is_member(organization_id))
  with check (
    private.is_member(organization_id)
    and exists (
      select 1 from public.clients c
      where c.id = client_id and c.organization_id = client_contacts.organization_id
    )
  );

--------------------------------------------------------------------------------
-- bank_accounts
--------------------------------------------------------------------------------
create policy "bank_accounts: members read" on public.bank_accounts
  for select to authenticated using (private.is_member(organization_id));
create policy "bank_accounts: members write client accounts, admins all" on public.bank_accounts
  for all to authenticated
  using (
    (owner_type = 'client' and private.is_member(organization_id))
    or private.has_role(organization_id, 'admin')
  )
  with check (
    (
      (owner_type = 'client' and private.is_member(organization_id))
      or private.has_role(organization_id, 'admin')
    )
    and (
      client_id is null
      or exists (
        select 1 from public.clients c
        where c.id = client_id and c.organization_id = bank_accounts.organization_id
      )
    )
  );

--------------------------------------------------------------------------------
-- properties
--------------------------------------------------------------------------------
create policy "properties: members read" on public.properties
  for select to authenticated using (private.is_member(organization_id));
create policy "properties: members create" on public.properties
  for insert to authenticated with check (private.is_member(organization_id));
create policy "properties: members update" on public.properties
  for update to authenticated
  using (private.is_member(organization_id)) with check (private.is_member(organization_id));
create policy "properties: admins delete" on public.properties
  for delete to authenticated using (private.has_role(organization_id, 'admin'));

--------------------------------------------------------------------------------
-- property_owners
--------------------------------------------------------------------------------
create policy "property_owners: members manage" on public.property_owners
  for all to authenticated
  using (private.is_member(organization_id))
  with check (
    private.is_member(organization_id)
    and exists (
      select 1 from public.properties p
      where p.id = property_id and p.organization_id = property_owners.organization_id
    )
    and exists (
      select 1 from public.clients c
      where c.id = client_id and c.organization_id = property_owners.organization_id
    )
  );

-- Ownership must add up to 100% when the transaction ends (owners are usually
-- replaced all at once, so intermediate states are allowed).
create or replace function private.check_ownership_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property uuid := coalesce(new.property_id, old.property_id);
  v_total numeric;
  v_count integer;
begin
  select coalesce(sum(ownership_pct), 0), count(*) into v_total, v_count
  from public.property_owners where property_id = v_property;

  if v_count > 0 and v_total <> 100 then
    raise exception 'Los porcentajes de los propietarios deben sumar 100%% (suman %)', v_total
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger property_owners_total_100
  after insert or update or delete on public.property_owners
  deferrable initially deferred
  for each row execute function private.check_ownership_total();
