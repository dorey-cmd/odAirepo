-- Adds the extra signup fields (name/phone/firm size) collected on the
-- signup form. All optional - existing rows just get nulls.

alter table profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists office_size int;

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

  insert into profiles (user_id, default_org_id, full_name, first_name, last_name, phone, office_size)
  values (
    new.id,
    new_org_id,
    trim(both ' ' from concat_ws(' ', new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'last_name')),
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
    nullif(new.raw_user_meta_data ->> 'office_size', '')::int
  );

  return new;
end;
$$;
