-- ============================================================================
-- Idle Potion Brewer — online leaderboard, cloud saves & GDPR delete
-- Paste this whole file into the Supabase SQL Editor and Run.
-- Safe to re-run: everything is IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles: one row per authenticated player. Nickname is a ONE-TIME choice —
-- there is deliberately no UPDATE policy, so it can never be changed via the
-- public API once claimed.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nickname   text not null,
  created_at timestamptz not null default now(),
  -- 3–20 chars, letters/digits/underscore/space, no leading/trailing space
  constraint nickname_format check (
    nickname ~ '^[A-Za-z0-9_][A-Za-z0-9_ ]{1,18}[A-Za-z0-9_]$'
  )
);

-- Case-insensitive uniqueness ("Brewmaster" and "brewmaster" collide).
create unique index if not exists profiles_nickname_lower_key
  on public.profiles (lower(nickname));

alter table public.profiles enable row level security;

drop policy if exists "profiles are publicly readable" on public.profiles;
create policy "profiles are publicly readable"
  on public.profiles for select using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert with check (auth.uid() = id);
-- no update/delete policies: nickname is immutable; deletion goes through
-- delete_my_account() below (cascades from auth.users).

-- ---------------------------------------------------------------------------
-- leaderboard_stats: one jsonb bag of numeric metrics per player.
-- Publicly readable; writable ONLY through the sync_stats() RPC below
-- (no insert/update policies on the table itself).
-- ---------------------------------------------------------------------------
create table if not exists public.leaderboard_stats (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  stats      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.leaderboard_stats enable row level security;

drop policy if exists "stats are publicly readable" on public.leaderboard_stats;
create policy "stats are publicly readable"
  on public.leaderboard_stats for select using (true);

-- ---------------------------------------------------------------------------
-- saves: full save-game snapshot per player, for cross-device restore.
-- Strictly private to the owning user.
-- ---------------------------------------------------------------------------
create table if not exists public.saves (
  user_id  uuid primary key references public.profiles (id) on delete cascade,
  data     jsonb not null,
  saved_at timestamptz not null default now()
);

alter table public.saves enable row level security;

drop policy if exists "users read own save" on public.saves;
create policy "users read own save"
  on public.saves for select using (auth.uid() = user_id);

drop policy if exists "users insert own save" on public.saves;
create policy "users insert own save"
  on public.saves for insert with check (auth.uid() = user_id);

drop policy if exists "users update own save" on public.saves;
create policy "users update own save"
  on public.saves for update using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- sync_stats(p_stats): the ONLY write path for leaderboard stats.
--
-- Low-cost anti-cheat: monotonic counters may only grow by a generous
-- per-second ceiling times the real (server-clocked) time since the last
-- sync. Anything above the ceiling is silently clamped — an edited
-- localStorage save still climbs the board, but only at max-legit speed.
-- The very first sync is accepted as-is (it's the player's pre-existing,
-- offline-earned history; there is nothing to diff against).
-- ---------------------------------------------------------------------------
create or replace function public.sync_stats(p_stats jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  prev     public.leaderboard_stats%rowtype;
  elapsed  numeric;
  accepted jsonb := '{}'::jsonb;
  k        text;
  v        numeric;
  old_v    numeric;
  cap      numeric;
  -- Generous per-second growth ceilings for monotonic counters. A player
  -- returning after N hours offline also has N hours of elapsed budget,
  -- so legitimate offline catch-up always fits.
  rates jsonb := jsonb_build_object(
    'lifetime_coins',        20000,  -- coins/sec, ~10x a maxed auto-sell economy
    'total_brews',           50,
    'potions_sold',          200,    -- sell-all can dump a big stockpile at once
    'potions_discovered',    20,
    'ingredients_gathered',  500,
    'quests_completed',      1,
    'trades_completed',      5,
    'days_played',           0.01    -- 1 game day = 180s real time
  );
  -- Absolute hard limits regardless of time (structural game maxima, padded).
  maxima jsonb := jsonb_build_object(
    'machines',           5,
    'workers',            200,
    'locations',          500,
    'regions',            6,
    'achievements',       500,
    'recipes_mastered',   5000,
    'mastery_nodes',      200,
    'best_potion_value',  10000000
  );
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'no profile';
  end if;

  select * into prev from public.leaderboard_stats where user_id = uid;

  if prev.user_id is null then
    -- First sync: accept the pre-existing save's history as the baseline.
    accepted := p_stats;
  else
    elapsed := greatest(extract(epoch from (now() - prev.updated_at)), 30);
    for k, v in
      select key, (case when jsonb_typeof(value) = 'number'
                        then value::text::numeric else 0 end)
      from jsonb_each(p_stats)
    loop
      old_v := coalesce((prev.stats ->> k)::numeric, 0);

      if rates ? k then
        -- Monotonic counter: never decreases, growth rate-clamped.
        cap := old_v + (rates ->> k)::numeric * elapsed;
        v := greatest(old_v, least(v, cap));
      elsif k like 'attr_%' then
        -- Per-attribute brew counters grow at the total-brew rate at most.
        cap := old_v + (rates ->> 'total_brews')::numeric * elapsed;
        v := greatest(old_v, least(v, cap));
      elsif maxima ? k then
        v := least(v, (maxima ->> k)::numeric);
      end if;
      accepted := accepted || jsonb_build_object(k, v);
    end loop;

    -- Cross-field invariants (all cheap arithmetic):
    -- current coins can never exceed lifetime earnings (+starting stipend pad)
    if accepted ? 'coins' and accepted ? 'lifetime_coins' then
      accepted := jsonb_set(accepted, '{coins}', to_jsonb(
        least((accepted ->> 'coins')::numeric,
              (accepted ->> 'lifetime_coins')::numeric + 1000)));
    end if;
    -- you can't have sold or discovered more potions than you ever brewed
    if accepted ? 'potions_sold' and accepted ? 'total_brews' then
      accepted := jsonb_set(accepted, '{potions_sold}', to_jsonb(
        least((accepted ->> 'potions_sold')::numeric,
              (accepted ->> 'total_brews')::numeric)));
    end if;
    if accepted ? 'potions_discovered' and accepted ? 'total_brews' then
      accepted := jsonb_set(accepted, '{potions_discovered}', to_jsonb(
        least((accepted ->> 'potions_discovered')::numeric,
              (accepted ->> 'total_brews')::numeric)));
    end if;
  end if;

  insert into public.leaderboard_stats (user_id, stats, updated_at)
  values (uid, accepted, now())
  on conflict (user_id) do update
    set stats = excluded.stats, updated_at = now();

  return accepted;
end;
$$;

revoke all on function public.sync_stats(jsonb) from public;
grant execute on function public.sync_stats(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_my_account(): GDPR "delete my data". Removes the auth user; the
-- profile, stats and save all cascade away with it.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ============================================================================
-- OPTIONAL DEMO SEED — 8 fake players so the leaderboard isn't empty while
-- you tweak the UI. Run the block below once if you want them; remove them
-- later with the single DELETE at the very bottom.
-- ============================================================================
-- do $$
-- declare
--   names text[] := array['Grimble','MossWitch','Cauldronella','PetalPuncher',
--                         'SirBrewsalot','TheDecoction','NightshadeNed','FizzleTop'];
--   n text; uid uuid; i int := 0;
-- begin
--   foreach n in array names loop
--     i := i + 1;
--     uid := gen_random_uuid();
--     insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
--     values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
--             'demo-' || i || '@example.invalid', '', now(), now(), now(),
--             '{"provider":"email","providers":["email"],"demo_seed":true}', '{}');
--     insert into public.profiles (id, nickname) values (uid, n);
--     insert into public.leaderboard_stats (user_id, stats) values (uid, jsonb_build_object(
--       'coins',                (random()*400000)::int,
--       'lifetime_coins',       (500000 + random()*4000000)::int,
--       'total_brews',          (2000 + random()*80000)::int,
--       'potions_discovered',   (10 + random()*300)::int,
--       'potions_sold',         (1000 + random()*60000)::int,
--       'ingredients_gathered', (5000 + random()*200000)::int,
--       'workers',              (1 + random()*14)::int,
--       'machines',             (1 + random()*4)::int,
--       'locations',            (1 + random()*40)::int,
--       'regions',              (1 + random()*5)::int,
--       'achievements',         (random()*40)::int,
--       'quests_completed',     (random()*250)::int,
--       'trades_completed',     (random()*900)::int,
--       'recipes_mastered',     (random()*25)::int,
--       'mastery_nodes',        (random()*15)::int,
--       'best_potion_value',    (100 + random()*90000)::int,
--       'days_played',          (1 + random()*200)::int,
--       'attr_heat',            (random()*20000)::int,
--       'attr_cold',            (random()*20000)::int,
--       'attr_mana',            (random()*20000)::int,
--       'attr_luck',            (random()*20000)::int,
--       'attr_toxicity',        (random()*20000)::int
--     ));
--   end loop;
-- end $$;

-- To remove the demo players later:
-- delete from auth.users where raw_app_meta_data ->> 'demo_seed' = 'true';
