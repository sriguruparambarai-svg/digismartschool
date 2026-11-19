-- TeachBot — Global Language Master add-on (Nov 2026)
-- Run once in TeachBot's Supabase → SQL Editor. Safe to run again.
alter table public.schools add column if not exists has_glm boolean default false;
alter table public.schools add column if not exists glm_code text;
