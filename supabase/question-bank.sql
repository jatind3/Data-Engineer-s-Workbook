-- J2D DataOps Question Bank. Run this in Supabase SQL Editor.
-- Reference answers are in a separate admin-only table; RLS does not hide columns.
create extension if not exists pgcrypto;
create table if not exists public.question_bank (
 id uuid primary key default gen_random_uuid(), title text not null, domain text not null default 'General',
 difficulty text not null default 'Intermediate', question_text text not null, is_published boolean not null default true,
 created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.question_reference_answers (
 question_id uuid primary key references public.question_bank(id) on delete cascade, model_answer text not null default '',
 updated_by uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now()
);
create table if not exists public.question_answers (
 id uuid primary key default gen_random_uuid(), question_id uuid not null references public.question_bank(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, answer_text text not null default '',
 status text not null default 'draft' check(status in ('draft','submitted','reviewed')), reviewer_feedback text,
 submitted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(question_id,user_id)
);
create index if not exists question_bank_domain_published_idx on public.question_bank(domain,is_published);
create index if not exists question_answers_user_status_idx on public.question_answers(user_id,status);
create index if not exists question_answers_question_idx on public.question_answers(question_id);
alter table public.question_bank enable row level security;
alter table public.question_reference_answers enable row level security;
alter table public.question_answers enable row level security;
drop policy if exists "read published questions or admin" on public.question_bank;
create policy "read published questions or admin" on public.question_bank for select to authenticated using(is_published or public.current_user_role()='admin');
drop policy if exists "admin insert questions" on public.question_bank;
create policy "admin insert questions" on public.question_bank for insert to authenticated with check(public.current_user_role()='admin');
drop policy if exists "admin update questions" on public.question_bank;
create policy "admin update questions" on public.question_bank for update to authenticated using(public.current_user_role()='admin') with check(public.current_user_role()='admin');
drop policy if exists "admin delete questions" on public.question_bank;
create policy "admin delete questions" on public.question_bank for delete to authenticated using(public.current_user_role()='admin');
drop policy if exists "admin read reference answers" on public.question_reference_answers;
create policy "admin read reference answers" on public.question_reference_answers for select to authenticated using(public.current_user_role()='admin');
drop policy if exists "admin insert reference answers" on public.question_reference_answers;
create policy "admin insert reference answers" on public.question_reference_answers for insert to authenticated with check(public.current_user_role()='admin');
drop policy if exists "admin update reference answers" on public.question_reference_answers;
create policy "admin update reference answers" on public.question_reference_answers for update to authenticated using(public.current_user_role()='admin') with check(public.current_user_role()='admin');
drop policy if exists "admin delete reference answers" on public.question_reference_answers;
create policy "admin delete reference answers" on public.question_reference_answers for delete to authenticated using(public.current_user_role()='admin');
drop policy if exists "member own answer or admin reads" on public.question_answers;
create policy "member own answer or admin reads" on public.question_answers for select to authenticated using(user_id=auth.uid() or public.current_user_role()='admin');
drop policy if exists "member inserts own answer" on public.question_answers;
create policy "member inserts own answer" on public.question_answers for insert to authenticated with check(user_id=auth.uid() and status in ('draft','submitted') and reviewer_feedback is null);
drop policy if exists "member own answer or admin updates" on public.question_answers;
create policy "member own answer or admin updates" on public.question_answers for update to authenticated using(user_id=auth.uid() or public.current_user_role()='admin') with check((user_id=auth.uid() and status in ('draft','submitted') and reviewer_feedback is null) or public.current_user_role()='admin');
drop policy if exists "member deletes own drafts or admin deletes" on public.question_answers;
create policy "member deletes own drafts or admin deletes" on public.question_answers for delete to authenticated using((user_id=auth.uid() and status='draft') or public.current_user_role()='admin');
create or replace function public.guard_question_answer_update() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if public.current_user_role()='admin' then new.updated_at:=now(); return new; end if;
 if auth.uid() is null or old.user_id<>auth.uid() then raise exception 'You can edit only your own answer'; end if;
 if old.status in ('submitted','reviewed') then raise exception 'Submitted answers are locked. Ask an admin to reopen the answer.'; end if;
 if new.user_id<>old.user_id or new.question_id<>old.question_id or new.reviewer_feedback is distinct from old.reviewer_feedback or new.status not in ('draft','submitted') then raise exception 'Members can only edit their own answer text and submit it'; end if;
 new.updated_at:=now(); return new;
end; $$;
drop trigger if exists guard_question_answer_update on public.question_answers;
create trigger guard_question_answer_update before update on public.question_answers for each row execute function public.guard_question_answer_update();
