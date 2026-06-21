import { useState, useMemo } from "react";
import { Search, Plus, Trash2, ChevronDown, ChevronRight, X } from "lucide-react";
import { useConfigStore, type BaseFormulas } from "../store/configStore";
import { useGameStore } from "../store/gameStore";
import type { Ingredient, Location, Rarity, IngredientCategory, DropEntry } from "../types";

type Tab = "cheats" | "formulas" | "ingredients" | "locations";

const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
const CATEGORIES: IngredientCategory[] = ["root", "petal", "fungus", "crystal", "essence", "bone"];
const RARITY_COLOR: Record<Rarity, string> = {
  common: "#94a3b8", uncommon: "#4ade80", rare: "#60a5fa", epic: "#c084fc", legendary: "#fbbf24",
};

const ATTR_GROUPS: { label: string; keys: (keyof import("../types").Attributes)[] }[] = [
  { label: "Physical", keys: ["strength","speed","vitality","density","elasticity"] },
  { label: "Mental",   keys: ["focus","mana","resonance","insight","luck"] },
  { label: "Elemental",keys: ["heat","cold","shock","aqua","terra","aero","radiance","void"] },
  { label: "Chemical", keys: ["toxicity","volatility","acidity","alkalinity","viscosity","stability","solvency"] },
  { label: "Cosmic",   keys: ["chrono","gravitas","entropy","soul","mutation"] },
];

const FORMULA_LABELS: Record<keyof BaseFormulas, string> = {
  base_brew_time:              "Base brew time (s)",
  xp_base:                     "XP base",
  xp_growth:                   "XP growth factor",
  cost_base:                   "Upgrade cost base",
  cost_growth:                 "Upgrade cost growth",
  toxicity_value_mult:         "Toxicity → value mult (override)",
  toxicity_time_mult:          "Toxicity → time mult",
  volatility_xp_mult:          "Volatility → XP mult",
  volatility_multibrew_penalty:"Volatility → multi-brew penalty",
  attr_value_mult:             "All attributes → value mult",
  offline_threshold_hours:     "Offline threshold (hrs)",
};

function emptyIngredient(): Ingredient {
  return {
    id: "", name: "", category: "root", rarity: "common", base_value: 5,
    description: "",
    attributes: {
      strength:0,speed:0,vitality:0,density:0,elasticity:0,
      focus:0,mana:0,resonance:0,insight:0,luck:0,
      heat:0,cold:0,shock:0,aqua:0,terra:0,aero:0,radiance:0,void:0,
      toxicity:0,volatility:0,acidity:0,alkalinity:0,viscosity:0,stability:0,solvency:0,
      chrono:0,gravitas:0,entropy:0,soul:0,mutation:0,
    },
  };
}

function emptyLocation(): Location {
  return {
    id: "", name: "", flavor: "", distance: 10, danger: 0, unlockCost: 0,
    drops: [],
  };
}

export default function DevDashboard({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("cheats");
  const [search, setSearch] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0f1a] text-slate-200">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-700 bg-[#0f172a] px-4 py-3">
        <span className="font-mono text-sm font-bold text-rose-400">⚙ Dev Config</span>
        <div className="flex items-center gap-3">
          {tab !== "cheats" && tab !== "formulas" && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5">
              <Search size={13} className="text-slate-500" />
              <input
                className="w-40 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
                placeholder={`Search ${tab}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && <button onClick={() => setSearch("")}><X size={12} className="text-slate-500" /></button>}
            </div>
          )}
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-slate-800 bg-[#0f172a]">
        {(["cheats","formulas","ingredients","locations"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSearch(""); }}
            className={`px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${
              tab === t ? "border-b-2 border-rose-500 text-rose-400" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === "cheats"      && <CheatsTab />}
        {tab === "formulas"    && <FormulasTab />}
        {tab === "ingredients" && <IngredientsTab search={search} />}
        {tab === "locations"   && <LocationsTab search={search} />}
      </div>
    </div>
  );
}

// ── Cheats ─────────────────────────────────────────────────────────────────

function CheatsTab() {
  const game = useGameStore();
  const cfg = useConfigStore();
  return (
    <div className="space-y-6 max-w-lg">
      <Section title="Economy">
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => useGameStore.setState({ coins: game.coins + 500 })}>+500 🪙</Btn>
          <Btn onClick={() => useGameStore.setState({ coins: game.coins + 5000 })}>+5k 🪙</Btn>
          <Btn onClick={() => useGameStore.setState({ coins: game.coins + 100000 })}>+100k 🪙</Btn>
          <Btn onClick={() => useGameStore.setState({ coins: 0 })} danger>Clear coins</Btn>
        </div>
      </Section>
      <Section title="Machine">
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => useGameStore.setState((s) => ({ machine: { ...s.machine, xp: s.machine.xp + 500 } }))}>+500 Machine XP</Btn>
          <Btn onClick={() => useGameStore.setState((s) => ({ machine: { ...s.machine, upgrade_tokens: (s.machine.upgrade_tokens ?? 0) + 1 } }))}>+1 Machine Token</Btn>
        </div>
      </Section>
      <Section title="Workers">
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => useGameStore.setState((s) => ({ workers: s.workers.map((w) => ({ ...w, xp: w.xp + 500 })) }))}>+500 XP all workers</Btn>
          <Btn onClick={() => useGameStore.setState((s) => ({ workers: s.workers.map((w) => ({ ...w, upgrade_tokens: (w.upgrade_tokens ?? 0) + 1 })) }))}>+1 Token all workers</Btn>
        </div>
      </Section>
      <Section title="Danger Zone">
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => cfg.resetConfig()} danger>Reset Config</Btn>
          <Btn onClick={() => game.hardReset()} danger>Hard Reset Game</Btn>
        </div>
      </Section>
    </div>
  );
}

