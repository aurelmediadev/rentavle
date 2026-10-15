-- A voided debt can be restored (back to pending, same amount and parties); any
-- other change to a voided debt is still rejected. Used when an early termination
-- is undone, and by users who voided a debt by mistake.

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
    if new.status = 'pending' and new.amount = old.amount and new.currency = old.currency
       and new.debtor = old.debtor and new.creditor = old.creditor then
      return new; -- restore
    end if;
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
