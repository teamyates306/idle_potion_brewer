// =============================================================================
// Content & Art Plan — rendered at /content-plan (see App.tsx).
//
// A standalone authoring surface for replacing every placeholder NAME, piece of
// FLAVOUR TEXT and GRAPHIC in the game with finished content. It reflects over
// the live game data (ingredients, locations, achievements, the potion-naming
// system) so the structural facts and attribute numbers are always accurate.
// Placeholder copy/art is never shown, so the author writes fresh instead of
// being anchored to it.
//
// Everything typed here is saved to localStorage (survives refreshes / mobile
// sessions) and can be exported as a single JSON blob to paste back into Claude
// Code, which then commits the changes to source. The same blob re-imports, so
// drafts round-trip across devices. Search + a done-filter make the long lists
// easy to triage.
// =============================================================================
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Attributes, Ingredient, Location } from "./types";
import { INGREDIENTS, LOCATIONS } from "./store/configStore";
import { ACHIEVEMENTS } from "./data/achievements";
import {
  ATTR_KEYS,
  VALUE_PREFIXES,
} from "./engine/potions";

// ── Persistence ──────────────────────────────────────────────────────────────
const DRAFT_KEY = "ipb-content-plan-v1";

type Draft = Record<string, string>;

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : {};
  } catch {
    return {};
  }
}

// ── Reference data / labels ──────────────────────────────────────────────────
const CATS: Ingredient["category"][] = ["root", "petal", "fungus", "crystal", "essence", "bone"];

const CAT_LABEL: Record<string, string> = {
  root: "Root", petal: "Petal", fungus: "Fungus",
  crystal: "Crystal", essence: "Essence", bone: "Bone",
};

const ATTR_DOMAIN: Record<keyof Attributes, string> = {
  strength: "Physical", speed: "Physical", vitality: "Physical", density: "Physical", elasticity: "Physical",
  focus: "Mental", mana: "Mental", resonance: "Mental", insight: "Mental", luck: "Mental",
  heat: "Elemental", cold: "Elemental", shock: "Elemental", aqua: "Elemental", terra: "Elemental", aero: "Elemental", radiance: "Elemental", void: "Elemental",
  toxicity: "Chemical", volatility: "Chemical", acidity: "Chemical", alkalinity: "Chemical", viscosity: "Chemical", stability: "Chemical", solvency: "Chemical",
  chrono: "Cosmic", gravitas: "Cosmic", entropy: "Cosmic", soul: "Cosmic", mutation: "Cosmic",
};

const TRIGGER_LABEL: Record<string, string> = {
  potions_discovered: "Unique recipes discovered",
  coins: "Total coins held",
  potions_brewed: "Lifetime potions brewed",
  machines_built: "Brewing machines owned",
  workers_hired: "Workers hired",
  locations_unlocked: "Map locations unlocked",
  worker_click_speed: "A worker's click speed (clicks/sec)",
  volatile_recipe: "High-volatility ingredients in one recipe",
  single_potion_value: "Sell value of a single brewed potion",
};

const PREFIX_BANDS = [
  "potion value < 15", "value 15–39", "value 40–99", "value 100–249", "value 250–699",
  "value 700–1,999", "value 2,000–5,999", "value 6,000–44,999", "value 45,000–649,999", "value ≥ 650,000",
];

const DANGER_COLORS = ["#4ade80", "#a3e635", "#facc15", "#fb923c", "#f87171", "#e879f9", "#c084fc"];
const dangerColor = (d: number) => DANGER_COLORS[Math.min(Math.max(d, 0), DANGER_COLORS.length - 1)];

function attrLine(a: Attributes): { key: string; v: number }[] {
  return ATTR_KEYS
    .filter((k) => a[k] !== 0)
    .map((k) => ({ key: k, v: a[k] }))
    .sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
}

function rewardText(r: { type: string; amount: number }): string {
  return r.type === "coins"
    ? `${r.amount.toLocaleString()} coins`
    : `${r.amount} upgrade token${r.amount > 1 ? "s" : ""}`;
}

const roundTripSeconds = (distance: number) => Math.round(distance * 2);

// ── Map layout ───────────────────────────────────────────────────────────────
// A pannable, portrait map. Node 0 (the Workshop) sits at the top; nodes march
// downward as travel distance grows. Vertical spacing blends √(travel distance)
// — so a longer trip means a visibly longer leg — with a uniform floor so labels
// never collide. Horizontal meander makes a winding trail.
const MAP_W = 760;
const MAP_TOP = 150;
const MAP_BOTTOM = 170;
const MAP_SPAN = 2400;
const MAP_CX = 380;
const MAP_AMP = 235;
const MAP_TURN = 0.8; // radians of meander per node

interface MapNode { loc: Location; n: number; x: number; y: number; xDef: number; yDef: number }

// ── Hand-curated manifests (small fixed-size content the page doesn't reflect) ─
const WORKER_NAME_COUNT = 8;
const MACHINE_NAME_COUNT = 5;

const STATUS_GROUPS: { key: string; label: string; purpose: string; count: number }[] = [
  { key: "idle", label: "Idle", count: 3, purpose: "Shown beneath an unassigned worker who has no job." },
  { key: "travel0", label: "Travelling · safe (Tier 1)", count: 3, purpose: "Shown while a worker walks out to a shallow, low-danger location." },
  { key: "travel1", label: "Travelling · Tier 2", count: 2, purpose: "Shown en route to a mid-tier location." },
  { key: "travel2", label: "Travelling · Tier 3", count: 2, purpose: "Shown en route to a deeper location." },
  { key: "travel3", label: "Travelling · deep/dangerous", count: 3, purpose: "Shown en route to the deepest, most dangerous nodes." },
  { key: "return", label: "Returning home", count: 3, purpose: "Shown while a worker carries gathered ingredients back." },
];

const SPECS: { id: string; mech: string; restriction: string }[] = [
  { id: "explorer", mech: "2× gather speed · ½ carry size", restriction: "Locations only — cannot work cauldrons" },
  { id: "caravan", mech: "2× carry size · ½ gather speed", restriction: "Locations only — cannot work cauldrons" },
  { id: "pounder", mech: "2× click power · ½ click speed", restriction: "Cauldrons only — cannot gather" },
  { id: "manic", mech: "2× click speed · ½ click power", restriction: "Cauldrons only — cannot gather" },
  { id: "standard", mech: "No bonuses — keeps every option open", restriction: "Unrestricted" },
];

const UNLOCKS: { id: string; cost: number; effect: string }[] = [
  { id: "alchemist_spectacles", cost: 10_000, effect: "Reveals exact numeric stats in ingredient & potion details." },
  { id: "gloves_of_engineering", cost: 100_000, effect: "Reveals the brew-rate formula on each cauldron." },
  { id: "cartographers_compass", cost: 100_000, effect: "Reveals drop % on map nodes and a 'Sourced From' list." },
  { id: "merchants_abacus", cost: 1_000_000, effect: "Unlocks the supply-chain dashboard (income/consumption/net)." },
];

