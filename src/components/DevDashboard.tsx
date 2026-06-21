import type { ReactNode } from "react";
import Modal from "./ui/Modal";
import { useConfigStore, type BaseFormulas } from "../store/configStore";
import { useGameStore } from "../store/gameStore";

/**
 * Hidden Dev Dashboard (see §8). Maps configStore values to live inputs so the
 * game can be rebalanced at runtime without committing code.
 */
export default function DevDashboard({ onClose }: { onClose: () => void }) {
  const cfg = useConfigStore();
  const game = useGameStore();

  return (
    <Modal title="⚙ Dev Dashboard" onClose={onClose} accent="#f43f5e">
      <Section title="Cheats">
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => useGameStore.setState({ coins: game.coins + 1000 })}>+1000 🪙</Btn>
          <Btn onClick={() => useGameStore.setState({ coins: game.coins + 100000 })}>+100k 🪙</Btn>
          <Btn onClick={() => game.hardReset()} danger>Hard Reset</Btn>
          <Btn onClick={() => cfg.resetConfig()}>Reset Config</Btn>
        </div>
      </Section>

      <Section title="Base Formulas">
        {(Object.keys(cfg.formulas) as (keyof BaseFormulas)[]).map((k) => (
          <NumRow
            key={k}
            label={k}
            value={cfg.formulas[k]}
            onChange={(v) => cfg.setFormula(k, v)}
          />
        ))}
      </Section>

      <Section title="Ingredient Base Values">
        {Object.values(cfg.ingredients).map((ing) => (
          <NumRow
            key={ing.id}
            label={ing.name}
            value={ing.base_value}
            onChange={(v) => cfg.setIngredientValue(ing.id, v)}
          />
        ))}
      </Section>

      <Section title="Location Distances">
        {Object.values(cfg.locations).map((loc) => (
          <NumRow
            key={loc.id}
            label={loc.name}
            value={loc.distance}
            onChange={(v) => cfg.setLocationDistance(loc.id, v)}
          />
        ))}
      </Section>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function NumRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span className="truncate text-slate-300">{label}</span>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-24 rounded bg-slate-800 px-2 py-1 text-right text-slate-100 outline-none focus:ring-1 focus:ring-rose-500"
      />
    </label>
  );
}

function Btn({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-xs font-medium text-white ${danger ? "bg-rose-700 hover:bg-rose-600" : "bg-slate-700 hover:bg-slate-600"}`}
    >
      {children}
    </button>
  );
}
