-- ============================================================================
-- Idle Potion Brewer — "Restart game" (wipes leaderboard identity, keeps login)
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
-- ============================================================================

-- Deletes the caller's profile row. leaderboard_stats, saves and rivals rows
-- (both as owner and as someone else's rival) all cascade away via their FK
-- ON DELETE CASCADE to profiles. auth.users itself is untouched, so the
-- player stays logged in and can immediately claim a fresh nickname.
create or replace function public.reset_my_progress()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from public.profiles where id = auth.uid();
end;
$$;

revoke all on function public.reset_my_progress() from public;
grant execute on function public.reset_my_progress() to authenticated;
