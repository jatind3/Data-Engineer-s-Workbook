-- J2D DataOps Timesheet: Supabase schema
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text not null default 'Team Member',
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'member'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.workbook_sheets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  table_columns jsonb not null default '[]'::jsonb,
  raw_columns jsonb not null default '[]'::jsonb,
  header_row integer,
  raw_row_count integer not null default 0,
  max_column integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.workbook_rows (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  sheet_id uuid not null references public.workbook_sheets(id) on delete cascade,
  view_type text not null check (view_type in ('table','raw')),
  source_row integer not null default 0,
  sort_order integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workbook_rows_sheet_view_order_idx
on public.workbook_rows(sheet_id, view_type, sort_order);
create index if not exists workbook_rows_data_gin_idx
on public.workbook_rows using gin(data);

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

alter table public.profiles enable row level security;
alter table public.workbook_sheets enable row level security;
alter table public.workbook_rows enable row level security;

drop policy if exists "profiles read self or admin" on public.profiles;
create policy "profiles read self or admin" on public.profiles
for select to authenticated using (id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "admin update profiles" on public.profiles;
create policy "admin update profiles" on public.profiles
for update to authenticated using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "authenticated read sheets" on public.workbook_sheets;
create policy "authenticated read sheets" on public.workbook_sheets
for select to authenticated using (true);

drop policy if exists "admin manage sheets" on public.workbook_sheets;
create policy "admin manage sheets" on public.workbook_sheets
for all to authenticated using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "authenticated read workbook rows" on public.workbook_rows;
create policy "authenticated read workbook rows" on public.workbook_rows
for select to authenticated using (true);

drop policy if exists "authenticated insert workbook rows" on public.workbook_rows;
create policy "authenticated insert workbook rows" on public.workbook_rows
for insert to authenticated with check (auth.uid() is not null);

drop policy if exists "authenticated update workbook rows" on public.workbook_rows;
create policy "authenticated update workbook rows" on public.workbook_rows
for update to authenticated using (auth.uid() is not null)
with check (auth.uid() is not null);

drop policy if exists "admin delete workbook rows" on public.workbook_rows;
create policy "admin delete workbook rows" on public.workbook_rows
for delete to authenticated using (public.current_user_role() = 'admin');

-- After signing up the designated administrator, run:
-- update public.profiles set role = 'admin' where email = 'admin@yourcompany.com';
