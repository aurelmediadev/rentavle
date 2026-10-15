-- Subscriptions: an admin starts one (pending); from then on only the payment
-- provider's webhook (server code) changes it and the organization's status.

revoke all on public.subscriptions, public.subscription_payments from anon;
revoke update, delete on public.subscriptions from authenticated;
revoke insert, update, delete on public.subscription_payments from authenticated;

create policy "subscriptions: admins read" on public.subscriptions
  for select to authenticated using (private.has_role(organization_id, 'admin'));
create policy "subscriptions: admins start" on public.subscriptions
  for insert to authenticated
  with check (
    private.has_role(organization_id, 'admin')
    and status = 'pending'
    and created_by = (select auth.uid())
    and exists (select 1 from public.plans p where p.id = plan_id and p.is_active)
  );

create policy "subscription_payments: admins read" on public.subscription_payments
  for select to authenticated using (private.has_role(organization_id, 'admin'));
