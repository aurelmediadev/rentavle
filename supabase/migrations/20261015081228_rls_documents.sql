-- Documents (receipts, settlements): numbered per organization and type, frozen
-- once issued, voided with their movement. Public share links resolve through a
-- security definer function that only accepts a valid, unexpired token hash.
-- Branding images (logo, signature) live in a public Storage bucket under
-- unguessable names; only admins of the organization upload them.

revoke all on public.documents, public.document_links from anon;
revoke update, delete on public.documents from authenticated;

--------------------------------------------------------------------------------
-- documents
--------------------------------------------------------------------------------
create or replace function private.assign_document_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.number := private.next_number(new.organization_id, 'document_' || new.type::text);
  return new;
end;
$$;

create trigger documents_assign_number before insert on public.documents
  for each row execute function private.assign_document_number();

create policy "documents: members read" on public.documents
  for select to authenticated using (private.is_member(organization_id));
create policy "documents: members issue" on public.documents
  for insert to authenticated
  with check (
    private.is_member(organization_id)
    and created_by = (select auth.uid())
    and status = 'issued'
    and exists (
      select 1 from public.movements m
      where m.id = movement_id
        and m.organization_id = documents.organization_id
        and m.reversed_at is null
        and ((documents.type = 'receipt' and m.type = 'tenant_payment')
          or (documents.type = 'settlement' and m.type = 'owner_settlement'))
    )
  );

-- Annulling the movement voids its document (the PDF then says ANULADO).
create or replace function private.void_documents_on_reversal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reversed_at is not null and old.reversed_at is null then
    update public.documents set status = 'void', voided_at = new.reversed_at
    where movement_id = new.id and status = 'issued';
  end if;
  return null;
end;
$$;

create trigger movements_void_documents
  after update on public.movements
  for each row execute function private.void_documents_on_reversal();

--------------------------------------------------------------------------------
-- document_links
--------------------------------------------------------------------------------
create policy "document_links: members read" on public.document_links
  for select to authenticated using (private.is_member(organization_id));
create policy "document_links: members create" on public.document_links
  for insert to authenticated
  with check (
    private.is_member(organization_id)
    and created_by = (select auth.uid())
    and exists (select 1 from public.documents d where d.id = document_id and d.organization_id = document_links.organization_id)
  );

-- What a public link shows. The caller hashes the token (sha256, hex).
create or replace function public.shared_document(p_token_hash text)
returns table (type public.document_type, number integer, status public.document_status, data jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select d.type, d.number, d.status, d.data
  from public.document_links l
  join public.documents d on d.id = l.document_id
  where l.token_hash = p_token_hash and l.expires_at > now();
$$;

revoke all on function public.shared_document(text) from public;
grant execute on function public.shared_document(text) to anon, authenticated;

--------------------------------------------------------------------------------
-- Branding images: public bucket, admins of the organization upload under
-- "<organization id>/<random name>".
--------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create or replace function private.can_manage_branding(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (storage.foldername(object_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.has_role(((storage.foldername(object_name))[1])::uuid, 'admin');
$$;

revoke all on function private.can_manage_branding(text) from public;
grant execute on function private.can_manage_branding(text) to authenticated;

create policy "branding: admins upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and private.can_manage_branding(name));
create policy "branding: admins read" on storage.objects
  for select to authenticated
  using (bucket_id = 'branding' and private.can_manage_branding(name));
create policy "branding: admins delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and private.can_manage_branding(name));
