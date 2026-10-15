-- Collections: cash accounts, movements and allocations. The database keeps each
-- debt's status (pending / partially_paid / paid) in sync with its allocations, and
-- refuses allocations that overpay a debt or touch voided ones.

revoke all on public.cash_accounts, public.movements, public.charge_allocations from anon;

--------------------------------------------------------------------------------
-- cash_accounts: members read, admins manage. Every agency has a default box.
--------------------------------------------------------------------------------
create policy "cash_accounts: members read" on public.cash_accounts
  for select to authenticated using (private.is_member(organization_id));
create policy "cash_accounts: admins create" on public.cash_accounts
  for insert to authenticated with check (private.has_role(organization_id, 'admin'));
create policy "cash_accounts: admins update" on public.cash_accounts
  for update to authenticated
  using (private.has_role(organization_id, 'admin'))
  with check (private.has_role(organization_id, 'admin'));

create unique index cash_accounts_one_default
  on public.cash_accounts (organization_id) where is_default and archived_at is null;

insert into public.cash_accounts (organization_id, type, name, currency, is_default)
select o.id, 'cash', 'Caja principal', o.default_currency, true
from public.organizations o
where not exists (select 1 from public.cash_accounts c where c.organization_id = o.id);

create or replace function private.create_default_cash_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cash_accounts (organization_id, type, name, currency, is_default)
  values (new.id, 'cash', 'Caja principal', new.default_currency, true);
  return new;
end;
$$;

create trigger organizations_default_cash_account
  after insert on public.organizations
  for each row execute function private.create_default_cash_account();

--------------------------------------------------------------------------------
-- movements: numbered; never deleted; only the reversal fields can change.
--------------------------------------------------------------------------------
create trigger movements_assign_number before insert on public.movements
  for each row execute function private.assign_number('movement');

create policy "movements: members read" on public.movements
  for select to authenticated using (private.is_member(organization_id));
create policy "movements: members create" on public.movements
  for insert to authenticated
  with check (
    private.is_member(organization_id)
    and created_by = (select auth.uid())
    and (contract_id is null or exists (
      select 1 from public.contracts c where c.id = contract_id and c.organization_id = movements.organization_id))
    and (client_id is null or exists (
      select 1 from public.clients c where c.id = client_id and c.organization_id = movements.organization_id))
    and (cash_account_id is null or exists (
      select 1 from public.cash_accounts a where a.id = cash_account_id and a.organization_id = movements.organization_id))
  );
create policy "movements: members reverse" on public.movements
  for update to authenticated
  using (private.is_member(organization_id))
  with check (private.is_member(organization_id));

create or replace function private.protect_movements()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.reversed_at is not null then
    raise exception 'El movimiento ya está anulado' using errcode = 'check_violation';
  end if;
  if (new.id, new.organization_id, new.number, new.type, new.date, new.contract_id, new.client_id,
      new.method, new.cash_account_id, new.amount, new.currency)
     is distinct from
     (old.id, old.organization_id, old.number, old.type, old.date, old.contract_id, old.client_id,
      old.method, old.cash_account_id, old.amount, old.currency) then
    raise exception 'Un movimiento no se modifica: anulalo y registralo de nuevo' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger movements_protect
  before update on public.movements
  for each row execute function private.protect_movements();

--------------------------------------------------------------------------------
-- charge_allocations: insert-only; validated against the debt.
--------------------------------------------------------------------------------
create policy "charge_allocations: members read" on public.charge_allocations
  for select to authenticated using (private.is_member(organization_id));
create policy "charge_allocations: members create" on public.charge_allocations
  for insert to authenticated
  with check (
    private.is_member(organization_id)
    and exists (select 1 from public.movements m where m.id = movement_id and m.organization_id = charge_allocations.organization_id)
    and exists (select 1 from public.charges c where c.id = charge_id and c.organization_id = charge_allocations.organization_id)
  );

-- Recomputes a debt's status from the allocations of non-reversed movements.
create or replace function private.refresh_charge_status(p_charge uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount numeric;
  v_status public.charge_status;
  v_paid numeric;
begin
  select amount, status into v_amount, v_status from public.charges where id = p_charge;
  if v_status = 'void' then return; end if;
  select coalesce(sum(a.amount), 0) into v_paid
  from public.charge_allocations a
  join public.movements m on m.id = a.movement_id
  where a.charge_id = p_charge and m.reversed_at is null;
  update public.charges
  set status = case when v_paid = v_amount then 'paid'
                    when v_paid = 0 then 'pending'
                    else 'partially_paid' end::public.charge_status
  where id = p_charge;
end;
$$;

create or replace function private.validate_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge public.charges%rowtype;
  v_movement public.movements%rowtype;
  v_paid numeric;
begin
  -- Lock the debt so two simultaneous payments can't both pay it.
  select * into v_charge from public.charges where id = new.charge_id for update;
  select * into v_movement from public.movements where id = new.movement_id;

  if v_charge.status = 'void' then
    raise exception 'No se puede cobrar una deuda anulada' using errcode = 'check_violation';
  end if;
  if v_movement.reversed_at is not null then
    raise exception 'El movimiento está anulado' using errcode = 'check_violation';
  end if;
  if v_movement.contract_id is not null and v_movement.contract_id <> v_charge.contract_id then
    raise exception 'La deuda es de otro contrato' using errcode = 'check_violation';
  end if;
  if sign(new.amount) <> sign(v_charge.amount) then
    raise exception 'El importe imputado no corresponde al signo de la deuda' using errcode = 'check_violation';
  end if;

  select coalesce(sum(a.amount), 0) into v_paid
  from public.charge_allocations a
  join public.movements m on m.id = a.movement_id
  where a.charge_id = new.charge_id and m.reversed_at is null;
  if abs(v_paid + new.amount) > abs(v_charge.amount) then
    raise exception 'El pago supera lo adeudado (%: debe %, ya pagado %)', v_charge.title, v_charge.amount, v_paid
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger charge_allocations_validate
  before insert on public.charge_allocations
  for each row execute function private.validate_allocation();

create or replace function private.after_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_charge_status(new.charge_id);
  return null;
end;
$$;

create trigger charge_allocations_refresh_status
  after insert on public.charge_allocations
  for each row execute function private.after_allocation();

-- Reversing a movement frees the debts it paid.
create or replace function private.after_movement_reversal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.reversed_at is not null and old.reversed_at is null then
    for r in select charge_id from public.charge_allocations where movement_id = new.id loop
      perform private.refresh_charge_status(r.charge_id);
    end loop;
  end if;
  return null;
end;
$$;

create trigger movements_refresh_charges_on_reversal
  after update on public.movements
  for each row execute function private.after_movement_reversal();
