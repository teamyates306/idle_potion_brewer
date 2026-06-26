// =============================================================================
// Economy balance report. Rendered at /balance-report (see App.tsx).
// Compares 6 AI playstyles across 5 000 Monte Carlo simulations with percentile
// bands (p10–p90) and annotated individual "play" stories per strategy.
// =============================================================================
import type { ReactNode } from "react";
import beforeJson from "./data/before_run.json";
import afterJson from "./data/after_run.json";
import changelogJson from "./data/changelog.json";
import { fmt } from "./util/format";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Timeseries {
  t_minutes: number[];
  coins_mean: number[];
  coins_p10?: number[]; coins_p25?: number[]; coins_p75?: number[]; coins_p90?: number[];
  potions_discovered_mean: number[];
  potions_discovered_p10?: number[]; potions_discovered_p90?: number[];
  quests_completed_mean?: number[];
  quests_completed_p10?: number[]; quests_completed_p90?: number[];
  ingredients_unused_mean: number[];
  machine_util_pct_mean: number[];
}
interface FeaturedRun {
  label: string;
  story: string;
  coins_series: number[];
  potions_series: number[];
  quests_series?: number[];
  final_coins: number;
  potions_discovered: number;
  quests_completed: number;
}
interface StrategyReport {
  summary_mean: Record<string, number>;
  final_coins_p10: number;
  final_coins_p90: number;
  timeseries: Timeseries;
  featured_runs?: FeaturedRun[];
  graveyard_top: { ingredient: string; unused_mean: number }[];
  bottleneck_diagnosis: { flags: string[]; notes: string[] };
}
interface PotionExample { name: string; value: number; recipe: string[]; }
interface RecipeAnalysis {
  note: string;
  total_recipes_enumerated: number; total_unique_potions: number;
  by_size: { slots: number; recipes: number; unique_potions: number; value_min: number; value_median: number; value_max: number }[];
  value_min: number; value_median: number; value_max: number;
  price_bands: { label: string; min_value: number; unique_potions: number }[];
  top_potions: PotionExample[]; cheapest_potions: PotionExample[];
}
interface SimReport {
  meta: {
    sim_hours: number; iterations: number; total_simulations?: number;
    content: { ingredients: number; locations: number };
  };
  strategy_definitions?: Record<string, string>;
  strategies: Record<string, StrategyReport>;
  global_diagnosis: { ranking: { n: string; c: number }[]; spread_multiple: number; notes: string[] };
  recipe_analysis?: RecipeAnalysis;
}
interface ChangelogEntry { entity: string; old_value: string; new_value: string; reason: string; }

const before = beforeJson as unknown as SimReport;
const after = afterJson as unknown as SimReport;
const changelog = changelogJson as unknown as ChangelogEntry[];

// ── Presentation constants ────────────────────────────────────────────────────
const ALL_STRATS = ["A_Sprinter", "B_Completionist", "C_Industrialist", "D_QuestHunter", "E_AchievementHunter", "F_Everyman"];
const LEGACY_STRATS = ["A_Sprinter", "B_Completionist", "C_Industrialist", "D_QuestHunter"];
const STRAT_LABEL: Record<string, string> = {
  A_Sprinter: "Sprinter", B_Completionist: "Completionist",
  C_Industrialist: "Industrialist", D_QuestHunter: "Quest Hunter",
  E_AchievementHunter: "Achiever", F_Everyman: "Everyman",
};
const STRAT_COLOR: Record<string, string> = {
  A_Sprinter: "#f59e0b", B_Completionist: "#22c55e",
  C_Industrialist: "#38bdf8", D_QuestHunter: "#a855f7",
  E_AchievementHunter: "#f97316", F_Everyman: "#ec4899",
};
const BEFORE_COLOR = "#64748b";
const AFTER_COLOR = "#f59e0b";

// Featured-run palette (dashed lines drawn over the percentile band)
const FEAT_COLORS = ["#fde68a", "#86efac", "#7dd3fc", "#d8b4fe", "#fdba74", "#f9a8d4"];

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

