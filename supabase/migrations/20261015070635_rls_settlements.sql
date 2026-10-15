-- Owner settlements: insert-only lines, each tenant allocation settled at most
-- once per owner, and tenant payments can't be annulled while settled.

revoke all on public.settlement_lines from anon;

create policy "settlement_lines: members read" on public.settlement_lines
  for select to authenticated using (private.is_member(organization_id));
create policy "settlement_lines: members create" on public.settlement_lines
  for insert to authenticated
  with check (
    private.is_member(organization_id)
    and exists (select 1 from public.movements m where m.id = settlement_id and m.organization_id = settlement_lines.organization_id)
    and exists (select 1 from public.clients c where c.id = client_id and c.organization_id = settlement_lines.organization_id)
  );

create or replace function private.validate_settlement_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.movements%rowtype;
  v_payment public.movements%rowtype;
  v_charge public.charges%rowtype;
  v_allocation public.charge_allocations%rowtype;
  v_existing integer;
begin
  -- Lock the allocation so two settlements can't take it at the same time.
  select * into v_allocation from public.charge_allocations where id = new.allocation_id for update;
  select * into v_settlement from public.movements where id = new.settlement_id;
  select * into v_payment from public.movements where id = v_allocation.movement_id;
  select * into v_charge from public.charges where id = v_allocation.charge_id;

  if v_settlement.type <> 'owner_settlement' or v_settlement.reversed_at is not null then
    raise exception 'La liquidación no es válida' using errcode = 'check_violation';
  end if;
  if v_payment.type <> 'tenant_payment' or v_payment.reversed_at is not null then
    raise exception 'Solo se liquidan cobros vigentes' using errcode = 'check_violation';
  end if;
  if v_charge.creditor <> 'owner' then
    raise exception 'La deuda no es a favor del propietario' using errcode = 'check_violation';
  end if;
  if v_payment.organization_id <> new.organization_id then
    raise exception 'El cobro es de otra organización' using errcode = 'check_violation';
  end if;

  select count(*) into v_existing
  from public.settlement_lines l
  join public.movements s on s.id = l.settlement_id
  where l.allocation_id = new.allocation_id and l.client_id = new.client_id and s.reversed_at is null;
  if v_existing > 0 then
    raise exception 'Ese cobro ya fue liquidado a este propietario' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger settlement_lines_validate
  before insert on public.settlement_lines
  for each row execute function private.validate_settlement_line();

-- A settled tenant payment can't be annulled until its settlement is.
create or replace function private.block_reversal_of_settled_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number integer;
begin
  if new.reversed_at is not null and old.reversed_at is null and old.type = 'tenant_payment' then
    select s.number into v_number
    from public.charge_allocations a
    join public.settlement_lines l on l.allocation_id = a.id
    join public.movements s on s.id = l.settlement_id
    where a.movement_id = old.id and s.reversed_at is null
    limit 1;
    if v_number is not null then
      raise exception 'Este cobro ya se liquidó al propietario: anulá primero la liquidación #%', v_number
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger movements_block_settled_reversal
  before update on public.movements
  for each row execute function private.block_reversal_of_settled_payment();