const TUT_STEPS: { step: string; phases: { key: string; purpose: string }[] }[] = [
  {
    step: "Step 1 · Brew your first potion",
    phases: [
      { key: "brewer", purpose: "Point the player at the cauldron's open-Brewer button." },
      { key: "ingredient-slot", purpose: "Tell them to tap an empty recipe slot." },
      { key: "ingredient-item", purpose: "Tell them to pick an ingredient for the slot." },
      { key: "close-ingredient", purpose: "Tell them to close the ingredient picker once filled." },
      { key: "start-brewing", purpose: "Tell them to start the brew." },
    ],
  },
  {
    step: "Step 2 · Speed it up",
    phases: [
      { key: "close-brewer", purpose: "Tell them to close the Brewer panel." },
      { key: "tap-cauldron", purpose: "Tell them to tap the cauldron repeatedly to brew faster." },
    ],
  },
  {
    step: "Step 3 · Sell it",
    phases: [
      { key: "market", purpose: "Point them at the Market / potion pile." },
      { key: "potion-entry", purpose: "Tell them to open a potion's details." },
      { key: "auto-sell", purpose: "Tell them to enable auto-sell." },
    ],
  },
  {
    step: "Step 4 · Send a gatherer",
    phases: [
      { key: "close-potion-detail", purpose: "Close the potion details." },
      { key: "close-market", purpose: "Close the Market." },
      { key: "workers", purpose: "Open the Worker panel." },
      { key: "worker-idle", purpose: "Select the idle worker." },
      { key: "assign-location", purpose: "Tap 'Assign to Location'." },
      { key: "map-location", purpose: "Pick the only unlocked location on the map." },
      { key: "assign-confirm", purpose: "Confirm the assignment." },
    ],
  },
  {
    step: "Step 5 · Sign-off",
    phases: [{ key: "finish", purpose: "Closing line that hands the player their freedom." }],
  },
];

// ── Graphics manifest ────────────────────────────────────────────────────────
interface GfxItem { id: string; label: string; purpose: string; dims: string; variants?: string[] }

const GFX_ILLUSTRATIONS: GfxItem[] = [
  ...CATS.map<GfxItem>((c) => ({
    id: `ing-${c}`,
    label: `${CAT_LABEL[c]} ingredient icon`,
    purpose: `Icon denoting the “${CAT_LABEL[c]}” ingredient category — appears on ingredient chips, the inventory grid and recipe slots.`,
    dims: "20×20 viewBox · crisp at 16–48px",
  })),
  { id: "ing-default", label: "Fallback ingredient icon", purpose: "Shown when an ingredient has an unrecognised category. Generic ‘mystery reagent’.", dims: "20×20 viewBox" },
  { id: "worker-base", label: "Worker (base)", purpose: "The hireling avatar. The robe colour is tinted at runtime, so keep robe areas flat/neutral and let code recolour. Needs an idle and a carrying pose.", dims: "64×64 viewBox", variants: ["idle", "carrying"] },
  { id: "worker-explorer", label: "Worker — Explorer spec", purpose: "Level-10 Explorer variant (built for speed). Currently a lantern + boots overlay.", dims: "64×64 viewBox" },
  { id: "worker-caravan", label: "Worker — Caravan spec", purpose: "Level-10 Caravan variant (built for carry size). Currently an oversized backpack.", dims: "64×64 viewBox" },
  { id: "worker-pounder", label: "Worker — Pounder spec", purpose: "Level-10 Pounder variant (heavy single strikes). Currently a muscular arm + pestle.", dims: "64×64 viewBox" },
  { id: "worker-manic", label: "Worker — Manic spec", purpose: "Level-10 Manic variant (frantic speed). Currently motion-blur arms + a mug.", dims: "64×64 viewBox" },
  { id: "machine-cauldron", label: "Brewing machine (cauldron)", purpose: "The core brewer. Needs idle, brewing (bubbles) and a progress read (gauge + liquid fill driven 0–1).", dims: "110×110 viewBox", variants: ["idle", "brewing", "progress fill"] },
  { id: "potion-bottle", label: "Potion bottle", purpose: "A single sellable potion. Colour is parameterised; piles compose up to ten bottles into a stack.", dims: "scene 120×84 · a bottle ≈ 24×32" },
  { id: "window-map", label: "Window to the world (map portal)", purpose: "The workshop window the player taps to open the Map. Currently a night-sky scene in a frame.", dims: "96×96 viewBox" },
  { id: "favicon", label: "App icon / favicon", purpose: "Browser-tab icon & PWA app mark (public/potion.svg). Should read at 16px.", dims: "square master 512×512 · ships as SVG" },
];

const GFX_ICONS: { id: string; label: string; purpose: string }[] = [
  { id: "icon-logo", label: "Game logo mark", purpose: "Sits beside the title in the header (replaces 🧪)." },
  { id: "icon-coin", label: "Coin currency", purpose: "HUD coin counter, rewards, prices (replaces 🪙)." },
  { id: "icon-token", label: "Upgrade token", purpose: "Worker upgrade tokens & token rewards (replaces ✦)." },
  { id: "icon-unlock-spectacles", label: "Unlock · Spectacles", purpose: "Alchemist's Spectacles upgrade icon." },
  { id: "icon-unlock-gloves", label: "Unlock · Gloves", purpose: "Gloves of Engineering upgrade icon." },
  { id: "icon-unlock-compass", label: "Unlock · Compass", purpose: "Cartographer's Compass upgrade icon." },
  { id: "icon-unlock-abacus", label: "Unlock · Abacus", purpose: "Merchant's Abacus upgrade icon." },
  { id: "icon-spec-explorer", label: "Spec menu · Explorer", purpose: "Small icon in the specialization picker." },
  { id: "icon-spec-caravan", label: "Spec menu · Caravan", purpose: "Small icon in the specialization picker." },
  { id: "icon-spec-pounder", label: "Spec menu · Pounder", purpose: "Small icon in the specialization picker." },
  { id: "icon-spec-manic", label: "Spec menu · Manic", purpose: "Small icon in the specialization picker." },
  { id: "icon-spec-standard", label: "Spec menu · Standard", purpose: "Small icon in the specialization picker." },
];

const GFX_DONE_TOTAL = GFX_ILLUSTRATIONS.length + GFX_ICONS.length;

const SECTIONS: [string, string][] = [
  ["sec-title", "Identity"], ["sec-ings", "Ingredients"], ["sec-locs", "Locations"],
  ["sec-map", "Map"], ["sec-naming", "Potion names"], ["sec-proc", "Ingredient names"],
  ["sec-ach", "Achievements"], ["sec-workers", "Workers"], ["sec-machines", "Machines"],
  ["sec-unlocks", "Unlocks"], ["sec-tut", "Tutorial"], ["sec-gfx", "Graphics"],
];

