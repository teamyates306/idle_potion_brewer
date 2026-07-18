import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Swords } from "lucide-react";
import { useOnlineStore } from "../../online/onlineStore";
import { fetchPlayerProfile, fetchRanksFor, type PlayerProfileData } from "../../online/api";
import { METRICS, METRICS_BY_KEY } from "../../online/stats";
import { fmt } from "../../util/format";
import { ICONS, IconWizardHat, IconSun } from "../ui/icons";

const HEADLINE_RANK_KEYS = ["lifetime_coins", "total_brews", "potions_discovered"];

interface Props {
  nickname: string;
  onBack?: () => void;
  /** Hide the "open full page" link (already on the full page). */
  fullPage?: boolean;
}

/** Public profile card for any player — used inside the in-game modal and as
 *  the body of the standalone /user/<nickname> page. */
export default function PlayerProfile({ nickname, onBack, fullPage }: Props) {
  const session = useOnlineStore((s) => s.session);
  const rivals = useOnlineStore((s) => s.rivals);
  const myNickname = useOnlineStore((s) => s.nickname);
  const { addRival, removeRival } = useOnlineStore.getState();

  const [profile, setProfile] = useState<PlayerProfileData | null | undefined>(undefined);
  const [ranks, setRanks] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [showAllAttrs, setShowAllAttrs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProfile(undefined);
    setRanks({});
    fetchPlayerProfile(nickname)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        if (p) fetchRanksFor(p.stats, HEADLINE_RANK_KEYS).then((r) => { if (!cancelled) setRanks(r); });
      })
      .catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setProfile(null); } });
    return () => { cancelled = true; };
  }, [nickname]);

  if (profile === undefined) {
    return <p className="py-6 text-center text-sm italic text-slate-400">Fetching the guild record…</p>;
  }
  if (profile === null) {
    return (
      <div>
        {onBack && <BackButton onBack={onBack} />}
        <p className="rounded-lg bg-slate-800/40 px-3 py-4 text-center text-sm text-slate-400">
          {error ?? `No brewmaster named "${nickname}" in the guild registry.`}
        </p>
      </div>
    );
  }

  const isMe = profile.nickname === myNickname;
  const isRival = (rivals ?? []).some((r) => r.id === profile.id);
  const generalMetrics = METRICS.filter((m) => m.group !== "Attributes");
  const attrEntries = METRICS.filter((m) => m.group === "Attributes")
    .map((m) => ({ def: m, value: profile.stats[m.key] ?? 0 }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);
  const shownAttrs = showAllAttrs ? attrEntries : attrEntries.slice(0, 6);

  return (
    <div>
      {onBack && <BackButton onBack={onBack} />}

      {/* Header */}
      <div className="mb-3 rounded-xl border border-amber-800/30 bg-slate-800/40 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-lg font-bold text-amber-900">
              <IconWizardHat /> {profile.nickname}
              {isMe && <span className="ml-2 align-middle text-[10px] uppercase tracking-wider text-amber-700">you</span>}
            </p>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              Guild member since {new Date(profile.createdAt).toLocaleDateString()}
              {!!profile.stats.current_day && <> · <IconSun /> Day {fmt(profile.stats.current_day)}</>}
            </p>
          </div>
          {!fullPage && (
            <a
              href={`/user/${encodeURIComponent(profile.nickname)}`}
              target="_blank"
              rel="noreferrer"
              title="Open full profile page"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-amber-700"
            >
              <ExternalLink size={15} />
            </a>
          )}
        </div>

        {/* Rival toggle */}
        {session && !isMe && (
          <button
            onClick={() => void (isRival ? removeRival(profile.id) : addRival({ id: profile.id, nickname: profile.nickname }))}
            className={`mt-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              isRival
                ? "border border-rose-300/60 bg-rose-100/40 text-rose-700 hover:bg-rose-100/70"
                : "bg-amber-700 text-white hover:bg-amber-600"
            }`}
          >
            <Swords size={12} />
            {isRival ? "End rivalry" : "Declare rivalry"}
          </button>
        )}
        {session && !isMe && (
          <p className="mt-1 text-[10px] text-slate-500">Rivalries are private — they never know.</p>
        )}
      </div>

      {/* Headline ranks */}
      {Object.keys(ranks).length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {HEADLINE_RANK_KEYS.filter((k) => ranks[k]).map((k) => (
            <div key={k} className="rounded-lg border border-amber-700/30 bg-amber-950/20 px-2 py-2 text-center">
              <p className="text-base font-bold text-amber-800">#{fmt(ranks[k])}</p>
              <p className="text-[9px] uppercase tracking-wider text-slate-500">{METRICS_BY_KEY[k].label}</p>
            </div>
          ))}
        </div>
      )}

      {/* General stats */}
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        {generalMetrics.map((m) => {
          const MetricIcon = ICONS[m.icon];
          return (
          <div key={m.key} className="flex items-center justify-between rounded-lg bg-slate-800/50 px-2.5 py-1.5">
            <span className="mr-2 flex items-center gap-1 truncate text-[11px] text-slate-400">
              {MetricIcon && <MetricIcon />} {m.label}
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-200">
              {fmt(profile.stats[m.key] ?? 0)}
            </span>
          </div>
          );
        })}
      </div>

      {/* Attribute specialities */}
      {attrEntries.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-amber-700">Brewing specialities</p>
          <div className="space-y-1">
            {shownAttrs.map(({ def, value }) => (
              <div key={def.key} className="flex items-center gap-2 rounded-lg bg-slate-800/50 px-2.5 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate text-slate-300">{def.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-200">{fmt(value)}</span>
              </div>
            ))}
          </div>
          {attrEntries.length > 6 && (
            <button
              onClick={() => setShowAllAttrs((v) => !v)}
              className="mt-1.5 text-xs text-amber-800 underline hover:text-amber-700"
            >
              {showAllAttrs ? "Show fewer" : `Show all ${attrEntries.length} attributes`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-amber-800 hover:text-amber-700"
    >
      <ArrowLeft size={15} /> Back to rankings
    </button>
  );
}
