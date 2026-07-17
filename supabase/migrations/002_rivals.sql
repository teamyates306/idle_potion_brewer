-- ============================================================================
-- Idle Potion Brewer — rivals (private watch-list driving the Rivals board)
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
-- ============================================================================

create table if not exists public.rivals (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  rival_id   uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, rival_id),
  constraint no_self_rivalry check (user_id <> rival_id)
);

alter table public.rivals enable row level security;

-- Strictly private: only the owner ever sees (or edits) their rival list.
-- The rival being watched cannot tell — there is no policy that exposes
-- rows where you are the rival_id.
drop policy if exists "users read own rivals" on public.rivals;
create policy "users read own rivals"
  on public.rivals for select using (auth.uid() = user_id);

drop policy if exists "users add own rivals" on public.rivals;
create policy "users add own rivals"
  on public.rivals for insert with check (auth.uid() = user_id);

drop policy if exists "users remove own rivals" on public.rivals;
create policy "users remove own rivals"
  on public.rivals for delete using (auth.uid() = user_id);
