-- Run this entire file in the Supabase SQL Editor.
-- It is safe to rerun.

create table if not exists public.tracked_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0 and char_length(name) <= 48),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tracked_items_user_created_idx
  on public.tracked_items (user_id, created_at asc);

alter table public.tracked_items enable row level security;

create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  value integer not null check (value >= 0 and value <= 999),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.daily_entries
  add column if not exists item_id uuid references public.tracked_items(id) on delete cascade;

insert into public.tracked_items (user_id, name)
select distinct user_id, 'Daily Count'
from public.daily_entries
where item_id is null
  and not exists (
    select 1
    from public.tracked_items
    where tracked_items.user_id = daily_entries.user_id
  );

update public.daily_entries
set item_id = tracked_items.id
from public.tracked_items
where daily_entries.item_id is null
  and tracked_items.user_id = daily_entries.user_id;

alter table public.daily_entries
  alter column item_id set not null;

alter table public.daily_entries
  drop constraint if exists daily_entries_user_date_unique;

alter table public.daily_entries
  drop constraint if exists daily_entries_user_item_date_unique;

alter table public.daily_entries
  add constraint daily_entries_user_item_date_unique unique (user_id, item_id, entry_date);

create index if not exists daily_entries_user_item_date_idx
  on public.daily_entries (user_id, item_id, entry_date desc);

alter table public.daily_entries enable row level security;

drop policy if exists "Users can read their own tracked items" on public.tracked_items;
create policy "Users can read their own tracked items"
  on public.tracked_items
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own tracked items" on public.tracked_items;
create policy "Users can insert their own tracked items"
  on public.tracked_items
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own tracked items" on public.tracked_items;
create policy "Users can update their own tracked items"
  on public.tracked_items
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own tracked items" on public.tracked_items;
create policy "Users can delete their own tracked items"
  on public.tracked_items
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own daily entries" on public.daily_entries;
create policy "Users can read their own daily entries"
  on public.daily_entries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own daily entries" on public.daily_entries;
create policy "Users can insert their own daily entries"
  on public.daily_entries
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.tracked_items
      where tracked_items.id = daily_entries.item_id
        and tracked_items.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can update their own daily entries" on public.daily_entries;
create policy "Users can update their own daily entries"
  on public.daily_entries
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.tracked_items
      where tracked_items.id = daily_entries.item_id
        and tracked_items.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete their own daily entries" on public.daily_entries;
create policy "Users can delete their own daily entries"
  on public.daily_entries
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.users
  where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
