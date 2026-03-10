create extension if not exists pgcrypto;

create table if not exists public.shopping_lists (
  list_id text primary key,
  payload jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.shopping_lists enable row level security;

drop policy if exists "read_all" on public.shopping_lists;
create policy "read_all"
on public.shopping_lists
for select
using (true);

drop policy if exists "insert_all" on public.shopping_lists;
create policy "insert_all"
on public.shopping_lists
for insert
with check (true);

drop policy if exists "update_all" on public.shopping_lists;
create policy "update_all"
on public.shopping_lists
for update
using (true)
with check (true);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_updated_at_shopping_lists on public.shopping_lists;
create trigger trg_touch_updated_at_shopping_lists
before update on public.shopping_lists
for each row
execute function public.touch_updated_at();
