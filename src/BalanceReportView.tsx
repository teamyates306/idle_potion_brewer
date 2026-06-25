// =============================================================================
// A/B Balance Report dashboard. Rendered at /balance-report (see App.tsx).
// Compares the economy simulation before vs after the autonomous rebalance and
// explains every change. Data comes from scripts/simulate.ts (src/data/*.json).
// =============================================================================
import type { ReactNode } from "react";
import beforeJson from "./data/before_run.json";
import afterJson from "./data/after_run.json";
import changelogJson from "./data/changelog.json";
import { fmt } from "./util/format";

// ── Types (loosely mirror the simulator's JSON output) ──────────────────────
interface Timeseries {
  t_minutes: number[];
  coins_mean: number[];
  potions_discovered_mean: number[];
  ingredients_unused_mean: number[];
  machine_util_pct_mean: number[];
}
interface StrategyReport {
  summary_mean: Record<string, number>;
  final_coins_p10: number;
  final_coins_p90: number;
  timeseries: Timeseries;
  graveyard_top: { ingredient: string; unused_mean: number }[];
  bottleneck_diagnosis: { flags: string[]; notes: string[] };
}
interface PotionExample { name: string; value: number; recipe: string[]; }
interface RecipeAnalysis {
  note: string;
  total_recipes_enumerated: number;
  total_unique_potions: number;
  by_size: { slots: number; recipes: number; unique_potions: number; value_min: number; value_median: number; value_max: number }[];
  value_min: number; value_median: number; value_max: number;
  price_bands: { label: string; min_value: number; unique_potions: number }[];
  top_potions: PotionExample[];
  cheapest_potions: PotionExample[];
}
interface SimReport {
  meta: { sim_hours: number; iterations: number; content: { ingredients: number; locations: number } };
  strategies: Record<string, StrategyReport>;
  global_diagnosis: { ranking: { n: string; c: number }[]; spread_multiple: number; notes: string[] };
  recipe_analysis?: RecipeAnalysis;
}
interface ChangelogEntry { entity: string; old_value: string; new_value: string; reason: string; }

const before = beforeJson as unknown as SimReport;
const after = afterJson as unknown as SimReport;
const changelog = changelogJson as unknown as ChangelogEntry[];

// ── Presentation constants ──────────────────────────────────────────────────
const STRAT_ORDER = ["A_Sprinter", "B_Completionist", "C_Industrialist", "D_QuestHunter"];
const STRAT_LABEL: Record<string, string> = {
  A_Sprinter: "Sprinter", B_Completionist: "Completionist",
  C_Industrialist: "Industrialist", D_QuestHunter: "Quest Hunter",
};
const STRAT_COLOR: Record<string, string> = {
  A_Sprinter: "#f59e0b", B_Completionist: "#22c55e",
  C_Industrialist: "#38bdf8", D_QuestHunter: "#a855f7",
};
const BEFORE_COLOR = "#64748b"; // slate — muted
const AFTER_COLOR = "#f59e0b";  // amber — bright

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

