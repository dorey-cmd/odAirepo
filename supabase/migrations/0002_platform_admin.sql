-- Platform-level admin role — separate from org_members.role, which is scoped
-- to a single org. A platform admin can see across every tenant (usage,
-- errors, org list) for support/ops purposes. Membership is an allowlist, not
-- self-serve: grant it by inserting a row directly (service role / SQL
-- editor), never through the app.

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;

-- A user may check only their own membership — enough for the app to decide
-- whether to show the admin area. Admin data reads themselves go through the
-- service-role client once membership is confirmed, not through RLS.
create policy self_check on platform_admins for select using (user_id = auth.uid());

create or replace function is_platform_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from platform_admins where user_id = uid)
$$;
