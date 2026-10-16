-- Attachments: rows in public.files, bytes in the private Storage bucket "files"
-- under "<organization id>/...". Members of the agency read, upload and delete;
-- uploads go straight from the browser with a signed URL the server creates.

revoke all on public.files from anon;
revoke update on public.files from authenticated;

-- The attached entity must belong to the same agency.
create or replace function private.file_entity_in_org(p_type public.file_entity_type, p_id uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'contract' then exists (select 1 from public.contracts where id = p_id and organization_id = p_org)
    when 'movement' then exists (select 1 from public.movements where id = p_id and organization_id = p_org)
    when 'client' then exists (select 1 from public.clients where id = p_id and organization_id = p_org)
    when 'property' then exists (select 1 from public.properties where id = p_id and organization_id = p_org)
  end;
$$;

revoke all on function private.file_entity_in_org(public.file_entity_type, uuid, uuid) from public;
grant execute on function private.file_entity_in_org(public.file_entity_type, uuid, uuid) to authenticated;

create policy "files: members read" on public.files
  for select to authenticated using (private.is_member(organization_id));
create policy "files: members attach" on public.files
  for insert to authenticated
  with check (
    private.is_member(organization_id)
    and created_by = (select auth.uid())
    and storage_path like organization_id::text || '/%'
    and private.file_entity_in_org(entity_type, entity_id, organization_id)
  );
create policy "files: members delete" on public.files
  for delete to authenticated using (private.is_member(organization_id));

create trigger files_require_writable before insert or update or delete on public.files
  for each row execute function private.require_writable();

--------------------------------------------------------------------------------
-- Storage bucket.
--------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 10485760, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])
on conflict (id) do nothing;

-- Organization that owns an object, from the first folder of its path (null if malformed).
create or replace function private.file_object_org(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when (storage.foldername(object_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(object_name))[1])::uuid end;
$$;

grant execute on function private.file_object_org(text) to authenticated;

create policy "files bucket: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'files' and private.is_member(private.file_object_org(name)));
create policy "files bucket: members upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'files'
    and private.is_member(private.file_object_org(name))
    and private.org_writable(private.file_object_org(name))
  );
create policy "files bucket: members delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'files' and private.is_member(private.file_object_org(name)));