// ── Small UI atoms ───────────────────────────────────────────────────────────
function Chip({ children, tone = "stone" }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    stone: "bg-stone-800 text-stone-300 border-stone-700",
    amber: "bg-amber-950/60 text-amber-300 border-amber-800/60",
    pos: "bg-emerald-950/50 text-emerald-300 border-emerald-800/50",
    neg: "bg-rose-950/50 text-rose-300 border-rose-800/50",
    info: "bg-cyan-950/40 text-cyan-300 border-cyan-800/50",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** A green check (done) or hollow ring (todo) — the per-item completion mark. */
function DoneDot({ done }: { done: boolean }) {
  return done
    ? <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-600 text-[10px] font-bold text-stone-950">✓</span>
    : <span className="h-4 w-4 rounded-full border border-stone-600" />;
}

/** Single-line field — local state, commits to the global draft on blur so a
 *  page full of inputs stays smooth while typing. */
function Field({
  initial, placeholder, onCommit, mono = false,
}: { initial: string; placeholder: string; onCommit: (v: string) => void; mono?: boolean }) {
  const [v, setV] = useState(initial);
  return (
    <input
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== initial && onCommit(v)}
      className={`w-full rounded-md border border-stone-700 bg-stone-950/60 px-2.5 py-1.5 text-sm text-amber-100 outline-none placeholder:text-stone-600 focus:border-amber-600/70 ${mono ? "font-mono text-xs" : ""}`}
    />
  );
}

function AreaField({
  initial, placeholder, onCommit, rows = 2,
}: { initial: string; placeholder: string; onCommit: (v: string) => void; rows?: number }) {
  const [v, setV] = useState(initial);
  return (
    <textarea
      value={v}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== initial && onCommit(v)}
      className="w-full resize-y rounded-md border border-stone-700 bg-stone-950/60 px-2.5 py-1.5 text-sm leading-snug text-amber-100 outline-none placeholder:text-stone-600 focus:border-amber-600/70"
    />
  );
}

function StatusPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts: [string, string, string][] = [
    ["todo", "Todo", "border-stone-700 bg-stone-900 text-stone-400"],
    ["wip", "WIP", "border-amber-700 bg-amber-950/50 text-amber-300"],
    ["done", "Done", "border-emerald-700 bg-emerald-950/50 text-emerald-300"],
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-stone-700">
      {opts.map(([val, label, cls]) => (
        <button key={val} onClick={() => onChange(val)}
          className={`px-2.5 py-1 text-[10px] font-semibold transition ${value === val ? cls : "bg-stone-950 text-stone-600 hover:text-stone-400"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Section shell with progress + per-section copy ───────────────────────────
function Section({
  id, title, blurb, filled, total, optional, open, onToggle, onCopy, children,
}: {
  id: string; title: string; blurb: string; filled: number; total: number;
  optional?: boolean; open: boolean; onToggle: () => void; onCopy: () => void; children: ReactNode;
}) {
  const pct = total ? Math.round((filled / total) * 100) : 0;
  const done = total > 0 && filled >= total;
  return (
    <section id={id} className="scroll-mt-28 rounded-xl border border-stone-700/70 bg-stone-900/50 shadow-lg">
      <header className="flex items-center gap-3 border-b border-stone-700/60 px-4 py-3">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className={`text-stone-500 transition ${open ? "rotate-90" : ""}`}>▸</span>
          <span className="truncate text-sm font-bold text-amber-200">{title}</span>
          {optional && <Chip>optional</Chip>}
        </button>
        <span className={`shrink-0 text-[11px] font-semibold tabular-nums ${done ? "text-emerald-400" : "text-stone-400"}`}>
          {done ? "✓ " : ""}{filled}/{total}
        </span>
        <button onClick={onCopy} className="shrink-0 rounded-md border border-amber-800/60 bg-amber-950/40 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-900/40">
          Copy
        </button>
      </header>
      {open && (
        <>
          <div className="border-b border-stone-800/80 px-4 py-2">
            <p className="text-xs text-stone-400">{blurb}</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-800">
              <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="space-y-3 p-4">{children}</div>
        </>
      )}
    </section>
  );
}

function EmptyHint() {
  return <p className="py-2 text-center text-xs text-stone-600">Nothing here matches the current search / filter.</p>;
}

// ── Main view ────────────────────────────────────────────────────────────────
export default function ContentPlanView() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [rev, setRev] = useState(0); // bump to remount fields after import
  const [overlay, setOverlay] = useState<null | "export" | "import">(null);
  const [toast, setToast] = useState("");
  const [rawQuery, setRawQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "todo" | "done">("all");
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(
    () => Object.fromEntries(SECTIONS.map(([id]) => [id, true])),
  );

  // Debounce the search so typing doesn't thrash the (large) list.
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setQ(rawQuery.trim().toLowerCase()), 140);
    return () => window.clearTimeout(t);
  }, [rawQuery]);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* quota */ }
  }, [draft]);

  const set = (key: string, val: string) =>
    setDraft((d) => {
      const next = { ...d };
      if (val.trim() === "") delete next[key];
      else next[key] = val;
      return next;
    });

  const isFilled = (k: string) => (draft[k] ?? "").trim() !== "";
  const allFilled = (...ks: string[]) => ks.every(isFilled);
  const filledBy = (pred: (k: string) => boolean) =>
    Object.keys(draft).filter((k) => pred(k) && draft[k].trim() !== "").length;
  const pre = (p: string) => (k: string) => k.startsWith(p);

  // Visibility predicate driving search + done-filter for every item.
  const show = (done: boolean, ...search: string[]) => {
    if (statusFilter === "done" && !done) return false;
    if (statusFilter === "todo" && done) return false;
    if (q && !search.join("  ").toLowerCase().includes(q)) return false;
    return true;
  };
  const filtering = q !== "" || statusFilter !== "all";

  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(""), 1600); };
  const copyText = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); flash(`${label} copied`); }
    catch { setOverlay("export"); flash("Clipboard blocked — copy manually"); }
  };

  const ings = useMemo(
    () => CATS.map((c) => ({
      cat: c,
      items: Object.values(INGREDIENTS).filter((i) => i.category === c).sort((a, b) => a.base_value - b.base_value),
    })),
    [],
  );
  const locs = useMemo<Location[]>(() => Object.values(LOCATIONS).sort((a, b) => a.distance - b.distance), []);
  const ingCount = Object.keys(INGREDIENTS).length;

  // Resolve map coordinates (computed defaults, overridable via map:<id>:x|y).
  const mapNodes = useMemo<MapNode[]>(() => {
    const sVals = locs.map((l) => Math.sqrt(l.distance));
    const sMin = Math.min(...sVals), sMax = Math.max(...sVals);
    const N = locs.length;
    return locs.map((loc, i) => {
      const tDist = (Math.sqrt(loc.distance) - sMin) / (sMax - sMin || 1);
      const tIdx = N > 1 ? i / (N - 1) : 0;
      const t = 0.5 * tDist + 0.5 * tIdx;
      const yDef = Math.round(MAP_TOP + t * MAP_SPAN);
      const xDef = Math.round(MAP_CX + MAP_AMP * Math.sin(i * MAP_TURN));
      const ox = Number(draft[`map:${loc.id}:x`]);
      const oy = Number(draft[`map:${loc.id}:y`]);
      return {
        loc, n: i + 1, xDef, yDef,
        x: Number.isFinite(ox) && draft[`map:${loc.id}:x`] ? ox : xDef,
        y: Number.isFinite(oy) && draft[`map:${loc.id}:y`] ? oy : yDef,
      };
    });
  }, [locs, draft]);
  const mapH = Math.max(...mapNodes.map((m) => m.y)) + MAP_BOTTOM;

  const resolveMapSpec = () => ({
    canvas: { w: MAP_W, h: mapH },
    spacing: "y blends √(travel distance) with a uniform floor; x meanders. Origin/Workshop at top.",
    nodes: mapNodes.map((m) => ({ node: m.n, id: m.loc.id, x: m.x, y: m.y, danger: m.loc.danger, roundTripSec: roundTripSeconds(m.loc.distance) })),
  });

  // Build an export payload (optionally filtered to a key prefix list).
  const buildExport = (prefixes?: string[]) => {
    const entries = Object.entries(draft)
      .filter(([k, v]) => v.trim() !== "" && (!prefixes || prefixes.some((p) => k.startsWith(p))))
      .sort(([a], [b]) => a.localeCompare(b));
    const obj = Object.fromEntries(entries);
    const header =
      "// Idle Potion Brewer — content/art plan export.\n" +
      "// Claude Code: apply these to source. Keys map to real game ids:\n" +
      "//   title:name|tagline · ing:<id>:name|desc · loc:<id>:name|flavor\n" +
      "//   map:<id>:x|y (overrides; full layout in _map below)\n" +
      "//   suffix:<attr> · prefix:<0-5> · ptype:<category> · ptemplate\n" +
      "//   procadj:<tier> · procnoun:<cat> · procdesc:<tier>\n" +
      "//   ach:<id>:name|desc · worker:name:<i> · status:<group> (one per line)\n" +
      "//   machine:name:<i> · spec:<id>:label|desc · unlock:<id>:name|desc\n" +
      "//   tut:<phase> · gfx:<id>:status|notes\n" +
      `// ${Object.keys(obj).length} fields · generated ${new Date().toISOString()}\n`;
    let out = header + JSON.stringify(obj, null, 2);
    if (!prefixes || prefixes.includes("map:")) {
      out += "\n\n// _map — full map layout (canvas size + resolved x/y per node)\n" + JSON.stringify(resolveMapSpec(), null, 2);
    }
    return out;
  };
  const copySection = (prefixes: string[], label: string) => copyText(buildExport(prefixes), label);

  const doImport = (raw: string) => {
    try {
      const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
      const parsed = JSON.parse(json) as Draft;
      setDraft((d) => ({ ...d, ...parsed }));
      setRev((r) => r + 1);
      setOverlay(null);
      flash("Imported");
    } catch {
      flash("Couldn't parse JSON");
    }
  };

  // section totals
  const T = {
    title: 2, ings: ingCount * 2, locs: locs.length * 2,
    naming: ATTR_KEYS.length + VALUE_PREFIXES.length + CATS.length + 1,
    proc: 18, ach: ACHIEVEMENTS.length * 2,
    workers: WORKER_NAME_COUNT + STATUS_GROUPS.length + SPECS.length * 2,
    machines: MACHINE_NAME_COUNT, unlocks: UNLOCKS.length * 2,
    tut: TUT_STEPS.reduce((n, s) => n + s.phases.length, 0),
  };
  const gfxDone = [...GFX_ILLUSTRATIONS, ...GFX_ICONS].filter((g) => draft[`gfx:${g.id}:status`] === "done").length;
  const mapDone = draft["gfx:map-illustration:status"] === "done";

  // Effective open state — force-open everything while filtering so hits show.
  const isOpen = (id: string) => (filtering ? true : openMap[id] ?? true);
  const toggle = (id: string) => setOpenMap((m) => ({ ...m, [id]: !(m[id] ?? true) }));
  const setAll = (v: boolean) => setOpenMap(Object.fromEntries(SECTIONS.map(([id]) => [id, v])));

  return (
    <div className="h-full overflow-y-auto bg-stone-950 text-stone-200">
      {/* Sticky control bar */}
      <div className="sticky top-0 z-20 border-b border-stone-700 bg-stone-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 py-2.5">
          <div className="mr-auto min-w-0">
            <h1 className="truncate text-base font-bold text-amber-200">Content &amp; Art Plan</h1>
            <p className="text-[11px] text-stone-500">Every placeholder name, line of flavour text & graphic to replace.</p>
          </div>
          <button onClick={() => setOverlay("import")} className="rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-[11px] font-semibold text-stone-300 hover:bg-stone-800">Import</button>
          <button onClick={() => setOverlay("export")} className="rounded-md border border-amber-700 bg-amber-600/90 px-3 py-1.5 text-[11px] font-bold text-stone-950 hover:bg-amber-500">Export →</button>
        </div>

        {/* Search + filter + expand controls */}
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-4 pb-2">
          <input
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder="Search items, attributes, purpose…"
            className="min-w-[150px] flex-1 rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-xs text-amber-100 outline-none placeholder:text-stone-600 focus:border-amber-600/70"
          />
          {rawQuery && <button onClick={() => setRawQuery("")} className="rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-[11px] text-stone-400 hover:text-stone-200">clear</button>}
          <div className="inline-flex overflow-hidden rounded-md border border-stone-700">
            {(["all", "todo", "done"] as const).map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-2.5 py-1.5 text-[11px] font-semibold capitalize transition ${statusFilter === f ? "bg-amber-600 text-stone-950" : "bg-stone-900 text-stone-400 hover:text-stone-200"}`}>
                {f === "todo" ? "To-do" : f}
              </button>
            ))}
          </div>
          <button onClick={() => setAll(true)} className="rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-[11px] text-stone-400 hover:text-stone-200">Expand</button>
          <button onClick={() => setAll(false)} className="rounded-md border border-stone-700 bg-stone-900 px-2 py-1.5 text-[11px] text-stone-400 hover:text-stone-200">Collapse</button>
        </div>

        {/* Jump nav */}
        <div className="mx-auto flex max-w-3xl gap-1.5 overflow-x-auto px-4 pb-2 text-[10px]">
          {SECTIONS.map(([href, label]) => (
            <a key={href} href={`#${href}`} className="shrink-0 rounded-full border border-stone-700 bg-stone-900 px-2.5 py-1 text-stone-400 hover:border-amber-700 hover:text-amber-300">{label}</a>
          ))}
        </div>
      </div>

      <div key={rev} className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        {/* How-to banner */}
        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 text-xs leading-relaxed text-amber-100/80">
          <p className="mb-1.5 font-semibold text-amber-200">How this works</p>
          <ul className="list-disc space-y-1 pl-4">
            <li>Placeholder text & art are never shown — each field gives only its <em>purpose</em> and the numbers that matter (attributes, costs, value bands), so you write fresh.</li>
            <li>Every item shows a completion mark; use <strong>Search</strong> and the <strong>To-do / Done</strong> filter to triage long lists, and Expand / Collapse to move fast.</li>
            <li>Everything auto-saves to this device. <strong>Export</strong> copies a JSON blob to paste into Claude Code to commit, or back into <strong>Import</strong> on another device. <strong>Copy</strong> on a section grabs just that section.</li>
            <li>Graphics & the map are specs (what each asset denotes + exact dimensions), each individually tracked Todo / WIP / Done — no uploads here.</li>
          </ul>
        </div>

        {/* IDENTITY */}
        <Section id="sec-title" title="Game identity" blurb="The game's name and one-line hook, shown in the header and browser tab."
          filled={filledBy(pre("title:"))} total={T.title} open={isOpen("sec-title")} onToggle={() => toggle("sec-title")} onCopy={() => copySection(["title:"], "Identity")}>
          {show(isFilled("title:name"), "game title name") && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-300">Game title</label>
              <Field initial={draft["title:name"] ?? ""} placeholder="The name of the game" onCommit={(v) => set("title:name", v)} />
            </div>
          )}
          {show(isFilled("title:tagline"), "tagline tab description hook subtitle") && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-300">Tagline / tab description</label>
              <Field initial={draft["title:tagline"] ?? ""} placeholder="A short hook or subtitle" onCommit={(v) => set("title:tagline", v)} />
            </div>
          )}
        </Section>

        {/* INGREDIENTS */}
        <Section id="sec-ings" title={`Ingredients (${ingCount})`}
          blurb="Each reagent needs a name and a one-line description. You're given its category, rarity, value and full attribute fingerprint — name it to fit those numbers. Grouped by category, cheapest first."
          filled={filledBy(pre("ing:"))} total={T.ings} open={isOpen("sec-ings")} onToggle={() => toggle("sec-ings")} onCopy={() => copySection(["ing:"], "Ingredients")}>
          {ings.map(({ cat, items }) => {
            const visible = items.filter((ing, i) => show(allFilled(`ing:${ing.id}:name`, `ing:${ing.id}:desc`), CAT_LABEL[cat], ing.rarity, String(i + 1), attrLine(ing.attributes).map((a) => a.key).join(" ")));
            if (visible.length === 0) return null;
            return (
              <div key={cat} className="space-y-2">
                <div className="sticky top-[140px] z-10 -mx-4 bg-stone-900/95 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-400/80 backdrop-blur">
                  {CAT_LABEL[cat]} · {visible.length}{visible.length !== items.length ? ` / ${items.length}` : ""}
                </div>
                {items.map((ing, i) => {
                  const done = allFilled(`ing:${ing.id}:name`, `ing:${ing.id}:desc`);
                  if (!show(done, CAT_LABEL[cat], ing.rarity, String(i + 1), attrLine(ing.attributes).map((a) => a.key).join(" "))) return null;
                  return (
                    <div key={ing.id} className="rounded-lg border border-stone-800 bg-stone-950/40 p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <DoneDot done={done} />
                        <Chip tone="amber">{CAT_LABEL[cat]} {i + 1}</Chip>
                        <Chip>{ing.rarity}</Chip>
                        <Chip tone="info">value {ing.base_value}</Chip>
                      </div>
                      <div className="mb-2 flex flex-wrap gap-1">
                        {attrLine(ing.attributes).map(({ key, v }) => (
                          <Chip key={key} tone={v > 0 ? "pos" : "neg"}>{key} {v > 0 ? "+" : ""}{v}</Chip>
                        ))}
                        {attrLine(ing.attributes).length === 0 && <span className="text-[11px] text-stone-600">no attributes</span>}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Field initial={draft[`ing:${ing.id}:name`] ?? ""} placeholder="Name" onCommit={(v) => set(`ing:${ing.id}:name`, v)} />
                        <Field initial={draft[`ing:${ing.id}:desc`] ?? ""} placeholder="One-line description" onCommit={(v) => set(`ing:${ing.id}:desc`, v)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </Section>

        {/* LOCATIONS */}
        <Section id="sec-locs" title={`Locations (${locs.length})`}
          blurb="Each map node needs a name and a flavour blurb. You're given its round-trip time, danger tier, unlock cost and how many ingredients it drops. Ordered shallow → deep — the same numbering as the Map below."
          filled={filledBy(pre("loc:"))} total={T.locs} open={isOpen("sec-locs")} onToggle={() => toggle("sec-locs")} onCopy={() => copySection(["loc:"], "Locations")}>
          {locs.map((loc, i) => {
            const done = allFilled(`loc:${loc.id}:name`, `loc:${loc.id}:flavor`);
            if (!show(done, "node", String(i + 1), `danger ${loc.danger}`)) return null;
            return (
              <div key={loc.id} className="rounded-lg border border-stone-800 bg-stone-950/40 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <DoneDot done={done} />
                  <Chip tone="amber">Node {i + 1}</Chip>
                  <Chip tone="info">~{roundTripSeconds(loc.distance)}s round trip</Chip>
                  <Chip tone={loc.danger >= 4 ? "neg" : "stone"}>danger {loc.danger}</Chip>
                  <Chip>{loc.unlockCost === 0 ? "starter (free)" : `unlock ${loc.unlockCost.toLocaleString()}`}</Chip>
                  <Chip>{loc.drops.length} drops</Chip>
                </div>
                <div className="space-y-2">
                  <Field initial={draft[`loc:${loc.id}:name`] ?? ""} placeholder="Location name" onCommit={(v) => set(`loc:${loc.id}:name`, v)} />
                  <AreaField initial={draft[`loc:${loc.id}:flavor`] ?? ""} placeholder="Flavour blurb — the mood/lore of this place" onCommit={(v) => set(`loc:${loc.id}:flavor`, v)} />
                </div>
              </div>
            );
          })}
        </Section>

        {/* MAP */}
        <Section id="sec-map" title="Map layout & art"
          blurb={`The Map should become one illustrated, pannable canvas with all ${locs.length} locations plotted. Canvas + per-node coordinates are below; nudge any node and the plot updates. Node numbers match the Locations list.`}
          filled={mapDone ? 1 : 0} total={1} open={isOpen("sec-map")} onToggle={() => toggle("sec-map")} onCopy={() => copySection(["map:"], "Map layout")}>
          <div className="rounded-lg border border-stone-800 bg-stone-950/40 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <DoneDot done={mapDone} />
              <span className="text-sm font-semibold text-amber-100">Illustrated map background</span>
              <Chip tone="info">canvas {MAP_W} × {mapH} px (portrait, pans vertically)</Chip>
            </div>
            <p className="text-xs text-stone-400">
              Draw the terrain on a {MAP_W}×{mapH}px canvas. Plot each location at the x/y below (origin top-left). Spacing rule:
              vertical distance from the Workshop blends <strong>√(travel time)</strong> with a uniform floor, so a longer trip is a
              visibly longer leg while labels never collide; x meanders to make a winding trail. Node colour = danger tier.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <StatusPicker value={draft["gfx:map-illustration:status"] ?? "todo"} onChange={(v) => set("gfx:map-illustration:status", v)} />
              <div className="min-w-[160px] flex-1">
                <Field initial={draft["gfx:map-illustration:notes"] ?? ""} placeholder="Notes (style, palette, link to file…)" onCommit={(v) => set("gfx:map-illustration:notes", v)} />
              </div>
            </div>
          </div>

          {/* Live plot */}
          <div className="overflow-auto rounded-lg border border-stone-800 bg-[#0b1220]" style={{ maxHeight: 380 }}>
            <svg viewBox={`0 0 ${MAP_W} ${mapH}`} width="100%" style={{ display: "block" }}>
              <polyline points={mapNodes.map((m) => `${m.x},${m.y}`).join(" ")} fill="none" stroke="#334155" strokeWidth={3} strokeDasharray="6 6" />
              <circle cx={MAP_CX} cy={70} r={10} fill="#fbbf24" />
              <text x={MAP_CX} y={40} textAnchor="middle" fill="#fbbf24" fontSize={22} fontWeight="bold">Workshop</text>
              <line x1={MAP_CX} y1={80} x2={mapNodes[0]?.x} y2={mapNodes[0]?.y} stroke="#334155" strokeWidth={3} strokeDasharray="6 6" />
              {mapNodes.map((m) => (
                <g key={m.loc.id}>
                  <circle cx={m.x} cy={m.y} r={18} fill={`${dangerColor(m.loc.danger)}33`} stroke={dangerColor(m.loc.danger)} strokeWidth={3} />
                  <text x={m.x} y={m.y + 6} textAnchor="middle" fill="#e2e8f0" fontSize={18} fontWeight="bold">{m.n}</text>
                </g>
              ))}
            </svg>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-stone-500">
            <span>Danger:</span>
            {DANGER_COLORS.map((c, i) => <span key={i} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{i}</span>)}
          </div>

          {/* Editable coordinates */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400/80">Node coordinates (override the computed defaults)</p>
            {mapNodes.map((m) => (
              <div key={m.loc.id} className="flex items-center gap-2 rounded-md border border-stone-800 bg-stone-950/40 px-2.5 py-1.5">
                <Chip tone="amber">#{m.n}</Chip>
                <Chip tone={m.loc.danger >= 4 ? "neg" : "stone"}>d{m.loc.danger}</Chip>
                <span className="text-[11px] text-stone-500">~{roundTripSeconds(m.loc.distance)}s</span>
                <div className="ml-auto flex items-center gap-1">
                  <span className="text-[10px] text-stone-500">x</span>
                  <input inputMode="numeric" defaultValue={draft[`map:${m.loc.id}:x`] ?? ""} placeholder={String(m.xDef)}
                    onBlur={(e) => set(`map:${m.loc.id}:x`, e.target.value)}
                    className="w-16 rounded border border-stone-700 bg-stone-950 px-1.5 py-1 text-center font-mono text-xs text-amber-100 outline-none placeholder:text-stone-600 focus:border-amber-600/70" />
                  <span className="text-[10px] text-stone-500">y</span>
                  <input inputMode="numeric" defaultValue={draft[`map:${m.loc.id}:y`] ?? ""} placeholder={String(m.yDef)}
                    onBlur={(e) => set(`map:${m.loc.id}:y`, e.target.value)}
                    className="w-16 rounded border border-stone-700 bg-stone-950 px-1.5 py-1 text-center font-mono text-xs text-amber-100 outline-none placeholder:text-stone-600 focus:border-amber-600/70" />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* POTION NAMING SYSTEM */}
        <Section id="sec-naming" title="Potion naming system"
          blurb="Potions are named procedurally as “{prefix} {type} of {suffix}”. You define the word banks: one suffix per dominant attribute, a power prefix per value band, and a type word per dominant ingredient category."
          filled={filledBy((k) => k.startsWith("suffix:") || k.startsWith("prefix:") || k.startsWith("ptype:") || k === "ptemplate")}
          total={T.naming} open={isOpen("sec-naming")} onToggle={() => toggle("sec-naming")}
          onCopy={() => copySection(["suffix:", "prefix:", "ptype:", "ptemplate"], "Potion naming")}>
          {show(isFilled("ptemplate"), "name template prefix type suffix") && (
            <div className="rounded-lg border border-stone-800 bg-stone-950/40 p-3">
              <label className="mb-1 block text-xs font-semibold text-stone-300">Name template</label>
              <Field mono initial={draft["ptemplate"] ?? ""} placeholder="{prefix} {type} of {suffix}" onCommit={(v) => set("ptemplate", v)} />
              <p className="mt-1 text-[11px] text-stone-500">Tokens: <code>{"{prefix}"}</code> <code>{"{type}"}</code> <code>{"{suffix}"}</code></p>
            </div>
          )}

          <p className="pt-1 text-[11px] font-bold uppercase tracking-wider text-amber-400/80">Suffix per dominant attribute — “… of ___”</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ATTR_KEYS.map((k) => show(isFilled(`suffix:${k}`), k, ATTR_DOMAIN[k], "suffix") && (
              <div key={k} className="rounded-lg border border-stone-800 bg-stone-950/40 p-2.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <DoneDot done={isFilled(`suffix:${k}`)} />
                  <span className="text-xs font-semibold text-amber-100">{k}</span>
                  <Chip>{ATTR_DOMAIN[k]}</Chip>
                </div>
                <Field initial={draft[`suffix:${k}`] ?? ""} placeholder="of the …" onCommit={(v) => set(`suffix:${k}`, v)} />
              </div>
            ))}
          </div>

          <p className="pt-1 text-[11px] font-bold uppercase tracking-wider text-amber-400/80">Power prefix per value band</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {VALUE_PREFIXES.map((_p, i) => show(isFilled(`prefix:${i}`), PREFIX_BANDS[i], "prefix power") && (
              <div key={i} className="rounded-lg border border-stone-800 bg-stone-950/40 p-2.5">
                <div className="mb-1 flex items-center gap-1.5"><DoneDot done={isFilled(`prefix:${i}`)} /><Chip tone="info">{PREFIX_BANDS[i]}</Chip></div>
                <Field initial={draft[`prefix:${i}`] ?? ""} placeholder="Power word" onCommit={(v) => set(`prefix:${i}`, v)} />
              </div>
            ))}
          </div>

          <p className="pt-1 text-[11px] font-bold uppercase tracking-wider text-amber-400/80">Type word per dominant category</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATS.map((c) => show(isFilled(`ptype:${c}`), CAT_LABEL[c], "type") && (
              <div key={c} className="rounded-lg border border-stone-800 bg-stone-950/40 p-2.5">
                <div className="mb-1 flex items-center gap-1.5"><DoneDot done={isFilled(`ptype:${c}`)} /><Chip tone="amber">{CAT_LABEL[c]}-dominant</Chip></div>
                <Field initial={draft[`ptype:${c}`] ?? ""} placeholder="e.g. a kind of potion" onCommit={(v) => set(`ptype:${c}`, v)} />
              </div>
            ))}
          </div>
        </Section>

        {/* INGREDIENT NAMING SYSTEM (procedural fallback) */}
        <Section id="sec-proc" title="Ingredient naming system" optional
          blurb="Optional. Many ingredients are auto-named “{tier adjective} {category noun}” with a tier-flavoured description. If you author every ingredient above by hand you can ignore this — but these word banks control any procedural fallback. One comma-separated list per box."
          filled={filledBy((k) => k.startsWith("procadj:") || k.startsWith("procnoun:") || k.startsWith("procdesc:"))}
          total={T.proc} open={isOpen("sec-proc")} onToggle={() => toggle("sec-proc")}
          onCopy={() => copySection(["procadj:", "procnoun:", "procdesc:"], "Ingredient naming")}>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-400/80">Adjectives by tier (Tier 1 → 6, early → apex)</p>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <Chip tone="amber">T{t}</Chip>
                  <div className="flex-1"><Field initial={draft[`procadj:${t}`] ?? ""} placeholder="adj, adj, adj, …" onCommit={(v) => set(`procadj:${t}`, v)} /></div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-400/80">Nouns by category</p>
            <div className="space-y-2">
              {CATS.map((c) => (
                <div key={c} className="flex items-center gap-2">
                  <Chip tone="amber">{CAT_LABEL[c]}</Chip>
                  <div className="flex-1"><Field initial={draft[`procnoun:${c}`] ?? ""} placeholder="noun, noun, noun, …" onCommit={(v) => set(`procnoun:${c}`, v)} /></div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-400/80">Description pool by tier (one line each)</p>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map((t) => (
                <div key={t} className="flex items-start gap-2">
                  <Chip tone="amber">T{t}</Chip>
                  <div className="flex-1"><AreaField initial={draft[`procdesc:${t}`] ?? ""} placeholder="one description per line" onCommit={(v) => set(`procdesc:${t}`, v)} /></div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ACHIEVEMENTS */}
        <Section id="sec-ach" title={`Achievements (${ACHIEVEMENTS.length})`}
          blurb="Each needs a title and a description. You're given the unlock condition, the target, whether it's secret, and the reward."
          filled={filledBy(pre("ach:"))} total={T.ach} open={isOpen("sec-ach")} onToggle={() => toggle("sec-ach")} onCopy={() => copySection(["ach:"], "Achievements")}>
          {ACHIEVEMENTS.map((a) => {
            const done = allFilled(`ach:${a.id}:name`, `ach:${a.id}:desc`);
            if (!show(done, TRIGGER_LABEL[a.trigger_type] ?? a.trigger_type, a.is_secret ? "secret" : "")) return null;
            return (
              <div key={a.id} className="rounded-lg border border-stone-800 bg-stone-950/40 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <DoneDot done={done} />
                  <Chip tone="info">{TRIGGER_LABEL[a.trigger_type] ?? a.trigger_type}</Chip>
                  <Chip tone="amber">target {a.target_value.toLocaleString()}</Chip>
                  {a.is_secret && <Chip tone="neg">secret</Chip>}
                  {a.rewards.map((r, i) => <Chip key={i} tone="pos">{rewardText(r)}</Chip>)}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field initial={draft[`ach:${a.id}:name`] ?? ""} placeholder="Achievement title" onCommit={(v) => set(`ach:${a.id}:name`, v)} />
                  <Field initial={draft[`ach:${a.id}:desc`] ?? ""} placeholder="Description / quip" onCommit={(v) => set(`ach:${a.id}:desc`, v)} />
                </div>
              </div>
            );
          })}
        </Section>

        {/* WORKERS */}
        <Section id="sec-workers" title="Workers"
          blurb="Names for your hirelings, their idle/travel/return status quips, and the five level-10 specializations (mechanics are fixed; you write the name & flavour)."
          filled={filledBy((k) => k.startsWith("worker:") || k.startsWith("status:") || k.startsWith("spec:"))}
          total={T.workers} open={isOpen("sec-workers")} onToggle={() => toggle("sec-workers")} onCopy={() => copySection(["worker:", "status:", "spec:"], "Workers")}>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-400/80">Worker names (in hire order)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: WORKER_NAME_COUNT }, (_, i) => show(isFilled(`worker:name:${i}`), "worker name", String(i + 1)) && (
                <div key={i} className="flex items-center gap-2">
                  <DoneDot done={isFilled(`worker:name:${i}`)} />
                  <div className="flex-1"><Field initial={draft[`worker:name:${i}`] ?? ""} placeholder={`Worker #${i + 1} name`} onCommit={(v) => set(`worker:name:${i}`, v)} /></div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-400/80">Status quips (one per line)</p>
            <div className="space-y-2">
              {STATUS_GROUPS.map((g) => show(isFilled(`status:${g.key}`), g.label, g.purpose, "status quip") && (
                <div key={g.key} className="rounded-lg border border-stone-800 bg-stone-950/40 p-2.5">
                  <div className="mb-1 flex items-center gap-1.5">
                    <DoneDot done={isFilled(`status:${g.key}`)} />
                    <span className="text-xs font-semibold text-amber-100">{g.label}</span>
                    <Chip>~{g.count} lines</Chip>
                  </div>
                  <p className="mb-1.5 text-[11px] text-stone-500">{g.purpose}</p>
                  <AreaField initial={draft[`status:${g.key}`] ?? ""} placeholder="one quip per line" onCommit={(v) => set(`status:${g.key}`, v)} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-400/80">Specializations (Level 10, permanent)</p>
            <div className="space-y-2">
              {SPECS.map((s) => {
                const done = allFilled(`spec:${s.id}:label`, `spec:${s.id}:desc`);
                if (!show(done, s.id, s.mech, s.restriction, "specialization")) return null;
                return (
                  <div key={s.id} className="rounded-lg border border-stone-800 bg-stone-950/40 p-2.5">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <DoneDot done={done} />
                      <Chip tone="amber">{s.id}</Chip>
                      <Chip tone="pos">{s.mech}</Chip>
                      <Chip tone="info">{s.restriction}</Chip>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field initial={draft[`spec:${s.id}:label`] ?? ""} placeholder="Display name" onCommit={(v) => set(`spec:${s.id}:label`, v)} />
                      <Field initial={draft[`spec:${s.id}:desc`] ?? ""} placeholder="One-line flavour" onCommit={(v) => set(`spec:${s.id}:desc`, v)} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Section>

        {/* MACHINES */}
        <Section id="sec-machines" title="Brewing machines"
          blurb="A name for each cauldron the player can build (in build order)."
          filled={filledBy(pre("machine:"))} total={T.machines} open={isOpen("sec-machines")} onToggle={() => toggle("sec-machines")} onCopy={() => copySection(["machine:"], "Machines")}>
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: MACHINE_NAME_COUNT }, (_, i) => show(isFilled(`machine:name:${i}`), "cauldron machine name", String(i + 1)) && (
              <div key={i} className="flex items-center gap-2">
                <DoneDot done={isFilled(`machine:name:${i}`)} />
                <div className="flex-1"><Field initial={draft[`machine:name:${i}`] ?? ""} placeholder={`Cauldron #${i + 1} name`} onCommit={(v) => set(`machine:name:${i}`, v)} /></div>
              </div>
            ))}
          </div>
        </Section>

        {/* GLOBAL UNLOCKS */}
        <Section id="sec-unlocks" title="Global unlocks (4)"
          blurb="Purchasable account-wide upgrades. Mechanics & cost are fixed; you write the item name and its description. (Each also needs an icon — see Graphics.)"
          filled={filledBy(pre("unlock:"))} total={T.unlocks} open={isOpen("sec-unlocks")} onToggle={() => toggle("sec-unlocks")} onCopy={() => copySection(["unlock:"], "Unlocks")}>
          {UNLOCKS.map((u) => {
            const done = allFilled(`unlock:${u.id}:name`, `unlock:${u.id}:desc`);
            if (!show(done, u.id, u.effect, "unlock upgrade")) return null;
            return (
              <div key={u.id} className="rounded-lg border border-stone-800 bg-stone-950/40 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <DoneDot done={done} />
                  <Chip tone="amber">cost {u.cost.toLocaleString()}</Chip>
                  <Chip tone="info">{u.effect}</Chip>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field initial={draft[`unlock:${u.id}:name`] ?? ""} placeholder="Item name" onCommit={(v) => set(`unlock:${u.id}:name`, v)} />
                  <Field initial={draft[`unlock:${u.id}:desc`] ?? ""} placeholder="What it does, in-world" onCommit={(v) => set(`unlock:${u.id}:desc`, v)} />
                </div>
              </div>
            );
          })}
        </Section>

        {/* TUTORIAL */}
        <Section id="sec-tut" title="Tutorial prompts" optional
          blurb="The onboarding coach-marks. Each prompt points the player at one glowing control — keep them short and action-led. Purpose is given per line."
          filled={filledBy(pre("tut:"))} total={T.tut} open={isOpen("sec-tut")} onToggle={() => toggle("sec-tut")} onCopy={() => copySection(["tut:"], "Tutorial")}>
          {TUT_STEPS.map((s) => {
            const phases = s.phases.filter((p) => show(isFilled(`tut:${p.key}`), s.step, p.purpose, "tutorial prompt"));
            if (phases.length === 0) return null;
            return (
              <div key={s.step}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-400/80">{s.step}</p>
                <div className="space-y-2">
                  {phases.map((p) => (
                    <div key={p.key} className="rounded-lg border border-stone-800 bg-stone-950/40 p-2.5">
                      <div className="mb-1 flex items-center gap-1.5"><DoneDot done={isFilled(`tut:${p.key}`)} /><span className="text-[11px] text-stone-500">{p.purpose}</span></div>
                      <Field initial={draft[`tut:${p.key}`] ?? ""} placeholder="Prompt text" onCommit={(v) => set(`tut:${p.key}`, v)} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </Section>

        {/* GRAPHICS */}
        <Section id="sec-gfx" title={`Graphics to create (${GFX_DONE_TOTAL})`}
          blurb="What art to draw, not an upload box. Each card names what the asset denotes and its exact canvas size, and is tracked individually with its own status & notes. (The map is its own section above.)"
          filled={gfxDone} total={GFX_DONE_TOTAL} open={isOpen("sec-gfx")} onToggle={() => toggle("sec-gfx")} onCopy={() => copySection(["gfx:"], "Graphics status")}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400/80">Illustrations</p>
          {GFX_ILLUSTRATIONS.map((g) => {
            const done = draft[`gfx:${g.id}:status`] === "done";
            if (!show(done, g.label, g.purpose, g.dims, (g.variants ?? []).join(" "))) return null;
            return (
              <div key={g.id} className="rounded-lg border border-stone-800 bg-stone-950/40 p-3">
                <div className="flex gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-stone-600 bg-stone-800/40 text-center text-[8px] leading-tight text-stone-500">{g.dims.split(" ")[0]}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <DoneDot done={done} />
                      <span className="text-sm font-semibold text-amber-100">{g.label}</span>
                      <Chip tone="info">{g.dims}</Chip>
                    </div>
                    <p className="mt-1 text-xs text-stone-400">{g.purpose}</p>
                    {g.variants && <div className="mt-1.5 flex flex-wrap gap-1">{g.variants.map((v) => <Chip key={v}>{v}</Chip>)}</div>}
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <StatusPicker value={draft[`gfx:${g.id}:status`] ?? "todo"} onChange={(v) => set(`gfx:${g.id}:status`, v)} />
                  <div className="min-w-[140px] flex-1"><Field initial={draft[`gfx:${g.id}:notes`] ?? ""} placeholder="Notes (style, palette, link to file…)" onCommit={(v) => set(`gfx:${g.id}:notes`, v)} /></div>
                </div>
              </div>
            );
          })}

          <p className="pt-2 text-[11px] font-bold uppercase tracking-wider text-amber-400/80">Icon set (emoji placeholders to replace)</p>
          <p className="text-[11px] text-stone-500">Small single-colour-friendly marks; recommend a 24×24 SVG each. Each is tracked & noted individually.</p>
          {GFX_ICONS.map((g) => {
            const done = draft[`gfx:${g.id}:status`] === "done";
            if (!show(done, g.label, g.purpose, "icon")) return null;
            return (
              <div key={g.id} className="rounded-lg border border-stone-800 bg-stone-950/40 p-2.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-stone-600 bg-stone-800/40 text-[8px] text-stone-500">24²</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><DoneDot done={done} /><span className="text-xs font-semibold text-amber-100">{g.label}</span></div>
                    <div className="truncate text-[11px] text-stone-500">{g.purpose}</div>
                  </div>
                  <StatusPicker value={draft[`gfx:${g.id}:status`] ?? "todo"} onChange={(v) => set(`gfx:${g.id}:status`, v)} />
                </div>
                <div className="mt-2"><Field initial={draft[`gfx:${g.id}:notes`] ?? ""} placeholder="Notes (style, palette, link to file…)" onCommit={(v) => set(`gfx:${g.id}:notes`, v)} /></div>
              </div>
            );
          })}
        </Section>

        {filtering && <EmptyHint />}

        <footer className="pb-10 pt-2 text-center text-[11px] text-stone-600">
          Reflects the live game data · {ingCount} ingredients · {locs.length} locations · {ACHIEVEMENTS.length} achievements.
          Ask Claude to regenerate this page if game content changes.
        </footer>
      </div>

      {/* Export / Import overlay */}
      {overlay && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={() => setOverlay(null)}>
          <div className="flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-2xl border border-stone-700 bg-stone-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stone-700 px-4 py-3">
              <h2 className="text-sm font-bold text-amber-200">{overlay === "export" ? "Export — paste into Claude Code" : "Import — paste a previous export"}</h2>
              <button onClick={() => setOverlay(null)} className="rounded-md px-2 py-1 text-stone-400 hover:bg-stone-800">✕</button>
            </div>
            {overlay === "export"
              ? <ExportPane text={buildExport()} onCopy={(t) => copyText(t, "Export")} />
              : <ImportPane onImport={doImport} />}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-amber-700 bg-stone-900 px-4 py-2 text-xs font-semibold text-amber-200 shadow-xl">{toast}</div>
      )}
    </div>
  );
}

function ExportPane({ text, onCopy }: { text: string; onCopy: (t: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
      <p className="text-xs text-stone-400">Only your finished entries are included (plus the full resolved map layout). Paste this whole block to Claude Code to commit, or save it as a backup.</p>
      <textarea readOnly value={text} className="min-h-[40dvh] flex-1 resize-none rounded-lg border border-stone-700 bg-stone-950 p-3 font-mono text-[11px] leading-relaxed text-stone-300" onFocus={(e) => e.currentTarget.select()} />
      <button onClick={() => onCopy(text)} className="rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-stone-950 hover:bg-amber-500">Copy to clipboard</button>
    </div>
  );
}

function ImportPane({ onImport }: { onImport: (raw: string) => void }) {
  const [raw, setRaw] = useState("");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
      <p className="text-xs text-stone-400">Paste a previously exported block. Its fields merge into your current draft (existing entries with the same key are overwritten).</p>
      <textarea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Paste exported JSON here…" className="min-h-[40dvh] flex-1 resize-none rounded-lg border border-stone-700 bg-stone-950 p-3 font-mono text-[11px] text-stone-300" />
      <button onClick={() => onImport(raw)} className="rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-stone-950 hover:bg-amber-500">Merge into draft</button>
    </div>
  );
}