// ── Line chart with optional percentile band ──────────────────────────────────
interface BandSeries { label: string; color: string; dashed?: boolean; points: number[]; }
function LineChart({
  title, xLabels, series, bandLo, bandHi, featuredRuns, yFmt = fmt,
}: {
  title: string;
  xLabels: number[];
  series: BandSeries[];
  bandLo?: number[];   // p10 — lower edge of grey band
  bandHi?: number[];   // p90 — upper edge of grey band
  featuredRuns?: { points: number[]; color: string; label: string }[];
  yFmt?: (n: number) => string;
}) {
  const W = 380, H = 210, padL = 46, padR = 12, padT = 14, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = xLabels.length;
  const allPts = [
    ...series.flatMap((s) => s.points),
    ...(bandHi ?? []),
    ...(featuredRuns ?? []).flatMap((r) => r.points),
  ];
  const yMax = niceMax(Math.max(1, ...allPts));
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (Math.max(0, Math.min(v, yMax)) / yMax) * innerH;
  const toPath = (pts: number[]) =>
    pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f);

  // Build shaded band polygon
  let bandPath = "";
  if (bandLo && bandHi && bandLo.length === n) {
    const top = bandHi.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" L");
    const bottom = [...bandLo].reverse().map((v, i) => `${x(n - 1 - i).toFixed(1)},${y(v).toFixed(1)}`).join(" L");
    bandPath = `M ${top} L ${bottom} Z`;
  }

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
      <div className="mb-1 text-sm font-semibold text-slate-200">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {/* Grid */}
        {gridY.map((gv, i) => {
          const lbl = yFmt(gv);
          const showLbl = gridY.findIndex((g2) => yFmt(g2) === lbl) === i;
          return (
            <g key={i}>
              <line x1={padL} y1={y(gv)} x2={W - padR} y2={y(gv)} stroke="#334155" strokeWidth={i === 0 ? 1.2 : 0.6} />
              {showLbl && <text x={padL - 6} y={y(gv) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{lbl}</text>}
            </g>
          );
        })}
        {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">{xLabels[i]}m</text>
        ))}

        {/* Percentile band (p10–p90) */}
        {bandPath && <path d={bandPath} fill="#334155" fillOpacity={0.55} />}

        {/* Featured run traces (dashed, over the band) */}
        {(featuredRuns ?? []).map((fr, fi) => (
          <path key={fi} d={toPath(fr.points)} fill="none" stroke={fr.color} strokeWidth={1.2}
            strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" opacity={0.7} />
        ))}

        {/* Mean lines */}
        {series.map((s) => (
          <path key={s.label} d={toPath(s.points)} fill="none" stroke={s.color} strokeWidth={2.2}
            strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>

      {/* Legend */}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {bandLo && (
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="inline-block h-3 w-3 rounded-sm bg-slate-600/70" />
            p10–p90 range
          </span>
        )}
        {(featuredRuns ?? []).map((fr, fi) => (
          <span key={fi} className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="inline-block h-0.5 w-4 border-t-2 border-dashed" style={{ borderColor: fr.color }} />
            {fr.label}
          </span>
        ))}
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-slate-300">
            <span className="inline-block h-0.5 w-4" style={{ background: s.color, borderTop: s.dashed ? `2px dashed ${s.color}` : undefined }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Grouped bar chart ─────────────────────────────────────────────────────────
function GroupedBars({
  title, groups, before: bVals, after: aVals, valueFmt = fmt,
}: { title: string; groups: string[]; before: number[]; after: number[]; valueFmt?: (n: number) => string }) {
  const W = 520, H = 240, padL = 50, padR = 12, padT = 16, padB = 40;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const yMax = niceMax(Math.max(1, ...bVals, ...aVals));
  const groupW = innerW / groups.length;
  const barW = groupW * 0.32;
  const y = (v: number) => padT + innerH - (Math.max(0, v) / yMax) * innerH;
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f);
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
      <div className="mb-1 text-sm font-semibold text-slate-200">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {gridY.map((gv, i) => (
          <g key={i}>
            <line x1={padL} y1={y(gv)} x2={W - padR} y2={y(gv)} stroke="#334155" strokeWidth={i === 0 ? 1.2 : 0.6} />
            <text x={padL - 6} y={y(gv) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{valueFmt(gv)}</text>
          </g>
        ))}
        {groups.map((g, gi) => {
          const cx = padL + gi * groupW + groupW / 2;
          const bx = cx - barW - 3, ax = cx + 3;
          return (
            <g key={g}>
              <rect x={bx} y={y(bVals[gi])} width={barW} height={padT + innerH - y(bVals[gi])} fill={BEFORE_COLOR} rx={2} />
              <rect x={ax} y={y(aVals[gi])} width={barW} height={padT + innerH - y(aVals[gi])} fill={STRAT_COLOR[LEGACY_STRATS[gi]] ?? AFTER_COLOR} rx={2} />
              <text x={cx} y={H - 24} textAnchor="middle" fontSize="11" fill="#cbd5e1" fontWeight="600">{g}</text>
              <text x={bx + barW / 2} y={y(bVals[gi]) - 4} textAnchor="middle" fontSize="8.5" fill="#94a3b8">{valueFmt(bVals[gi])}</text>
              <text x={ax + barW / 2} y={y(aVals[gi]) - 4} textAnchor="middle" fontSize="8.5" fill="#e2e8f0">{valueFmt(aVals[gi])}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-slate-300">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: BEFORE_COLOR }} />Before</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: AFTER_COLOR }} />After</span>
      </div>
    </div>
  );
}

// ── Featured plays panel ──────────────────────────────────────────────────────
function FeaturedPlays({ stratName, runs, tMinutes }: {
  stratName: string;
  runs: FeaturedRun[];
  tMinutes: number[];
}) {
  if (!runs || runs.length === 0) return null;
  const color = STRAT_COLOR[stratName] ?? "#94a3b8";
  return (
    <div className="mt-3 space-y-2">
      {runs.map((run, ri) => (
        <div key={ri} className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: FEAT_COLORS[ri] ?? "#94a3b8" }} />
            <span className="text-xs font-bold text-slate-200">{run.label}</span>
            <span className="ml-auto text-xs text-slate-500">
              {fmt(run.final_coins)} coins · {run.potions_discovered} potions · {run.quests_completed} quests
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{run.story}</p>
        </div>
      ))}
    </div>
  );
}

// ── Strategy profile card — chart + plays ─────────────────────────────────────
function StrategyProfile({ stratName, report, defs }: {
  stratName: string;
  report: StrategyReport;
  defs?: Record<string, string>;
}) {
  const ts = report.timeseries;
  const color = STRAT_COLOR[stratName] ?? "#94a3b8";
  const label = STRAT_LABEL[stratName] ?? stratName;
  const sm = report.summary_mean;
  const featuredRuns = report.featured_runs ?? [];

  // Build featured run traces for the chart
  const featCoins = featuredRuns.slice(0, 3).map((fr, i) => ({
    points: fr.coins_series,
    color: FEAT_COLORS[i],
    label: fr.label,
  }));

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-4">
      {/* Header row */}
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h3 className="text-base font-bold" style={{ color }}>{label}</h3>
          {defs?.[stratName] && (
            <p className="mt-0.5 max-w-xl text-xs text-slate-400">{defs[stratName]}</p>
          )}
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap gap-2 text-right text-xs">
          <span className="rounded bg-slate-800 px-2 py-1 text-slate-300">
            <span className="font-bold text-slate-100">{fmt(sm.final_coins)}</span> coins avg
          </span>
          <span className="rounded bg-slate-800 px-2 py-1 text-slate-300">
            p10 <span className="font-bold">{fmt(report.final_coins_p10)}</span> / p90 <span className="font-bold">{fmt(report.final_coins_p90)}</span>
          </span>
          <span className="rounded bg-slate-800 px-2 py-1 text-slate-300">
            <span className="font-bold">{Math.round(sm.potions_discovered)}</span> potions · <span className="font-bold">{Math.round(sm.quests_completed)}</span> quests · <span className="font-bold">{Math.round(sm.achievements_unlocked ?? 0)}</span> ach
          </span>
        </div>
      </div>

      {/* Coins-over-time with band + featured traces */}
      <div className="grid gap-3 sm:grid-cols-2">
        <LineChart
          title="Coins over time"
          xLabels={ts.t_minutes}
          series={[{ label: "Mean", color, points: ts.coins_mean }]}
          bandLo={ts.coins_p10}
          bandHi={ts.coins_p90}
          featuredRuns={featCoins}
        />
        <LineChart
          title="Potions discovered"
          xLabels={ts.t_minutes}
          yFmt={(n) => String(Math.round(n))}
          series={[{ label: "Mean", color, points: ts.potions_discovered_mean }]}
          bandLo={ts.potions_discovered_p10}
          bandHi={ts.potions_discovered_p90}
          featuredRuns={featuredRuns.slice(0, 3).map((fr, i) => ({
            points: fr.potions_series,
            color: FEAT_COLORS[i],
            label: fr.label,
          }))}
        />
      </div>

      {/* Plays */}
      {featuredRuns.length > 0 && (
        <>
          <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Featured plays — how RNG shapes unique runs</div>
          <FeaturedPlays stratName={stratName} runs={featuredRuns} tMinutes={ts.t_minutes} />
        </>
      )}
    </div>
  );
}

// ── UI atoms ──────────────────────────────────────────────────────────────────
function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-3 mt-8">
      <h2 className="text-lg font-bold text-amber-200">{children}</h2>
      {sub && <p className="mt-0.5 text-sm text-slate-400">{sub}</p>}
    </div>
  );
}
function DeltaPill({ before: b, after: a, fmt: f = fmt, higherBetter = true }: { before: number; after: number; fmt?: (n: number) => string; higherBetter?: boolean }) {
  const up = a >= b;
  const good = higherBetter ? up : !up;
  const pct = b === 0 ? (a === 0 ? 0 : 100) : Math.round(((a - b) / Math.abs(b)) * 100);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-slate-400">{f(b)}</span>
      <span className="text-slate-500">→</span>
      <span className="font-semibold text-slate-100">{f(a)}</span>
      <span className={`rounded px-1 text-[10px] font-bold ${good ? "bg-green-900/50 text-green-300" : "bg-red-900/40 text-red-300"}`}>
        {pct >= 0 ? "+" : ""}{pct}%
      </span>
    </span>
  );
}
function MinDelta({ before: b, after: a }: { before: number; after: number }) {
  const f = (min: number) => (!min ? "—" : min < 60 ? `${Math.round(min)}m` : `${(min / 60).toFixed(1)}h`);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-slate-400">{f(b)}</span>
      <span className="text-slate-500">→</span>
      <span className="font-semibold text-slate-100">{f(a)}</span>
    </span>
  );
}

