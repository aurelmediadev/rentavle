-- Contracts: RLS, numbering, one active contract per property at a time, and the
-- global index series (reference data).

revoke all on public.index_series, public.index_values, public.contracts, public.contract_parties,
  public.rent_periods, public.contract_events from anon;

--------------------------------------------------------------------------------
-- Index series and values: global, read-only for users. The import job writes
-- them with the service role (which bypasses RLS).
--------------------------------------------------------------------------------
create policy "index_series: signed-in users read" on public.index_series
  for select to authenticated using (true);
create policy "index_values: signed-in users read" on public.index_values
  for select to authenticated using (true);

insert into public.index_series (code, country_code, name, frequency, publisher, source_url) values
  ('AR_IPC', 'AR', 'IPC (Índice de Precios al Consumidor)', 'monthly', 'INDEC', 'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-5-31'),
  ('AR_ICL', 'AR', 'ICL (Índice para Contratos de Locación)', 'daily', 'BCRA', 'https://www.bcra.gob.ar/PublicacionesEstadisticas/Principales_variables.asp'),
  ('AR_CASA_PROPIA', 'AR', 'Coeficiente Casa Propia', 'monthly', 'Ministerio de Desarrollo Territorial y Hábitat', null)
on conflict (code) do nothing;

--------------------------------------------------------------------------------
-- contracts
--------------------------------------------------------------------------------
create trigger contracts_assign_number before insert on public.contracts
  for each row execute function private.assign_number('contract');
create trigger contracts_keep_number before update on public.contracts
  for each row execute function private.keep_number();

create policy "contracts: members read" on public.contracts
  for select to authenticated using (private.is_member(organization_id));
create policy "contracts: members create" on public.contracts
  for insert to authenticated
  with check (
    private.is_member(organization_id)
    and exists (
      select 1 from public.properties p
      where p.id = property_id and p.organization_id = contracts.organization_id
    )
  );
create policy "contracts: members update" on public.contracts
  for update to authenticated
  using (private.is_member(organization_id))
  with check (
    private.is_member(organization_id)
    and exists (
      select 1 from public.properties p
      where p.id = property_id and p.organization_id = contracts.organization_id
    )
  );
create policy "contracts: admins delete" on public.contracts
  for delete to authenticated using (private.has_role(organization_id, 'admin'));

-- A property can't have two active contracts whose dates overlap.
create extension if not exists btree_gist with schema extensions;

alter table public.contracts
  add constraint contracts_no_overlap
  exclude using gist (
    property_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status = 'active' and deleted_at is null);

--------------------------------------------------------------------------------
-- Children of a contract: same organization as the contract.
--------------------------------------------------------------------------------
create policy "contract_parties: members manage" on public.contract_parties
  for all to authenticated
  using (private.is_member(organization_id))
  with check (
    private.is_member(organization_id)
    and exists (
      select 1 from public.contracts c
      where c.id = contract_id and c.organization_id = contract_parties.organization_id
    )
    and exists (
      select 1 from public.clients cl
      where cl.id = client_id and cl.organization_id = contract_parties.organization_id
    )
  );

create policy "rent_periods: members manage" on public.rent_periods
  for all to authenticated
  using (private.is_member(organization_id))
  with check (
    private.is_member(organization_id)
    and exists (
      select 1 from public.contracts c
      where c.id = contract_id and c.organization_id = rent_periods.organization_id
    )
  );

-- History is append-only.
create policy "contract_events: members read" on public.contract_events
  for select to authenticated using (private.is_member(organization_id));
create policy "contract_events: members append" on public.contract_events
  for insert to authenticated
  with check (
    private.is_member(organization_id)
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.contracts c
      where c.id = contract_id and c.organization_id = contract_events.organization_id
    )
  );
