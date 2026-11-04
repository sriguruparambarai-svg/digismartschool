-- step10-notebook-check.sql — Notebook check (Nov 2026)
-- The principal or an office staff member picks a few children's notebooks at random
-- for a class + subject and marks each one: corrected / partly / not corrected / not brought.
-- Each teacher gets a monthly score from this. Parents never see it.
-- Run once in the TeachBot Supabase project (SQL Editor → paste → Run).

create table if not exists notebook_checks (
  id              uuid primary key default gen_random_uuid(),
  school_id       text not null,
  check_date      date not null,
  class_name      text not null,
  subject         text not null,
  teacher_app_id  text,                 -- the subject teacher (from My Teachers), found by the server
  teacher_name    text,
  roll            text not null,
  child_name      text,
  result          text not null check (result in ('corrected','partly','not_corrected','not_brought')),
  note            text,
  checked_by      text,                 -- "Principal" or the office staff member's name
  checked_by_id   text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_nb_school_date on notebook_checks (school_id, check_date desc);
create index if not exists idx_nb_teacher on notebook_checks (teacher_app_id, check_date desc);
create index if not exists idx_nb_class_subject on notebook_checks (school_id, class_name, subject, check_date desc);

-- Locked: only the server (api/teacher-app.js) reads and writes this table.
alter table notebook_checks enable row level security;

-- How many notebooks to check per class + subject each week (each school's choice, default 5)
alter table teacher_app_settings add column if not exists nb_per_week int;

-- The "Check yesterday's homework by" time on the Teachers tab (was missing)
alter table teacher_app_settings add column if not exists hw_check_by text;

notify pgrst, 'reload schema';
