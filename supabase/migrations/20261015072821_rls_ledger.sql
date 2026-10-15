-- Double-entry ledger (docs/03-reglas-de-negocio.md §9).
--
-- Entries are written only here, never by the application: every debt and every
-- movement "syncs" its entries when the transaction commits (deferred triggers,
-- so allocations and settlement lines inserted after the movement count). A sync
-- compares what the source should have posted with what it did; if they differ,
-- it reverses the active entries and posts the new ones. Entries are never
-- updated or deleted, and each posting is balanced (debits = credits).
--
-- Accounts: cash (box/bank), tenant (per contract), owner (the owners of a
-- contract, together), fees, admin_charges, third_party, other_income, expenses.

revoke all on public.ledger_accounts, public.ledger_entries from anon;
revoke insert, update, delete on public.ledger_accounts, public.ledger_entries from authenticated;

create unique index ledger_accounts_key
  on public.ledger_accounts (organization_id, type, ref_id, currency) nulls not distinct;

create policy "ledger_accounts: members read" on public.ledger_accounts
  for select to authenticated using (private.is_member(organization_id));
create policy "ledger_entries: members read" on public.ledger_entries
  for select to authenticated using (private.is_member(organization_id));

--------------------------------------------------------------------------------
-- Saldo a favor is its own debt type: the overpayment already credited the
-- tenant's account when it was received, so it posts nothing by itself.
--------------------------------------------------------------------------------
alter table public.charges disable trigger charges_protect;
update public.charges set type = 'credit_balance'
where type = 'adjustment' and title = 'Saldo a favor' and source_movement_id is not null;
alter table public.charges enable trigger charges_protect;

--------------------------------------------------------------------------------
-- Movements: transfers between boxes and split transfers.
--------------------------------------------------------------------------------
alter table public.movements add constraint movements_transfer check (
  (type = 'transfer') = (to_cash_account_id is not null)
  and (to_cash_account_id is null or to_cash_account_id <> cash_account_id)
);
alter table public.movements add constraint movements_owner_direct check (
  owner_direct_amount is null or (method = 'split_transfer' and owner_direct_amount between 0 and amount)
);

drop policy "movements: members create" on public.movements;
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
    and (to_cash_account_id is null or exists (
      select 1 from public.cash_accounts a where a.id = to_cash_account_id and a.organization_id = movements.organization_id))
  );

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
      new.method, new.cash_account_id, new.to_cash_account_id, new.owner_direct_amount, new.amount, new.currency)
     is distinct from
     (old.id, old.organization_id, old.number, old.type, old.date, old.contract_id, old.client_id,
      old.method, old.cash_account_id, old.to_cash_account_id, old.owner_direct_amount, old.amount, old.currency) then
    raise exception 'Un movimiento no se modifica: anulalo y registralo de nuevo' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

--------------------------------------------------------------------------------
-- Accounts and postings.
--------------------------------------------------------------------------------
create or replace function private.ledger_account(p_org uuid, p_type public.ledger_account_type, p_ref uuid, p_currency char(3))
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.ledger_accounts
  where organization_id = p_org and type = p_type and ref_id is not distinct from p_ref and currency = p_currency;
  if v_id is null then
    insert into public.ledger_accounts (organization_id, type, ref_id, currency)
    values (p_org, p_type, p_ref, p_currency)
    on conflict (organization_id, type, ref_id, currency) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.ledger_accounts
      where organization_id = p_org and type = p_type and ref_id is not distinct from p_ref and currency = p_currency;
    end if;
  end if;
  return v_id;
end;
$$;

-- Account of a party of a debt.
create or replace function private.party_account(
  p_org uuid, p_party public.charge_party, p_charge_type public.charge_type, p_contract uuid, p_currency char(3))
returns uuid
language sql
security definer
set search_path = ''
as $$
  select case p_party
    when 'tenant' then private.ledger_account(p_org, 'tenant', p_contract, p_currency)
    when 'owner' then private.ledger_account(p_org, 'owner', p_contract, p_currency)
    when 'third_party' then private.ledger_account(p_org, 'third_party', p_contract, p_currency)
    else case when p_charge_type = 'fee'
      then private.ledger_account(p_org, 'fees', null, p_currency)
      else private.ledger_account(p_org, 'admin_charges', null, p_currency) end
  end;
$$;

