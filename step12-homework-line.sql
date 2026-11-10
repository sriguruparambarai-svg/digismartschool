-- step12-homework-line.sql — Homework Line TEST (Nov 2026)
-- Remembers, for each class + subject, how many of the Lesson Plan's homework have REALLY been given
-- (sent to parents, or set by the principal with "We are here"). Used only by homework-planner-test.html
-- through /api/homework-line. The live Homework Planner and Lesson Planner do not read it.
-- Run once in the TeachBot Supabase project (SQL Editor → paste → Run).
create table if not exists homework_line (
  id            uuid primary key default gen_random_uuid(),
  school_id     text not null,
  class_name    text not null,
  subject       text not null,
  given         integer not null default 0,     -- how many homework of the line are given
  last_text     text default '',                -- the text of the last one given (finds the place again if the plan is changed)
  confirmed     boolean not null default false, -- true once the principal set it, or a homework from the line was sent
  pending_hw_id text default '',                -- the homework put into the week, waiting for 4 PM
  pending_k     integer,                        -- which homework of the line it is
  pending_date  date,
  updated_at    timestamptz default now(),
  unique (school_id, class_name, subject)
);
alter table homework_line enable row level security;
notify pgrst, 'reload schema';
