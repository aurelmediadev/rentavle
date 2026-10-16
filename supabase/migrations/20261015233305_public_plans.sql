-- Prices are public: the marketing site (/precios) reads the active plans
-- without a session.
grant select on public.plans to anon;
create policy "plans: anyone reads active ones" on public.plans
  for select to anon using (is_active);