-- Makes the entries of a source (a movement or a debt) equal to p_desired, a
-- jsonb array of {account, amount} with signed amounts (positive = debit).
create or replace function private.post_ledger(
  p_org uuid, p_movement uuid, p_charge uuid, p_currency char(3), p_date date, p_concept text, p_desired jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed boolean;
  v_today date;
  v_posting uuid;
begin
  with desired as (
    select (d->>'account')::uuid as account_id, sum((d->>'amount')::numeric) as amount
    from jsonb_array_elements(p_desired) d
    group by 1
  ), current as (
    select account_id, sum(case direction when 'debit' then amount else -amount end) as amount
    from public.ledger_entries
    where movement_id is not distinct from p_movement and charge_id is not distinct from p_charge
    group by 1
  )
  select exists (
    select 1 from desired d full join current c using (account_id)
    where coalesce(d.amount, 0) <> coalesce(c.amount, 0)
  ) into v_changed;
  if not v_changed then
    return;
  end if;

  select (now() at time zone o.timezone)::date into v_today from public.organizations o where o.id = p_org;

  -- Reverse what is still active.
  v_posting := gen_random_uuid();
  insert into public.ledger_entries
    (organization_id, posting_id, movement_id, charge_id, account_id, direction, amount, currency, date, concept, reversal_of_id)
  select e.organization_id, v_posting, e.movement_id, e.charge_id, e.account_id,
         (case e.direction when 'debit' then 'credit' else 'debit' end)::public.ledger_direction,
         e.amount, e.currency, greatest(v_today, e.date), 'Anulación: ' || e.concept, e.id
  from public.ledger_entries e
  where e.movement_id is not distinct from p_movement and e.charge_id is not distinct from p_charge
    and e.reversal_of_id is null
    and not exists (select 1 from public.ledger_entries r where r.reversal_of_id = e.id);

  -- Post the current state.
  v_posting := gen_random_uuid();
  insert into public.ledger_entries
    (organization_id, posting_id, movement_id, charge_id, account_id, direction, amount, currency, date, concept)
  select p_org, v_posting, p_movement, p_charge, d.account_id,
         (case when d.amount > 0 then 'debit' else 'credit' end)::public.ledger_direction,
         abs(d.amount), p_currency, p_date, p_concept
  from (
    select (d->>'account')::uuid as account_id, sum((d->>'amount')::numeric) as amount
    from jsonb_array_elements(p_desired) d
    group by 1
  ) d
  where d.amount <> 0;
end;
$$;

--------------------------------------------------------------------------------
-- Debts: debtor's account debited, creditor's credited (negative = discount).
--------------------------------------------------------------------------------
create or replace function private.sync_charge_ledger(p_charge uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.charges%rowtype;
  v_contract integer;
  v_desired jsonb := '[]';
begin
  select * into v from public.charges where id = p_charge;
  if not found then return; end if;
  select number into v_contract from public.contracts where id = v.contract_id;
  if v.status <> 'void' and v.type <> 'credit_balance' then
    v_desired := jsonb_build_array(
      jsonb_build_object('account', private.party_account(v.organization_id, v.debtor, v.type, v.contract_id, v.currency), 'amount', v.amount),
      jsonb_build_object('account', private.party_account(v.organization_id, v.creditor, v.type, v.contract_id, v.currency), 'amount', -v.amount)
    );
  end if;
  perform private.post_ledger(
    v.organization_id, null, v.id, v.currency, v.due_date,
    v.title || ' ' || to_char(v.period_month, 'MM/YYYY') || ' · Contrato #' || v_contract,
    v_desired);
end;
$$;

--------------------------------------------------------------------------------
-- Movements.
--   Tenant payment:  cash (or the owners, if paid to them)  /  tenant
--   Settlement:      owners (fees + payouts − deducted debts)  /  fees, cash
--   Manual income:   cash / other_income      Manual expense: expenses / cash
--   Transfer:        destination box / origin box
--------------------------------------------------------------------------------
create or replace function private.sync_movement_ledger(p_movement uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.movements%rowtype;
  v_desired jsonb := '[]';
  v_direct numeric;
  v_cash uuid;
  v_concept text;
begin
  select * into v from public.movements where id = p_movement;
  if not found then return; end if;

  if exists (
    select 1 from public.cash_accounts a
    where a.id in (v.cash_account_id, v.to_cash_account_id) and a.currency <> v.currency
  ) then
    raise exception 'La caja o cuenta es de otra moneda' using errcode = 'check_violation';
  end if;
  if v.cash_account_id is not null then
    v_cash := private.ledger_account(v.organization_id, 'cash', v.cash_account_id, v.currency);
  end if;

  if v.reversed_at is null and v.amount > 0 then
    if v.type = 'tenant_payment' then
      v_direct := case v.method
        when 'transfer_to_owner' then v.amount
        when 'split_transfer' then coalesce(v.owner_direct_amount, 0)
        else 0 end;
      v_desired := jsonb_build_array(
        jsonb_build_object('account', private.ledger_account(v.organization_id, 'tenant', v.contract_id, v.currency), 'amount', -v.amount),
        jsonb_build_object('account', private.ledger_account(v.organization_id, 'owner', v.contract_id, v.currency), 'amount', v_direct));
      if v.amount > v_direct then
        if v_cash is null then
          raise exception 'Falta la caja o cuenta del cobro' using errcode = 'check_violation';
        end if;
        v_desired := v_desired || jsonb_build_object('account', v_cash, 'amount', v.amount - v_direct);
      end if;
    elsif v.type = 'owner_settlement' then
      if v_cash is null then
        raise exception 'Falta la caja o cuenta de la liquidación' using errcode = 'check_violation';
      end if;
      v_desired := jsonb_build_array(jsonb_build_object('account', v_cash, 'amount', -v.amount));
    elsif v.type = 'manual_income' then
      v_desired := jsonb_build_array(
        jsonb_build_object('account', v_cash, 'amount', v.amount),
        jsonb_build_object('account', private.ledger_account(v.organization_id, 'other_income', null, v.currency), 'amount', -v.amount));
    elsif v.type = 'manual_expense' then
      v_desired := jsonb_build_array(
        jsonb_build_object('account', private.ledger_account(v.organization_id, 'expenses', null, v.currency), 'amount', v.amount),
        jsonb_build_object('account', v_cash, 'amount', -v.amount));
    elsif v.type = 'transfer' then
      v_desired := jsonb_build_array(
        jsonb_build_object('account', private.ledger_account(v.organization_id, 'cash', v.to_cash_account_id, v.currency), 'amount', v.amount),
        jsonb_build_object('account', v_cash, 'amount', -v.amount));
    end if;
  end if;

  -- Settlements also post the fees and clear the owners' accounts, even when
  -- nothing is paid out (all of it was deducted or paid directly).
  if v.reversed_at is null and v.type = 'owner_settlement' then
    select v_desired || coalesce(jsonb_agg(jsonb_build_object(
             'account', private.ledger_account(v.organization_id, 'owner', x.contract_id, v.currency), 'amount', x.amount)), '[]')
    into v_desired
    from (
      select ch.contract_id, sum(l.fee - l.fee_owed + l.payout) as amount
      from public.settlement_lines l
      join public.charge_allocations a on a.id = l.allocation_id
      join public.charges ch on ch.id = a.charge_id
      where l.settlement_id = v.id
      group by 1
      union all
      select ch.contract_id, -sum(a.amount)
      from public.charge_allocations a
      join public.charges ch on ch.id = a.charge_id
      where a.movement_id = v.id
      group by 1
    ) x;
    select v_desired || jsonb_build_array(jsonb_build_object(
             'account', private.ledger_account(v.organization_id, 'fees', null, v.currency),
             'amount', -coalesce(sum(l.fee - l.fee_owed), 0)))
    into v_desired
    from public.settlement_lines l
    where l.settlement_id = v.id;
  end if;

  v_concept := case v.type
    when 'tenant_payment' then 'Cobro'
    when 'owner_settlement' then 'Liquidación'
    when 'manual_income' then 'Ingreso'
    when 'manual_expense' then 'Egreso'
    else 'Transferencia' end || ' #' || v.number || coalesce(' · ' || nullif(left(v.notes, 120), ''), '');
  perform private.post_ledger(v.organization_id, v.id, null, v.currency, v.date, v_concept, v_desired);
end;
$$;

--------------------------------------------------------------------------------
-- Triggers: sync at commit; entries balanced and immutable.
--------------------------------------------------------------------------------
create or replace function private.charge_ledger_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_charge_ledger(new.id);
  return null;
end;
$$;

create constraint trigger charges_ledger
  after insert or update on public.charges
  deferrable initially deferred
  for each row execute function private.charge_ledger_trigger();

create or replace function private.movement_ledger_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_movement_ledger(new.id);
  return null;
end;
$$;

create constraint trigger movements_ledger
  after insert or update on public.movements
  deferrable initially deferred
  for each row execute function private.movement_ledger_trigger();

create or replace function private.check_posting_balanced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.ledger_entries
    where posting_id = new.posting_id
    group by currency
    having sum(case direction when 'debit' then amount else -amount end) <> 0
  ) then
    raise exception 'Asiento desbalanceado: %', new.concept using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger ledger_entries_balanced
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function private.check_posting_balanced();

create or replace function private.protect_ledger_entries()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Entries only go away with their whole organization: deleting it (cascade), or
  -- the test cleanup, which marks the organization it purges (app users have no
  -- delete grant on this table anyway).
  if tg_op = 'DELETE' and (
    not exists (select 1 from public.organizations where id = old.organization_id)
    or current_setting('rentavle.purge_organization', true) = old.organization_id::text
  ) then
    return old;
  end if;
  raise exception 'Los asientos contables no se modifican ni se borran: se corrigen con reversas'
    using errcode = 'check_violation';
end;
$$;

create trigger ledger_entries_protect
  before update or delete on public.ledger_entries
  for each row execute function private.protect_ledger_entries();

--------------------------------------------------------------------------------
-- Backfill: post what already exists.
--------------------------------------------------------------------------------
select private.sync_charge_ledger(id) from public.charges order by created_at;
select private.sync_movement_ledger(id) from public.movements order by created_at;