// ── Formulas ───────────────────────────────────────────────────────────────

function FormulasTab() {
  const cfg = useConfigStore();
  return (
    <div className="max-w-lg space-y-1">
      {(Object.keys(cfg.formulas) as (keyof BaseFormulas)[]).map((k) => (
        <FieldRow key={k} label={FORMULA_LABELS[k]} hint={k}>
          <NumInput value={cfg.formulas[k]} onChange={(v) => cfg.setFormula(k, v)} />
        </FieldRow>
      ))}
    </div>
  );
}

// ── Ingredients ────────────────────────────────────────────────────────────

function IngredientsTab({ search }: { search: string }) {
  const cfg = useConfigStore();
  const [rarityFilter, setRarityFilter] = useState<Rarity | "all">("all");
  const [catFilter, setCatFilter]       = useState<IngredientCategory | "all">("all");
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [adding, setAdding]             = useState(false);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return Object.values(cfg.ingredients).filter((i) =>
      (rarityFilter === "all" || i.rarity === rarityFilter) &&
      (catFilter    === "all" || i.category === catFilter) &&
      (!q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
    );
  }, [cfg.ingredients, search, rarityFilter, catFilter]);

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={rarityFilter}
          onChange={(e) => setRarityFilter(e.target.value as Rarity | "all")}
          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none"
        >
          <option value="all">All rarities</option>
          {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value as IngredientCategory | "all")}
          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="ml-auto text-xs text-slate-600">{list.length} ingredients</span>
      </div>

      {/* Add new */}
      <button
        onClick={() => setAdding(true)}
        className="mb-4 flex items-center gap-2 rounded-lg border border-dashed border-slate-600 px-4 py-2.5 text-sm text-slate-400 hover:border-rose-500 hover:text-rose-400 transition w-full justify-center"
      >
        <Plus size={15} /> New Ingredient
      </button>

      {adding && (
        <IngredientEditor
          ingredient={emptyIngredient()}
          isNew
          onSave={(ing) => { cfg.addIngredient(ing); setAdding(false); setExpanded(ing.id); }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="space-y-2">
        {list.map((ing) => (
          <div key={ing.id} className="rounded-xl border border-slate-700 bg-slate-900/60">
            <button
              className="flex w-full items-center gap-3 p-3 text-left"
              onClick={() => setExpanded(expanded === ing.id ? null : ing.id)}
            >
              <span style={{ color: RARITY_COLOR[ing.rarity] }} className="text-lg">●</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-slate-100">{ing.name}</span>
                  <span className="text-xs text-slate-500">{ing.category} · {ing.rarity}</span>
                </div>
                <div className="truncate text-xs text-slate-500 italic">"{ing.description}"</div>
              </div>
              <span className="text-xs text-slate-500 mr-1">🪙{ing.base_value}</span>
              {expanded === ing.id ? <ChevronDown size={15} className="text-slate-500" /> : <ChevronRight size={15} className="text-slate-500" />}
            </button>
            {expanded === ing.id && (
              <div className="border-t border-slate-800 p-3">
                <IngredientEditor
                  ingredient={ing}
                  isNew={false}
                  onSave={(updated) => { cfg.updateIngredient(ing.id, updated); }}
                  onCancel={() => setExpanded(null)}
                  onDelete={() => { cfg.removeIngredient(ing.id); setExpanded(null); }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function IngredientEditor({
  ingredient, isNew, onSave, onCancel, onDelete,
}: {
  ingredient: Ingredient;
  isNew: boolean;
  onSave: (ing: Ingredient) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<Ingredient>(() => JSON.parse(JSON.stringify(ingredient)));
  const set = (updates: Partial<Ingredient>) => setDraft((d) => ({ ...d, ...updates }));
  const setAttr = (k: keyof Ingredient["attributes"], v: number) =>
    setDraft((d) => ({ ...d, attributes: { ...d.attributes, [k]: v } }));

  const idFromName = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const handleSave = () => {
    const id = isNew ? idFromName(draft.name) : draft.id;
    if (!id || !draft.name) return;
    onSave({ ...draft, id });
  };

  return (
    <div className="space-y-4">
      {/* Core fields */}
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Name">
          <TextInput value={draft.name} onChange={(v) => set({ name: v })} />
        </FieldRow>
        <FieldRow label="Category">
          <select value={draft.category} onChange={(e) => set({ category: e.target.value as IngredientCategory })}
            className="w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Rarity">
          <select value={draft.rarity} onChange={(e) => set({ rarity: e.target.value as Rarity })}
            className="w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none">
            {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Base value">
          <NumInput value={draft.base_value} onChange={(v) => set({ base_value: v })} />
        </FieldRow>
      </div>

      <FieldRow label="Description">
        <textarea
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          rows={2}
          className="w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none resize-none focus:ring-1 focus:ring-rose-500"
        />
      </FieldRow>

      {/* Attributes */}
      {ATTR_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">{group.label}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {group.keys.map((k) => (
              <FieldRow key={k} label={k}>
                <NumInput value={draft.attributes[k]} onChange={(v) => setAttr(k, v)} />
              </FieldRow>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
        <button onClick={handleSave} className="rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-rose-500">
          {isNew ? "Add Ingredient" : "Save Changes"}
        </button>
        <button onClick={onCancel} className="rounded-lg bg-slate-700 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-600">
          {isNew ? "Cancel" : "Discard"}
        </button>
        {onDelete && (
          <button onClick={onDelete} className="ml-auto flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-rose-500 hover:bg-slate-700">
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

// ── Locations ──────────────────────────────────────────────────────────────

function LocationsTab({ search }: { search: string }) {
  const cfg = useConfigStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding]     = useState(false);

  const list = useMemo(() => {
    const q = search.toLowerCase();
    return Object.values(cfg.locations).filter(
      (l) => !q || l.name.toLowerCase().includes(q) || l.flavor.toLowerCase().includes(q)
    ).sort((a, b) => a.distance - b.distance);
  }, [cfg.locations, search]);

  return (
    <div>
      <button
        onClick={() => setAdding(true)}
        className="mb-4 flex items-center gap-2 rounded-lg border border-dashed border-slate-600 px-4 py-2.5 text-sm text-slate-400 hover:border-rose-500 hover:text-rose-400 transition w-full justify-center"
      >
        <Plus size={15} /> New Location
      </button>

      {adding && (
        <LocationEditor
          location={emptyLocation()}
          isNew
          onSave={(loc) => { cfg.addLocation(loc); setAdding(false); setExpanded(loc.id); }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="space-y-2">
        {list.map((loc) => (
          <div key={loc.id} className="rounded-xl border border-slate-700 bg-slate-900/60">
            <button
              className="flex w-full items-center gap-3 p-3 text-left"
              onClick={() => setExpanded(expanded === loc.id ? null : loc.id)}
            >
              <span className="text-green-400">📍</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-slate-100">{loc.name}</span>
                  <span className="text-xs text-slate-500">dist {loc.distance} · danger {"⚠".repeat(loc.danger + 1)}</span>
                </div>
                <div className="truncate text-xs text-slate-500 italic">"{loc.flavor}"</div>
              </div>
              {expanded === loc.id ? <ChevronDown size={15} className="text-slate-500" /> : <ChevronRight size={15} className="text-slate-500" />}
            </button>
            {expanded === loc.id && (
              <div className="border-t border-slate-800 p-3">
                <LocationEditor
                  location={loc}
                  isNew={false}
                  onSave={(updates) => cfg.updateLocation(loc.id, updates)}
                  onCancel={() => setExpanded(null)}
                  onDelete={() => { cfg.removeLocation(loc.id); setExpanded(null); }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LocationEditor({
  location, isNew, onSave, onCancel, onDelete,
}: {
  location: Location;
  isNew: boolean;
  onSave: (loc: Location) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const cfg = useConfigStore();
  const [draft, setDraft] = useState<Location>(() => JSON.parse(JSON.stringify(location)));
  const set = (updates: Partial<Location>) => setDraft((d) => ({ ...d, ...updates }));

  const idFromName = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const setDropWeight = (idx: number, weight: number) =>
    setDraft((d) => {
      const drops = [...d.drops];
      drops[idx] = { ...drops[idx], weight };
      return { ...d, drops };
    });

  const setDropIngredient = (idx: number, ingredientId: string) =>
    setDraft((d) => {
      const drops = [...d.drops];
      drops[idx] = { ...drops[idx], ingredientId };
      return { ...d, drops };
    });

  const addDrop = () =>
    setDraft((d) => ({
      ...d,
      drops: [...d.drops, { ingredientId: Object.keys(cfg.ingredients)[0] ?? "", weight: 10 }],
    }));

  const removeDrop = (idx: number) =>
    setDraft((d) => ({ ...d, drops: d.drops.filter((_, i) => i !== idx) }));

  const handleSave = () => {
    const id = isNew ? idFromName(draft.name) : draft.id;
    if (!id || !draft.name) return;
    onSave({ ...draft, id });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Name">
          <TextInput value={draft.name} onChange={(v) => set({ name: v })} />
        </FieldRow>
        <FieldRow label="Distance">
          <NumInput value={draft.distance} onChange={(v) => set({ distance: v })} />
        </FieldRow>
        <FieldRow label="Danger (0–3)">
          <NumInput value={draft.danger} onChange={(v) => set({ danger: Math.max(0, Math.min(3, Math.round(v))) })} />
        </FieldRow>
        <FieldRow label="Unlock cost">
          <NumInput value={draft.unlockCost} onChange={(v) => set({ unlockCost: v })} />
        </FieldRow>
      </div>

      <FieldRow label="Flavor text">
        <textarea
          value={draft.flavor}
          onChange={(e) => set({ flavor: e.target.value })}
          rows={3}
          className="w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none resize-none focus:ring-1 focus:ring-rose-500"
        />
      </FieldRow>

      {/* Drops */}
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Drop table</p>
        <div className="space-y-1.5">
          {draft.drops.map((drop: DropEntry, idx: number) => (
            <div key={idx} className="flex items-center gap-2">
              <select
                value={drop.ingredientId}
                onChange={(e) => setDropIngredient(idx, e.target.value)}
                className="flex-1 rounded bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none"
              >
                {Object.values(cfg.ingredients).map((ing) => (
                  <option key={ing.id} value={ing.id}>{ing.name}</option>
                ))}
              </select>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span>wt</span>
                <input
                  type="number"
                  value={drop.weight}
                  onChange={(e) => setDropWeight(idx, parseFloat(e.target.value) || 0)}
                  className="w-16 rounded bg-slate-800 px-2 py-1.5 text-right text-slate-200 outline-none"
                />
              </div>
              <button onClick={() => removeDrop(idx)} className="text-slate-600 hover:text-rose-500"><Trash2 size={13} /></button>
            </div>
          ))}
          <button
            onClick={addDrop}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-rose-400 transition"
          >
            <Plus size={12} /> Add drop
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
        <button onClick={handleSave} className="rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-rose-500">
          {isNew ? "Add Location" : "Save Changes"}
        </button>
        <button onClick={onCancel} className="rounded-lg bg-slate-700 px-4 py-1.5 text-sm text-slate-300 hover:bg-slate-600">
          {isNew ? "Cancel" : "Discard"}
        </button>
        {onDelete && (
          <button onClick={onDelete} className="ml-auto flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-rose-500 hover:bg-slate-700">
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

// ── Shared primitives ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">{title}</p>
      {children}
    </div>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}{hint && <span className="ml-1 normal-case text-slate-700">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function NumInput({ value, step = 1, onChange }: { value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-right text-slate-200 outline-none focus:ring-1 focus:ring-rose-500"
    />
  );
}

function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-rose-500"
    />
  );
}

function Btn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition ${danger ? "bg-rose-700 hover:bg-rose-600" : "bg-slate-700 hover:bg-slate-600"}`}
    >
      {children}
    </button>
  );
}
