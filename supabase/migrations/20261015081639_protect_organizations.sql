-- Admins edit their agency's data (name, fiscal data, branding), but never the
-- fields that billing and the rest of the system depend on: those change only
-- through trusted server code (security definer functions, jobs, webhooks).

create or replace function private.protect_organizations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
    new.country_code, new.default_currency, new.subscription_status, new.trial_ends_at, new.created_by
  ) is distinct from (
    old.country_code, old.default_currency, old.subscription_status, old.trial_ends_at, old.created_by
  ) then
    raise exception 'No se puede cambiar el país, la moneda ni la suscripción de la inmobiliaria'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger organizations_protect
  before update on public.organizations
  for each row execute function private.protect_organizations();
