-- Communications: users record the messages they send by hand; automatic notices
-- are recorded by the job (admin connection). After creation only the delivery
-- fields change. Templates: members read, admins edit.

revoke all on public.communications, public.message_templates from anon;
revoke delete on public.communications from authenticated;

create policy "communications: members read" on public.communications
  for select to authenticated using (private.is_member(organization_id));
create policy "communications: members send" on public.communications
  for insert to authenticated
  with check (
    private.is_member(organization_id)
    and sender = 'manual'
    and created_by = (select auth.uid())
    and (contract_id is null or exists (
      select 1 from public.contracts c where c.id = contract_id and c.organization_id = communications.organization_id))
    and (client_id is null or exists (
      select 1 from public.clients c where c.id = client_id and c.organization_id = communications.organization_id))
    and (movement_id is null or exists (
      select 1 from public.movements m where m.id = movement_id and m.organization_id = communications.organization_id))
  );
create policy "communications: members update delivery" on public.communications
  for update to authenticated
  using (private.is_member(organization_id))
  with check (private.is_member(organization_id));

-- What was sent, to whom and why never changes; only its delivery does. Links to
-- a contract, client or movement may become null (their deletion sets them null).
create or replace function private.protect_communications()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.id, new.organization_id, coalesce(new.contract_id, old.contract_id), coalesce(new.client_id, old.client_id),
      coalesce(new.movement_id, old.movement_id), new.type, new.channel,
      new.sender, new.to_address, new.subject, new.body, new.dedupe_key, new.created_by, new.created_at)
     is distinct from
     (old.id, old.organization_id, old.contract_id, old.client_id, old.movement_id, old.type, old.channel,
      old.sender, old.to_address, old.subject, old.body, old.dedupe_key, old.created_by, old.created_at) then
    raise exception 'Una comunicación registrada no se modifica' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger communications_protect
  before update on public.communications
  for each row execute function private.protect_communications();

create policy "message_templates: members read" on public.message_templates
  for select to authenticated using (private.is_member(organization_id));
create policy "message_templates: admins create" on public.message_templates
  for insert to authenticated with check (private.has_role(organization_id, 'admin'));
create policy "message_templates: admins update" on public.message_templates
  for update to authenticated
  using (private.has_role(organization_id, 'admin'))
  with check (private.has_role(organization_id, 'admin'));
create policy "message_templates: admins delete" on public.message_templates
  for delete to authenticated using (private.has_role(organization_id, 'admin'));
