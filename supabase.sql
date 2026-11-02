-- 盤後結構室：會員資料表（在 Supabase 的 SQL Editor 貼上後按 Run）
create table if not exists public.user_data (
  user_id uuid primary key references auth.users on delete cascade,
  watch jsonb not null default '[]'::jsonb,
  holdings jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
-- 每個人只能讀寫自己的資料
alter table public.user_data enable row level security;
drop policy if exists "讀取自己的資料" on public.user_data;
drop policy if exists "新增自己的資料" on public.user_data;
drop policy if exists "修改自己的資料" on public.user_data;
create policy "讀取自己的資料" on public.user_data for select using (auth.uid() = user_id);
create policy "新增自己的資料" on public.user_data for insert with check (auth.uid() = user_id);
create policy "修改自己的資料" on public.user_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
