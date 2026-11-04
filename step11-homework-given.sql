-- step11-homework-given.sql — Submit my day, step 2 (Nov 2026)
-- Teachers answer "Did you give today's homework?" for each approved homework of their classes.
-- Run once in the TeachBot Supabase project (SQL Editor → paste → Run).
alter table teacher_day_reports add column if not exists hw_given jsonb default '[]'::jsonb;
notify pgrst, 'reload schema';
