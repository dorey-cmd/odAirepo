-- Platform-admin "View As" (real session swap, see /admin/view-as): a log of
-- who impersonated whom and when, plus a way to tag an action taken while
-- impersonating back to the real admin who drove it - the underlying DB
-- session genuinely is the target user's (so RLS/every feature just works),
-- but the audit trail should make clear who was really behind the wheel.
create table admin_impersonation_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table admin_impersonation_log enable row level security;
create policy admin_only on admin_impersonation_log for all using (is_platform_admin());

alter table contract_chat_messages add column impersonated_by uuid references auth.users(id);
