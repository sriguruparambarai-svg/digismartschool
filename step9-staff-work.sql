-- step9-staff-work.sql — Work to Staff (Oct 2026)
-- The principal gives instructions to teachers; each teacher sees them in
-- the My Day app ("Work" tab) and presses Done when finished.
-- One row per teacher per instruction. Instructions sent together share batch_id.
-- issued_at and done_at are set by the server/database only — teachers cannot choose them.
-- Run once in the TeachBot Supabase project (SQL Editor → paste → Run).

create table if not exists staff_work (
  id            uuid primary key default gen_random_uuid(),
  school_id     text not null,
  batch_id      uuid not null,
  teacher_app_id text not null,
  teacher_name  text,
  title         text not null,
  details       text,
  issued_at     timestamptz not null default now(),
  due_date      date,
  status        text not null default 'pending' check (status in ('pending','done')),
  done_at       timestamptz,
  done_note     text,
  reopened_at   timestamptz,
  reopen_note   text,
  reopen_count  int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_staff_work_school on staff_work (school_id, issued_at desc);
create index if not exists idx_staff_work_teacher on staff_work (teacher_app_id, status);
create index if not exists idx_staff_work_batch on staff_work (batch_id);

-- Locked: only the server (api/teacher-app.js) reads and writes this table.
alter table staff_work enable row level security;