// ── Line chart: multiple series sharing one x-axis ──────────────────────────
function LineChart({
  title, xLabels, series, yFmt = fmt,
}: {
  title: string;
  xLabels: number[];
  series: { label: string; color: string; dashed?: boolean; points: number[] }[];
  yFmt?: (n: number) => string;
}) {
  const W = 360, H = 200, padL = 46, padR = 12, padT = 14, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = xLabels.length;
  const yMax = niceMax(Math.max(1, ...series.flatMap((s) => s.points)));
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (Math.max(0, v) / yMax) * innerH;
  const toPath = (pts: number[]) => pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f);
  const lastMin = xLabels[n - 1] ?? 0;

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3">
      <div className="mb-1 text-sm font-semibold text-slate-200">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {gridY.map((gv, i) => {
          const lbl = yFmt(gv);
          const showLbl = gridY.findIndex((g2) => yFmt(g2) === lbl) === i; // dedupe repeated labels (small-int charts)
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
        <text x={(padL + W - padR) / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="#64748b" opacity={0}>{lastMin}</text>
        {series.map((s) => (
          <path key={s.label} d={toPath(s.points)} fill="none" stroke={s.color} strokeWidth={2}
            strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-slate-300">
            <span className="inline-block h-0.5 w-4" style={{ background: s.color, borderTop: s.dashed ? `2px dashed ${s.color}` : undefined }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Grouped bar chart: before vs after across the four strategies ───────────
function GroupedBars({
  title, groups, before: bVals, after: aVals, valueFmt = fmt,
}: {
  title: string;
  groups: string[];
  before: number[];
  after: number[];
  valueFmt?: (n: number) => string;
}) {
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
              <rect x={ax} y={y(aVals[gi])} width={barW} height={padT + innerH - y(aVals[gi])} fill={STRAT_COLOR[STRAT_ORDER[gi]] ?? AFTER_COLOR} rx={2} />
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

// ── Small UI atoms ──────────────────────────────────────────────────────────
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
// minutes → "—" / "Xm" / "X.Yh", shown before → after (later is the goal here)
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

// ── Brewable catalogue: what the current ingredient set can actually produce ──
function BrewableCatalogue({ cat, ingredients }: { cat: RecipeAnalysis; ingredients: number }) {
  const bandColor = ["#64748b", "#94a3b8", "#22c55e", "#38bdf8", "#a855f7", "#f59e0b"];
  const maxBand = Math.max(1, ...cat.price_bands.map((b) => b.unique_potions));
  return (
    <>
      <SectionTitle sub="Computed by running every real ingredient combination through the live potion engine — these are potions an actual recipe can produce, not a theoretical name grid.">
        Brewable Catalogue (current setup)
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeadlineCard label="Ingredients" before="" after={String(ingredients)} />
        <HeadlineCard label="Unique potions brewable" before="" after={`${cat.total_unique_potions}`} good />
        <HeadlineCard label="Recipes evaluated" before="" after={fmt(cat.total_recipes_enumerated)} />
        <HeadlineCard label="Price range (coins)" before="" after={`${fmt(cat.value_min)}–${fmt(cat.value_max)}`} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {/* Price-band distribution */}
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

        {/* Most valuable potions */}
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
// "Eldritch Shroom ×5" instead of repeating the same name five times
function compactRecipe(recipe: string[]): string {
  const counts = new Map<string, number>();
  for (const r of recipe) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.entries()].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(" + ");
}

// ── Main dashboard ──────────────────────────────────────────────────────────
export default function BalanceReportView() {
  const m = (r: SimReport, strat: string, key: string) => r.strategies[strat]?.summary_mean[key] ?? 0;
  const beforeSpread = before.global_diagnosis.spread_multiple;
  const afterSpread = after.global_diagnosis.spread_multiple;

  return (
    <div className="h-full w-full overflow-y-auto bg-[#0b1120] text-slate-200">
      <div className="mx-auto max-w-5xl px-5 py-8">
        {/* Header */}
        <header className="mb-6 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-400/80">
            🧪 Idle Potion Brewer · Economy Lab
          </div>
          <h1 className="mt-1 text-3xl font-black text-white">Economy & Pacing Report</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Monte Carlo simulation of {after.meta.iterations} iterations × {after.meta.sim_hours}h of play across four AI
            playstyles, over a redesigned world of <span className="font-semibold text-slate-200">{after.meta.content.ingredients} ingredients</span> and{" "}
            <span className="font-semibold text-slate-200">{after.meta.content.locations} locations</span> (5s → 30-min travel curve, 5s starter brews).
            The before/after below isolates the <span className="font-semibold text-amber-200">upgrade-curve balancing</span>: it stretches progression
            toward a month-long arc, cuts the ingredient graveyards, and compresses the playstyle gap from{" "}
            <span className="font-bold text-red-300">×{fmt(beforeSpread)}</span> to{" "}
            <span className="font-bold text-green-300">×{fmt(afterSpread)}</span>.
          </p>
          <a href="/" className="mt-3 inline-block rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">← Back to the workshop</a>
        </header>

        {/* Headline spread cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeadlineCard label="Strategy spread" before={`×${fmt(beforeSpread)}`} after={`×${fmt(afterSpread)}`} good />
          <HeadlineCard label="Quest Hunter coins" before={fmt(m(before, "D_QuestHunter", "final_coins"))} after={fmt(m(after, "D_QuestHunter", "final_coins"))} good />
          <HeadlineCard label="Quests completed (D)" before={String(m(before, "D_QuestHunter", "quests_completed"))} after={String(m(after, "D_QuestHunter", "quests_completed"))} good />
          <HeadlineCard label="Completionist coins" before={fmt(m(before, "B_Completionist", "final_coins"))} after={fmt(m(after, "B_Completionist", "final_coins"))} good />
        </div>

        {/* Final coins bar */}
        <SectionTitle sub={`Average final coins after ${after.meta.sim_hours} in-game hours. Slower leveling keeps the run-away Industrialist in check and lifts the Quest Hunter floor.`}>
          Final Coins: Before vs After
        </SectionTitle>
        <GroupedBars
          title="Mean final coins by strategy"
          groups={STRAT_ORDER.map((s) => STRAT_LABEL[s])}
          before={STRAT_ORDER.map((s) => m(before, s, "final_coins"))}
          after={STRAT_ORDER.map((s) => m(after, s, "final_coins"))}
        />

        {/* Coins over time line charts */}
        <SectionTitle sub="Coins accumulated over the run. Dashed grey = before, solid colour = after.">
          Coins over Time: Before vs After
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {STRAT_ORDER.map((s) => (
            <LineChart
              key={s}
              title={STRAT_LABEL[s]}
              xLabels={after.strategies[s].timeseries.t_minutes}
              series={[
                { label: "Before", color: BEFORE_COLOR, dashed: true, points: before.strategies[s].timeseries.coins_mean },
                { label: "After", color: STRAT_COLOR[s], points: after.strategies[s].timeseries.coins_mean },
              ]}
            />
          ))}
        </div>

        {/* Ingredient graveyards */}
        <SectionTitle sub="Ingredients gathered but never brewed — wasted gathering. Lower is better. Drop-table and recipe-value tuning cut the worst graveyards.">
          Ingredient Graveyards: Before vs After
        </SectionTitle>
        <GroupedBars
          title="Mean unused ingredients (graveyard units)"
          groups={STRAT_ORDER.map((s) => STRAT_LABEL[s])}
          before={STRAT_ORDER.map((s) => m(before, s, "graveyard_units"))}
          after={STRAT_ORDER.map((s) => m(after, s, "graveyard_units"))}
        />

        {/* Potions discovered over time */}
        <SectionTitle sub="Unique potion names discovered. Rewarding complexity gives discovery- and quest-focused play a reason to brew variety.">
          Potions Discovered over Time: Before vs After
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {STRAT_ORDER.map((s) => (
            <LineChart
              key={s}
              title={STRAT_LABEL[s]}
              xLabels={after.strategies[s].timeseries.t_minutes}
              yFmt={(n) => String(Math.round(n))}
              series={[
                { label: "Before", color: BEFORE_COLOR, dashed: true, points: before.strategies[s].timeseries.potions_discovered_mean },
                { label: "After", color: STRAT_COLOR[s], points: after.strategies[s].timeseries.potions_discovered_mean },
              ]}
            />
          ))}
        </div>

        {/* Summary metrics table */}
        <SectionTitle sub="Key per-strategy outcomes, before → after.">Metric Summary</SectionTitle>
        <div className="overflow-x-auto rounded-xl border border-slate-700/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/60 text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Strategy</th>
                <th className="px-3 py-2">Final coins</th>
                <th className="px-3 py-2">Potions found</th>
                <th className="px-3 py-2">Machine util %</th>
                <th className="px-3 py-2">Quests done</th>
                <th className="px-3 py-2">Graveyard</th>
              </tr>
            </thead>
            <tbody>
              {STRAT_ORDER.map((s) => (
                <tr key={s} className="border-t border-slate-800">
                  <td className="px-3 py-2 font-semibold" style={{ color: STRAT_COLOR[s] }}>{STRAT_LABEL[s]}</td>
                  <td className="px-3 py-2"><DeltaPill before={m(before, s, "final_coins")} after={m(after, s, "final_coins")} /></td>
                  <td className="px-3 py-2"><DeltaPill before={m(before, s, "potions_discovered")} after={m(after, s, "potions_discovered")} fmt={(n) => String(Math.round(n))} /></td>
                  <td className="px-3 py-2"><DeltaPill before={m(before, s, "machine_util_pct")} after={m(after, s, "machine_util_pct")} fmt={(n) => `${Math.round(n)}%`} /></td>
                  <td className="px-3 py-2"><DeltaPill before={m(before, s, "quests_completed")} after={m(after, s, "quests_completed")} fmt={(n) => n.toFixed(1)} /></td>
                  <td className="px-3 py-2"><DeltaPill before={m(before, s, "graveyard_units")} after={m(after, s, "graveyard_units")} higherBetter={false} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Brewable catalogue */}
        {after.recipe_analysis && <BrewableCatalogue cat={after.recipe_analysis} ingredients={after.meta.content.ingredients} />}

        {/* Progression & upgrade pacing */}
        <SectionTitle sub="How long key milestones take and how many levels/upgrades a run accrues. The curve tuning stretches the climb so there's a month of progression, not a day.">
          Progression &amp; Upgrade Pacing
        </SectionTitle>
        <div className="overflow-x-auto rounded-xl border border-slate-700/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/60 text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2">Strategy</th>
                <th className="px-3 py-2">→ Machine #2</th>
                <th className="px-3 py-2">→ Machine #3</th>
                <th className="px-3 py-2">Max level (24h)</th>
                <th className="px-3 py-2">Upgrades bought</th>
              </tr>
            </thead>
            <tbody>
              {STRAT_ORDER.map((s) => (
                <tr key={s} className="border-t border-slate-800">
                  <td className="px-3 py-2 font-semibold" style={{ color: STRAT_COLOR[s] }}>{STRAT_LABEL[s]}</td>
                  <td className="px-3 py-2"><MinDelta before={m(before, s, "t_machine2_min")} after={m(after, s, "t_machine2_min")} /></td>
                  <td className="px-3 py-2"><MinDelta before={m(before, s, "t_machine3_min")} after={m(after, s, "t_machine3_min")} /></td>
                  <td className="px-3 py-2"><DeltaPill before={Math.max(m(before, s, "max_worker_level"), m(before, s, "max_machine_level"))} after={Math.max(m(after, s, "max_worker_level"), m(after, s, "max_machine_level"))} fmt={(n) => String(Math.round(n))} higherBetter={false} /></td>
                  <td className="px-3 py-2"><DeltaPill before={m(before, s, "upgrades_total")} after={m(after, s, "upgrades_total")} fmt={(n) => String(Math.round(n))} higherBetter={false} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          "Max level" and "upgrades bought" are lower after tuning (slower XP + steeper cost curves) — the same 24 hours now buys less of the tree, leaving the rest to earn over the following days and weeks. Machine #4 (600k) lands in days and #5 (3M) in a week+, so the machine ladder anchors the long game.
        </p>

        {/* Patch notes */}
        <SectionTitle sub={`${changelog.length} changes — the world redesign (reqs 1-3) plus the A/B-measured upgrade-curve tuning (req 4).`}>
          Patch Notes
        </SectionTitle>
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

        {/* Bottleneck diagnosis before/after */}
        <SectionTitle sub="Automated flags from the simulator's bottleneck analysis. Watch them clear from before → after.">
          Bottleneck Diagnosis
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {STRAT_ORDER.map((s) => (
            <div key={s} className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-3.5">
              <div className="mb-2 font-semibold" style={{ color: STRAT_COLOR[s] }}>{STRAT_LABEL[s]}</div>
              <FlagRow label="Before" flags={before.strategies[s].bottleneck_diagnosis.flags} tone="bad" />
              <FlagRow label="After" flags={after.strategies[s].bottleneck_diagnosis.flags} tone="good" />
            </div>
          ))}
        </div>

        <footer className="mt-10 border-t border-slate-800 pt-4 text-xs text-slate-500">
          Generated by <code className="text-slate-400">scripts/simulate.ts</code> · imports the game's exact engine math &amp; config ·
          {" "}{before.meta.iterations} iterations (before) · {after.meta.iterations} iterations (after) per strategy.
        </footer>
      </div>
    </div>
  );
}

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
