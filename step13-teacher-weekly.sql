-- step13-teacher-weekly.sql — Teacher's Weekly Checklist (Nov 2026)
-- Each teacher fills a printed checklist every evening (portion done, yesterday's homework corrected,
-- revision done, class test held, complaints) and hands it in on Saturday. The office photographs it in
-- Teachers' Report; what was read is saved here, one row per teacher per week.
-- Scores show in My School's Academics → Teachers (principal only) and go to the owner monthly.
-- Run once in the TeachBot Supabase project (SQL Editor → paste → Run). Safe to run again.

create table if not exists teacher_weekly (
  school_id    text not null,
  teacher_id   text not null,            -- teacher_app.id
  teacher_name text,
  week_start   date not null,            -- the Monday
  rows         jsonb not null default '[]',   -- [{date, class_name, subject, portion, hw, revision, test}] each 'yes'|'no'|'blank'|'na'
  complaints   jsonb not null default '[]',   -- [{date, text}]
  saved_by     text,
  saved_at     timestamptz not null default now(),
  primary key (school_id, teacher_id, week_start)
);
create index if not exists idx_tw_school_week on teacher_weekly (school_id, week_start desc);

-- Locked: only the server (api/teacher-app.js) reads and writes this table.
alter table teacher_weekly enable row level security;
