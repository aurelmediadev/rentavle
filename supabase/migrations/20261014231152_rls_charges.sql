-- Debts: RLS and integrity rules. Debts are never deleted: they are voided with a
-- reason, and their amount can't change once something was paid against them.

revoke all on public.charges, public.recurring_charges from anon;

--------------------------------------------------------------------------------
-- recurring_charges (templates; archived with deleted_at)
--------------------------------------------------------------------------------
create policy "recurring_charges: members read" on public.recurring_charges
  for select to authenticated using (private.is_member(organization_id));
create policy "recurring_charges: members write" on public.recurring_charges
  for insert to authenticated
  with check (
    private.is_member(organization_id)
    and exists (
      select 1 from public.contracts c
      where c.id = contract_id and c.organization_id = recurring_charges.organization_id
    )
  );
create policy "recurring_charges: members update" on public.recurring_charges
  for update to authenticated
  using (private.is_member(organization_id))
  with check (private.is_member(organization_id));

--------------------------------------------------------------------------------
-- charges (no delete policy: void instead)
--------------------------------------------------------------------------------
create policy "charges: members read" on public.charges
  for select to authenticated using (private.is_member(organization_id));
create policy "charges: members create" on public.charges
  for insert to authenticated
  with check (
    private.is_member(organization_id)
    and exists (
      select 1 from public.contracts c
      where c.id = contract_id and c.organization_id = charges.organization_id
    )
    and (
      recurring_charge_id is null
      or exists (
        select 1 from public.recurring_charges r
        where r.id = recurring_charge_id and r.contract_id = charges.contract_id
      )
    )
  );
create policy "charges: members update" on public.charges
  for update to authenticated
  using (private.is_member(organization_id))
  with check (private.is_member(organization_id));

create or replace function private.protect_charges()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id <> old.organization_id or new.contract_id <> old.contract_id
     or new.type <> old.type or new.period_month <> old.period_month then
    raise exception 'No se puede cambiar el contrato, el tipo ni el mes de una deuda'
      using errcode = 'check_violation';
  end if;
  if old.status = 'void' then
    raise exception 'La deuda está anulada' using errcode = 'check_violation';
  end if;
  if old.status in ('paid', 'partially_paid') then
    if new.amount <> old.amount or new.currency <> old.currency
       or new.debtor <> old.debtor or new.creditor <> old.creditor then
      raise exception 'La deuda ya tiene pagos: no se puede modificar el monto ni las partes'
        using errcode = 'check_violation';
    end if;
    if new.status = 'void' then
      raise exception 'La deuda ya tiene pagos: anulá primero los pagos' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger charges_protect
  before update on public.charges
  for each row execute function private.protect_charges();