// ── Brewable catalogue ────────────────────────────────────────────────────────
function compactRecipe(recipe: string[]): string {
  const counts = new Map<string, number>();
  for (const r of recipe) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.entries()].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(" + ");
}
function BrewableCatalogue({ cat, ingredients }: { cat: RecipeAnalysis; ingredients: number }) {
  const bandColor = ["#64748b", "#94a3b8", "#22c55e", "#38bdf8", "#a855f7", "#f59e0b"];
  const maxBand = Math.max(1, ...cat.price_bands.map((b) => b.unique_potions));
  return (
    <>
      <SectionTitle sub="Every real ingredient combination run through the live potion engine — not a theoretical name grid.">
        Brewable Catalogue
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeadlineCard label="Ingredients" before="" after={String(ingredients)} />
        <HeadlineCard label="Unique potions brewable" before="" after={`${cat.total_unique_potions}`} good />
        <HeadlineCard label="Recipes evaluated" before="" after={fmt(cat.total_recipes_enumerated)} />
        <HeadlineCard label="Price range" before="" after={`${fmt(cat.value_min)}–${fmt(cat.value_max)}`} />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-4">
          <div className="mb-2 text-sm font-semibold text-slate-200">Unique potions by quality tier</div>
          <div className="space-y-1.5">
            {cat.price_bands.map((b, i) => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs text-slate-400">{b.label}</span>
                <div className="h-4 flex-1 rounded bg-slate-800/60">
                  <div className="h-4 rounded" style={{ width: `${(b.unique_potions / maxBand) * 100}%`, background: bandColor[i], minWidth: b.unique_potions ? 8 : 0 }} />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-semibold text-slate-200">{b.unique_potions}</span>
                <span className="w-20 shrink-0 text-right text-[10px] text-slate-500">≥{fmt(b.min_value)}🪙</span>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-slate-800 pt-2 text-[11px] text-slate-500">
            By recipe size: {cat.by_size.map((s) => `${s.slots}-ing → ${s.unique_potions} potions`).join(" · ")}
          </div>
        </div>
        <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-4">
          <div className="mb-2 text-sm font-semibold text-slate-200">Most valuable brewable potions</div>
          <div className="space-y-1">
            {cat.top_potions.slice(0, 8).map((p, i) => (
              <div key={i} className="flex items-baseline justify-between gap-2 border-b border-slate-800/70 pb-1 last:border-0">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-amber-200">{p.name}</div>
                  <div className="truncate text-[10px] text-slate-500">{compactRecipe(p.recipe)}</div>
                </div>
                <div className="shrink-0 text-xs font-bold text-green-300">🪙 {fmt(p.value)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{cat.note}</p>
    </>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function BalanceReportView() {
  const m = (r: SimReport, strat: string, key: string) => r.strategies[strat]?.summary_mean[key] ?? 0;
  const beforeSpread = before.global_diagnosis.spread_multiple;
  const afterSpread = after.global_diagnosis.spread_multiple;
  const totalSims = after.meta.total_simulations ?? (after.meta.iterations * Object.keys(after.strategies).length);
  const defs = (after as any).strategy_definitions as Record<string, string> | undefined;

  const availStrats = ALL_STRATS.filter((s) => after.strategies[s]);

  return (
    <div className="h-full w-full overflow-y-auto bg-[#0b1120] text-slate-200">
      <div className="mx-auto max-w-5xl px-5 py-8">

        {/* ── Header ── */}
        <header className="mb-6 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400/80">
            🧪 Idle Potion Brewer · Economy Lab
          </div>
          <h1 className="mt-1 text-3xl font-black text-white">Economy &amp; Pacing Report</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            <span className="font-semibold text-slate-200">{totalSims.toLocaleString()} Monte Carlo simulations</span> of{" "}
            {after.meta.sim_hours}h of play across{" "}
            <span className="font-semibold text-slate-200">{availStrats.length} AI playstyles</span>, over{" "}
            <span className="font-semibold text-slate-200">{after.meta.content.ingredients} ingredients</span> and{" "}
            <span className="font-semibold text-slate-200">{after.meta.content.locations} locations</span>.
            Shaded areas show the p10–p90 range across all runs; dashed traces are individual "featured plays" —
            runs where RNG created a distinct story. Even under identical strategies, no two runs are the same.
          </p>
          <a href="/" className="mt-3 inline-block rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">← Back to the workshop</a>
        </header>

        {/* ── Headline cards ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeadlineCard label="Total simulations" before="" after={totalSims.toLocaleString()} good />
          <HeadlineCard label="Strategies" before="4" after={String(availStrats.length)} good />
          <HeadlineCard label="Strategy spread" before={`×${fmt(beforeSpread)}`} after={`×${fmt(afterSpread)}`} good />
          <HeadlineCard label="Quest Hunter coins" before={fmt(m(before, "D_QuestHunter", "final_coins"))} after={fmt(m(after, "D_QuestHunter", "final_coins"))} good />
        </div>

        {/* ── Strategy profiles (all 6 with percentile bands + plays) ── */}
        <SectionTitle sub={`Each strategy shows its mean (solid line), the p10–p90 range (grey band), and up to 3 individual "featured plays" (dashed). The spread of the grey band demonstrates how much RNG shapes outcomes within a single playstyle.`}>
          Strategy Profiles: RNG Variance &amp; Individual Plays
        </SectionTitle>
        <div className="space-y-5">
          {availStrats.map((s) => (
            <StrategyProfile key={s} stratName={s} report={after.strategies[s]} defs={defs} />
          ))}
        </div>

        {/* ── Legacy before/after comparison ── */}
        <SectionTitle sub={`Average final coins after ${after.meta.sim_hours}h. Before = old simulation; after = current balance.`}>
          Final Coins: Before vs After (Original 4 Strategies)
        </SectionTitle>
        <GroupedBars
          title="Mean final coins by strategy"
          groups={LEGACY_STRATS.map((s) => STRAT_LABEL[s])}
          before={LEGACY_STRATS.map((s) => m(before, s, "final_coins"))}
          after={LEGACY_STRATS.map((s) => m(after, s, "final_coins"))}
        />

        {/* ── Ingredient graveyards ── */}
        <SectionTitle sub="Ingredients gathered but never brewed — wasted gathering. Lower is better.">
          Ingredient Graveyards
        </SectionTitle>
        <GroupedBars
          title="Mean unused ingredients"
          groups={LEGACY_STRATS.map((s) => STRAT_LABEL[s])}
          before={LEGACY_STRATS.map((s) => m(before, s, "graveyard_units"))}
          after={LEGACY_STRATS.map((s) => m(after, s, "graveyard_units"))}
        />

        {/* ── Summary table ── */}
        <SectionTitle sub="Key per-strategy outcomes across the full simulation run.">Metric Summary</SectionTitle>
        <div className="overflow-x-auto rounded-xl border border-slate-700/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/60 text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Strategy</th>
                <th className="px-3 py-2">Final coins (mean)</th>
                <th className="px-3 py-2">p10 / p90</th>
                <th className="px-3 py-2">Potions</th>
                <th className="px-3 py-2">Util %</th>
                <th className="px-3 py-2">Quests</th>
                <th className="px-3 py-2">Ach.</th>
                <th className="px-3 py-2">Ach. coins</th>
              </tr>
            </thead>
            <tbody>
              {availStrats.map((s) => {
                const r = after.strategies[s];
                const sm = r.summary_mean;
                return (
                  <tr key={s} className="border-t border-slate-800">
                    <td className="px-3 py-2 font-semibold" style={{ color: STRAT_COLOR[s] }}>{STRAT_LABEL[s]}</td>
                    <td className="px-3 py-2 font-semibold text-slate-100">{fmt(sm.final_coins)}</td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{fmt(r.final_coins_p10)} / {fmt(r.final_coins_p90)}</td>
                    <td className="px-3 py-2">{Math.round(sm.potions_discovered)}</td>
                    <td className="px-3 py-2">{Math.round(sm.machine_util_pct)}%</td>
                    <td className="px-3 py-2">{sm.quests_completed.toFixed(1)}</td>
                    <td className="px-3 py-2">{Math.round(sm.achievements_unlocked ?? 0)}</td>
                    <td className="px-3 py-2 text-amber-300">{fmt(sm.coins_from_achievements ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Brewable catalogue ── */}
        {after.recipe_analysis && <BrewableCatalogue cat={after.recipe_analysis} ingredients={after.meta.content.ingredients} />}

        {/* ── Progression pacing ── */}
        <SectionTitle sub="How long key milestones take and how many levels/upgrades a run accrues.">
          Progression &amp; Upgrade Pacing
        </SectionTitle>
        <div className="overflow-x-auto rounded-xl border border-slate-700/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/60 text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Strategy</th>
                <th className="px-3 py-2">→ Machine #2</th>
                <th className="px-3 py-2">→ Machine #3</th>
                <th className="px-3 py-2">Max level</th>
                <th className="px-3 py-2">Upgrades bought</th>
              </tr>
            </thead>
            <tbody>
              {availStrats.map((s) => {
                const sm = after.strategies[s]?.summary_mean ?? {};
                return (
                  <tr key={s} className="border-t border-slate-800">
                    <td className="px-3 py-2 font-semibold" style={{ color: STRAT_COLOR[s] }}>{STRAT_LABEL[s]}</td>
                    <td className="px-3 py-2">{fmtMin(sm.t_machine2_min)}</td>
                    <td className="px-3 py-2">{fmtMin(sm.t_machine3_min)}</td>
                    <td className="px-3 py-2">{Math.round(Math.max(sm.max_worker_level ?? 0, sm.max_machine_level ?? 0))}</td>
                    <td className="px-3 py-2">{Math.round(sm.upgrades_total ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Patch notes ── */}
        <SectionTitle sub={`${changelog.length} changes — world redesign plus upgrade-curve tuning.`}>Patch Notes</SectionTitle>
        <div className="space-y-2.5">
          {changelog.map((c, i) => (
            <div key={i} className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-amber-200">{c.entity}</span>
                <span className="rounded bg-red-900/30 px-1.5 py-0.5 font-mono text-[11px] text-red-300 line-through">{c.old_value}</span>
                <span className="text-slate-500">→</span>
                <span className="rounded bg-green-900/30 px-1.5 py-0.5 font-mono text-[11px] text-green-300">{c.new_value}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{c.reason}</p>
            </div>
          ))}
        </div>

        {/* ── Bottleneck diagnosis ── */}
        <SectionTitle sub="Automated flags from the bottleneck analyser.">Bottleneck Diagnosis</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {availStrats.map((s) => (
            <div key={s} className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3.5">
              <div className="mb-2 font-semibold" style={{ color: STRAT_COLOR[s] }}>{STRAT_LABEL[s]}</div>
              <FlagRow label="Flags" flags={after.strategies[s].bottleneck_diagnosis.flags} tone="good" />
              {after.strategies[s].bottleneck_diagnosis.notes.map((n, i) => (
                <p key={i} className="mt-1 text-xs text-slate-400">{n}</p>
              ))}
            </div>
          ))}
        </div>

        <footer className="mt-10 border-t border-slate-800 pt-4 text-xs text-slate-500">
          Generated by <code className="text-slate-400">scripts/simulate.ts</code> · imports the game's exact engine math &amp; config ·{" "}
          {after.meta.iterations} iterations/strategy · {totalSims.toLocaleString()} total simulations · {availStrats.length} strategies.
        </footer>
      </div>
    </div>
  );
}

// ── Shared atoms ──────────────────────────────────────────────────────────────
function HeadlineCard({ label, before: b, after: a, good }: { label: string; before: string; after: string; good?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        {b && <span className="text-sm text-slate-500 line-through">{b}</span>}
        <span className={`text-xl font-black ${good ? "text-green-300" : "text-slate-100"}`}>{a}</span>
      </div>
    </div>
  );
}
function FlagRow({ label, flags, tone }: { label: string; flags: string[]; tone: "bad" | "good" }) {
  return (
    <div className="mb-1.5 flex items-start gap-2">
      <span className="mt-0.5 w-12 shrink-0 text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {flags.length === 0 ? (
          <span className="rounded bg-green-900/30 px-1.5 py-0.5 text-[11px] font-semibold text-green-300">✓ healthy</span>
        ) : (
          flags.map((f) => (
            <span key={f} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone === "bad" ? "bg-red-900/40 text-red-300" : "bg-amber-900/40 text-amber-300"}`}>{f}</span>
          ))
        )}
      </div>
    </div>
  );
}
function fmtMin(min?: number): string {
  if (!min) return "—";
  return min < 60 ? `${Math.round(min)}m` : `${(min / 60).toFixed(1)}h`;
}
