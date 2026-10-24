-- Learning Projects migration for J2D DataOps. Run in Supabase SQL Editor.
alter table public.question_answers add column if not exists integrity_flags jsonb not null default '[]'::jsonb;
alter table public.question_answers add column if not exists typing_seconds integer not null default 0;
alter table public.question_answers add column if not exists answer_version integer not null default 1;
create table if not exists public.learning_project_progress (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 project_key text not null check(project_key in ('sql-foundation','pyspark-pipeline','databricks-lakehouse','adf-orchestration','end-to-end-capstone')),
 status text not null default 'not_started' check(status in ('not_started','in_progress','completed')),
 completed_steps jsonb not null default '[]'::jsonb,
 reflection text not null default '',
 artifact_url text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,project_key)
);
create index if not exists learning_project_progress_user_idx on public.learning_project_progress(user_id);
create index if not exists learning_project_progress_status_idx on public.learning_project_progress(status);
alter table public.learning_project_progress enable row level security;
drop policy if exists "members read own project progress admin reads all" on public.learning_project_progress;
create policy "members read own project progress admin reads all" on public.learning_project_progress for select to authenticated using(user_id=auth.uid() or public.current_user_role()='admin');
drop policy if exists "members insert own project progress" on public.learning_project_progress;
create policy "members insert own project progress" on public.learning_project_progress for insert to authenticated with check(user_id=auth.uid());
drop policy if exists "members update own project progress admin updates all" on public.learning_project_progress;
create policy "members update own project progress admin updates all" on public.learning_project_progress for update to authenticated using(user_id=auth.uid() or public.current_user_role()='admin') with check(user_id=auth.uid() or public.current_user_role()='admin');
drop policy if exists "members delete own project progress admin deletes all" on public.learning_project_progress;
create policy "members delete own project progress admin deletes all" on public.learning_project_progress for delete to authenticated using(user_id=auth.uid() or public.current_user_role()='admin');
