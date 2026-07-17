import { supabase } from "./supabaseClient";

// Query helpers shared by the board, search, profiles and rivals UI.
// All reads go through the anon-key client; RLS does the gatekeeping.

export interface PlayerSummary {
  id: string;
  nickname: string;
}

export interface PlayerProfileData {
  id: string;
  nickname: string;
  createdAt: string;
  stats: Record<string, number>;
  statsUpdatedAt: string | null;
}

export interface BoardRow {
  userId: string;
  nickname: string;
  value: number;
  rank: number;
}

export interface BoardResult {
  rows: BoardRow[];
  total: number;
  myRank: number | null;
  myValue: number | null;
}

export type BoardView = "top" | "me" | "bottom";

const PAGE = 25;

function statNum(stats: unknown, key: string): number {
  return Number((stats as Record<string, unknown> | null)?.[key] ?? 0);
}

export async function searchPlayers(query: string): Promise<PlayerSummary[]> {
  if (!supabase) return [];
  const q = query.trim().replace(/[%_]/g, "");
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname")
    .ilike("nickname", `%${q}%`)
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ id: r.id as string, nickname: r.nickname as string }));
}

export async function fetchPlayerProfile(nickname: string): Promise<PlayerProfileData | null> {
  if (!supabase) return null;
  const { data: prof, error } = await supabase
    .from("profiles")
    .select("id, nickname, created_at")
    .ilike("nickname", nickname.replace(/[%_]/g, ""))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!prof) return null;
  const { data: stats } = await supabase
    .from("leaderboard_stats")
    .select("stats, updated_at")
    .eq("user_id", prof.id)
    .maybeSingle();
  return {
    id: prof.id as string,
    nickname: prof.nickname as string,
    createdAt: prof.created_at as string,
    stats: (stats?.stats as Record<string, number>) ?? {},
    statsUpdatedAt: (stats?.updated_at as string) ?? null,
  };
}

/** Rank for a handful of headline metrics (one cheap count query each). */
export async function fetchRanksFor(
  stats: Record<string, number>,
  keys: string[]
): Promise<Record<string, number>> {
  if (!supabase) return {};
  const out: Record<string, number> = {};
  await Promise.all(
    keys.map(async (key) => {
      const v = stats[key] ?? 0;
      if (v <= 0) return;
      const { count } = await supabase!
        .from("leaderboard_stats")
        .select("user_id", { count: "exact", head: true })
        .gt(`stats->${key}`, v);
      out[key] = (count ?? 0) + 1;
    })
  );
  return out;
}

// ---- Rivals ---------------------------------------------------------------

export async function fetchRivals(): Promise<PlayerSummary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("rivals")
    .select("rival_id, profiles!rivals_rival_id_fkey(nickname)");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.rival_id as string,
    nickname: (r.profiles as unknown as { nickname: string } | null)?.nickname ?? "???",
  }));
}

export async function addRival(userId: string, rivalId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("rivals").insert({ user_id: userId, rival_id: rivalId });
  // 23505 = already a rival — treat as success
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function removeRival(userId: string, rivalId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("rivals").delete().eq("user_id", userId).eq("rival_id", rivalId);
  if (error) throw new Error(error.message);
}

// ---- Board windows --------------------------------------------------------

interface BoardOpts {
  metric: string;
  view: BoardView;
  myUserId: string | null;
  /** When set, restrict the board to these user ids (rivals scope: me + rivals). */
  scopeIds?: string[];
}

export async function fetchBoardWindow({ metric, view, myUserId, scopeIds }: BoardOpts): Promise<BoardResult> {
  if (!supabase) return { rows: [], total: 0, myRank: null, myValue: null };
  const path = `stats->${metric}`;

  const base = () => {
    let q = supabase!.from("leaderboard_stats").select("user_id, stats, profiles(nickname)").gt(path, 0);
    if (scopeIds) q = q.in("user_id", scopeIds);
    return q;
  };
  const counter = () => {
    let q = supabase!.from("leaderboard_stats").select("user_id", { count: "exact", head: true }).gt(path, 0);
    if (scopeIds) q = q.in("user_id", scopeIds);
    return q;
  };

  const { count: totalCount, error: totalErr } = await counter();
  if (totalErr) throw new Error(totalErr.message);
  const total = totalCount ?? 0;

  // My value + rank (within the current scope)
  let myRank: number | null = null;
  let myValue: number | null = null;
  if (myUserId && (!scopeIds || scopeIds.includes(myUserId))) {
    const { data: mine } = await supabase
      .from("leaderboard_stats").select("stats").eq("user_id", myUserId).maybeSingle();
    const v = statNum(mine?.stats, metric);
    if (v > 0) {
      const { count } = await counter().gt(path, v);
      myValue = v;
      myRank = (count ?? 0) + 1;
    }
  }

  let offset: number;
  if (view === "top") {
    offset = 0;
  } else if (view === "bottom") {
    offset = Math.max(0, total - PAGE);
  } else {
    // "me": centre the window on my rank; fall back to the top when unranked.
    offset = myRank == null ? 0 : Math.min(Math.max(0, myRank - 1 - Math.floor(PAGE / 2)), Math.max(0, total - PAGE));
  }

  const { data, error } = await base()
    .order(path, { ascending: false })
    .range(offset, offset + PAGE - 1);
  if (error) throw new Error(error.message);

  const rows: BoardRow[] = (data ?? []).map((r, i) => ({
    userId: r.user_id as string,
    nickname: (r.profiles as unknown as { nickname: string } | null)?.nickname ?? "???",
    value: statNum(r.stats, metric),
    rank: offset + i + 1,
  }));

  return { rows, total, myRank, myValue };
}
