-- OdAI: Contract Environment SaaS — initial schema (Phase A + tables needed by later phases)
-- Multi-tenancy is modeled as org -> members (not user -> data) so a firm with
-- multiple lawyer seats can be added later without restructuring.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_org_id uuid references orgs(id),
  full_name text,
  locale text not null default 'he',
  created_at timestamptz not null default now()
);

-- Helper used by every RLS policy below. security definer so it can read
-- org_members regardless of the caller's own RLS visibility into that table.
create or replace function current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from org_members where user_id = auth.uid()
$$;

-- Auto-provision an org + membership + profile for every new Supabase Auth user.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  insert into orgs (name)
  values (coalesce(new.raw_user_meta_data ->> 'org_name', new.email))
  returning id into new_org_id;

  insert into org_members (org_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  insert into profiles (user_id, default_org_id, full_name)
  values (new.id, new_org_id, new.raw_user_meta_data ->> 'full_name');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Contract Environments
-- ---------------------------------------------------------------------------

create table contract_environments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  description text,
  storage_provider text not null default 'supabase' check (storage_provider in ('supabase', 'google_drive')),
  google_drive_root_folder_id text,
  webhook_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table environment_field_definitions (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references contract_environments(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  field_key text not null,
  label text not null,
  data_type text not null check (data_type in ('string', 'number', 'date', 'boolean', 'enum', 'text')),
  is_required boolean not null default true,
  description text,
  extraction_hints text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (environment_id, field_key)
);

create table environment_files (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references contract_environments(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  file_role text not null check (file_role in ('template', 'guidelines', 'reference', 'font', 'exhibit', 'other')),
  storage_provider text not null check (storage_provider in ('supabase', 'google_drive')),
  storage_path text,
  google_drive_file_id text,
  original_filename text not null,
  mime_type text,
  size_bytes bigint,
  extracted_text text,
  extracted_style_catalog jsonb,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table environment_learned_rules (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references contract_environments(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  source_contract_id uuid,
  topic text,
  rule_text text not null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table storage_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references orgs(id) on delete cascade,
  provider text not null default 'google_drive',
  drive_account_email text,
  drive_root_folder_id text,
  encrypted_refresh_token text,
  access_token text,
  access_token_expires_at timestamptz,
  scopes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contracts (instances)
-- ---------------------------------------------------------------------------

create table contracts (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references contract_environments(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  title text,
  status text not null default 'intake' check (status in
    ('intake', 'awaiting_info', 'drafting', 'draft_ready', 'revising', 'finalized', 'archived', 'error')),
  intake_source text check (intake_source in ('webhook', 'manual_upload', 'manual_form')),
  raw_intake_event_id uuid,
  extracted_fields jsonb not null default '{}'::jsonb,
  missing_fields jsonb not null default '[]'::jsonb,
  current_draft_version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contract_files (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  file_role text not null check (file_role in ('intake_upload', 'draft_version', 'supporting_upload')),
  storage_provider text not null check (storage_provider in ('supabase', 'google_drive')),
  storage_path text,
  google_drive_file_id text,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  version int,
  extracted_text text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table contract_chats (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null unique references contracts(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table contract_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references contract_chats(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  role text not null check (role in ('lawyer', 'assistant', 'system')),
  content text,
  tool_call jsonb,
  attachment_file_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table webhook_intake_events (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references contract_environments(id) on delete cascade,
  org_id uuid not null references orgs(id) on delete cascade,
  received_at timestamptz not null default now(),
  source_ip text,
  content_type text,
  raw_payload jsonb,
  raw_files jsonb,
  verified boolean not null default false,
  processing_status text not null default 'received' check (processing_status in
    ('received', 'processing', 'parsed', 'contract_created', 'error')),
  error_message text,
  contract_id uuid references contracts(id),
  created_at timestamptz not null default now()
);

alter table contracts
  add constraint contracts_raw_intake_event_id_fkey
  foreign key (raw_intake_event_id) references webhook_intake_events(id);

create table ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  contract_id uuid references contracts(id),
  purpose text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security — every table isolated by org_id via current_org_ids().
-- Service-role clients (webhook ingestion, background processing) bypass RLS
-- entirely and are responsible for setting org_id/environment_id correctly.
-- ---------------------------------------------------------------------------

alter table orgs enable row level security;
alter table org_members enable row level security;
alter table profiles enable row level security;
alter table contract_environments enable row level security;
alter table environment_field_definitions enable row level security;
alter table environment_files enable row level security;
alter table environment_learned_rules enable row level security;
alter table storage_connections enable row level security;
alter table contracts enable row level security;
alter table contract_files enable row level security;
alter table contract_chats enable row level security;
alter table contract_chat_messages enable row level security;
alter table webhook_intake_events enable row level security;
alter table ai_usage_log enable row level security;

create policy org_isolation on orgs for all using (id in (select current_org_ids()));
create policy org_isolation on org_members for all using (org_id in (select current_org_ids()));
create policy self_profile on profiles for all using (user_id = auth.uid());
create policy org_isolation on contract_environments for all using (org_id in (select current_org_ids()));
create policy org_isolation on environment_field_definitions for all using (org_id in (select current_org_ids()));
create policy org_isolation on environment_files for all using (org_id in (select current_org_ids()));
create policy org_isolation on environment_learned_rules for all using (org_id in (select current_org_ids()));
create policy org_isolation on storage_connections for all using (org_id in (select current_org_ids()));
create policy org_isolation on contracts for all using (org_id in (select current_org_ids()));
create policy org_isolation on contract_files for all using (org_id in (select current_org_ids()));
create policy org_isolation on contract_chats for all using (org_id in (select current_org_ids()));
create policy org_isolation on contract_chat_messages for all using (org_id in (select current_org_ids()));
create policy org_isolation on webhook_intake_events for all using (org_id in (select current_org_ids()));
create policy org_isolation on ai_usage_log for all using (org_id in (select current_org_ids()));

-- ---------------------------------------------------------------------------
-- Storage buckets (default backend)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('environment-files', 'environment-files', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('contract-files', 'contract-files', false)
on conflict (id) do nothing;

-- Path convention: {org_id}/... — matches lib/storage/providers/supabaseStorageProvider.ts
create policy org_isolation_read on storage.objects for select
  using (bucket_id in ('environment-files', 'contract-files')
    and (storage.foldername(name))[1]::uuid in (select current_org_ids()));

create policy org_isolation_write on storage.objects for insert
  with check (bucket_id in ('environment-files', 'contract-files')
    and (storage.foldername(name))[1]::uuid in (select current_org_ids()));

create policy org_isolation_delete on storage.objects for delete
  using (bucket_id in ('environment-files', 'contract-files')
    and (storage.foldername(name))[1]::uuid in (select current_org_ids()));
