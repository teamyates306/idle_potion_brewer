import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, Crosshair, Crown, RefreshCw, Search, Swords, X } from "lucide-react";
import { onlineAvailable } from "../../online/supabaseClient";
import { useOnlineStore } from "../../online/onlineStore";
import { METRICS, METRICS_BY_KEY } from "../../online/stats";
import { fetchBoardWindow, searchPlayers, type BoardResult, type BoardView, type PlayerSummary } from "../../online/api";
import { fmt } from "../../util/format";
import { IconWizardHat, IconGlobe, IconMedal } from "../ui/icons";

type Scope = "public" | "rivals";

const GROUPS = Array.from(new Set(METRICS.map((m) => m.group)));

interface Props {
  /** Row / search-result click — the host decides how to show the profile. */
  onSelectPlayer?: (nickname: string) => void;
}

/** The board — shared between the in-game modal and /leaderboard. */
export default function LeaderboardBoard({ onSelectPlayer }: Props) {
  const session = useOnlineStore((s) => s.session);
  const nickname = useOnlineStore((s) => s.nickname);
  const rivals = useOnlineStore((s) => s.rivals);
  const myUserId = session?.user.id ?? null;

  const [metric, setMetric] = useState("lifetime_coins");
  const [scope, setScope] = useState<Scope>("public");
  // Signed-in players open centred on their own rank; visitors see the top.
  const [view, setViewRaw] = useState<BoardView>(myUserId ? "me" : "top");
  const viewTouched = useRef(false);
  const setView = (v: BoardView) => { viewTouched.current = true; setViewRaw(v); };
  useEffect(() => {
    // Session often resolves after mount — snap to "me" once it does, unless
    // the player has already picked a view themselves.
    if (myUserId && !viewTouched.current) setViewRaw("me");
  }, [myUserId]);
  const [board, setBoard] = useState<BoardResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSummary[] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const def = METRICS_BY_KEY[metric];
  const grouped = useMemo(
    () => GROUPS.map((g) => ({ group: g, metrics: METRICS.filter((m) => m.group === g) })),
    []
  );
  const rivalScopeIds = useMemo(
    () => (myUserId ? [myUserId, ...(rivals ?? []).map((r) => r.id)] : []),
    [myUserId, rivals]
  );

  useEffect(() => {
    if (!onlineAvailable) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBoardWindow({
      metric,
      view,
      myUserId,
      scopeIds: scope === "rivals" ? rivalScopeIds : undefined,
    })
      .then((b) => { if (!cancelled) setBoard(b); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [metric, view, scope, myUserId, rivalScopeIds, reloadKey]);

  // Debounced nickname search
  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (query.trim().length < 2) { setResults(null); return; }
    searchTimer.current = setTimeout(() => {
      searchPlayers(query).then(setResults).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [query]);

  if (!onlineAvailable) {
    return (
      <p className="rounded-lg bg-slate-800/50 px-3 py-4 text-center text-sm text-slate-400">
        Online play isn't configured in this build.
      </p>
    );
  }

  return (
    <div>
      {/* Search */}
      <div className="relative mb-3">
        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
          <Search size={14} className="shrink-0 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Look up a brewmaster…"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-slate-500 hover:text-slate-300">
              <X size={14} />
            </button>
          )}
        </div>
        {results && (
          <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
            {results.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-500">No brewmaster by that name.</p>
            ) : results.map((r) => (
              <button
                key={r.id}
                onClick={() => { setQuery(""); onSelectPlayer?.(r.nickname); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
              >
                <IconWizardHat /> {r.nickname}
                {r.nickname === nickname && <span className="text-[10px] uppercase tracking-wider text-amber-700">you</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Metric picker + refresh */}
      <div className="mb-2 flex items-center gap-2">
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-amber-800/40 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200"
        >
          {grouped.map(({ group, metrics }) => (
            <optgroup key={group} label={group}>
              {/* <option> text can't render SVG icons — label only */}
              {metrics.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="rounded-lg border border-amber-800/40 bg-slate-800 p-2 text-amber-700 hover:text-amber-600"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Scope + view toggles */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex rounded-lg bg-slate-800 p-0.5">
          <button
            onClick={() => setScope("public")}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${scope === "public" ? "bg-amber-700 text-white" : "text-slate-400"}`}
          >
            <IconGlobe /> Public
          </button>
          <button
            onClick={() => myUserId && setScope("rivals")}
            disabled={!myUserId}
            title={myUserId ? "Only you and your rivals" : "Sign in to track rivals"}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-40 ${scope === "rivals" ? "bg-amber-700 text-white" : "text-slate-400"}`}
          >
            <Swords size={11} /> Rivals{rivals?.length ? ` (${rivals.length})` : ""}
          </button>
        </div>
        <div className="flex rounded-lg bg-slate-800 p-0.5">
          <button
            onClick={() => setView("top")}
            title="Top of the board"
            className={`rounded-md px-2 py-1 ${view === "top" ? "bg-amber-700 text-white" : "text-slate-400"}`}
          >
            <ArrowUpToLine size={13} />
          </button>
          <button
            onClick={() => myUserId && setView("me")}
            disabled={!myUserId}
            title={myUserId ? "Centre on my rank" : "Sign in to find yourself"}
            className={`rounded-md px-2 py-1 disabled:opacity-40 ${view === "me" ? "bg-amber-700 text-white" : "text-slate-400"}`}
          >
            <Crosshair size={13} />
          </button>
          <button
            onClick={() => setView("bottom")}
            title="Bottom of the board"
            className={`rounded-md px-2 py-1 ${view === "bottom" ? "bg-amber-700 text-white" : "text-slate-400"}`}
          >
            <ArrowDownToLine size={13} />
          </button>
        </div>
      </div>

      {/* My rank banner */}
      {board?.myRank != null && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-700/40 bg-amber-950/25 px-3 py-2 text-sm">
          <Crown size={16} className="shrink-0 text-amber-600" />
          <span className="text-amber-900">
            {scope === "rivals" ? "Among rivals you're" : "You're"}{" "}
            <span className="font-bold">#{fmt(board.myRank)}</span> of {fmt(board.total)} in {def?.label.toLowerCase()}
            {board.myValue != null && <> with <span className="font-bold">{fmt(board.myValue)}</span></>}
          </span>
        </div>
      )}

      {error && (
        <p className="mb-3 rounded-lg bg-rose-100/60 px-3 py-2 text-xs text-rose-700">{error}</p>
      )}

      {/* Rows */}
      {loading && !board ? (
        <p className="py-6 text-center text-sm italic text-slate-400">Consulting the guild registry…</p>
      ) : board && board.rows.length === 0 ? (
        <p className="rounded-lg bg-slate-800/40 px-3 py-4 text-center text-sm text-slate-400">
          {scope === "rivals"
            ? "No rivals on this board yet — look someone up and declare a rivalry!"
            : "Nobody on this board yet — be the first!"}
        </p>
      ) : (
        <div className="space-y-1">
          {board?.rows.map((r) => {
            const isMe = r.userId === myUserId;
            return (
              <button
                key={r.userId}
                onClick={() => onSelectPlayer?.(r.nickname)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition hover:brightness-105 ${
                  isMe ? "border border-amber-700/50 bg-amber-950/25" : "bg-slate-800/50 hover:bg-slate-800"
                }`}
              >
                <span className={`flex w-9 shrink-0 items-center justify-end gap-0.5 text-right font-bold tabular-nums ${
                  r.rank === 1 ? "text-amber-600" : r.rank === 2 ? "text-slate-400" : r.rank === 3 ? "text-amber-800" : "text-slate-500"
                }`}>
                  {r.rank <= 3 ? <IconMedal /> : `#${fmt(r.rank)}`}
                </span>
                <span className={`min-w-0 flex-1 truncate font-medium ${isMe ? "text-amber-900" : "text-slate-200"}`}>
                  {r.nickname}{isMe && <span className="ml-1 text-[10px] uppercase tracking-wider text-amber-700">you</span>}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-300">{fmt(r.value)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
