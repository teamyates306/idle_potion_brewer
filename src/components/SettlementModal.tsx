import { useMemo, useState } from "react";
import { ArrowRight, Footprints, Plus, Store, X } from "lucide-react";
import { useGameStore, ingredientMatchesTradeInput, tradeInputLabel } from "../store/gameStore";
import { useConfigStore } from "../store/configStore";
import { gatherRoundTrip } from "../engine/formulas";
import { regionOfDistance } from "../data/regions";
import { fmt, fmtDuration, RARITY_COLOR } from "../util/format";
import IngredientSvg from "./art/IngredientSvg";
import WorkerArt, { workerHue } from "./art/WorkerArt";
import type { Settlement, TradeSlot } from "../types";

/**
 * Trade Manager — the panel opened by tapping a Settlement node (or via a
 * worker's "Trade at Settlement" flow, which passes lockedWorkerIndex).
 *
 * Flow: pick a trade slot → tap its "From" button (styled like a brewer recipe
 * slot) → a filtered picker lists only inventory that satisfies the slot's
 * input rule → assign a worker. Inputs leave the stash the moment the worker
 * departs, are handed over at the halfway point, and the fixed output arrives
 * when the worker returns. Workers keep re-running the trade while stock lasts.
 */
export default function SettlementModal({
  settlement,
  lockedWorkerIndex = null,
  onClose,
}: {
  settlement: Settlement;
  lockedWorkerIndex?: number | null;
  onClose: () => void;
}) {
  const workers = useGameStore((s) => s.workers);
  const inv = useGameStore((s) => s.ingredientInv);
  const assignWorkerToTrade = useGameStore((s) => s.assignWorkerToTrade);
  const cancelTrade = useGameStore((s) => s.cancelTrade);
  const cfg = useConfigStore();

  const [activeSlotId, setActiveSlotId] = useState<string>(settlement.slots[0]?.id ?? "");
  const [fromBySlot, setFromBySlot] = useState<Record<string, string | null>>({});
  const [pickerSlot, setPickerSlot] = useState<TradeSlot | null>(null);

  const region = regionOfDistance(settlement.distance);
  const activeSlot = settlement.slots.find((s) => s.id === activeSlotId) ?? settlement.slots[0];
  const activeFrom = activeSlot ? fromBySlot[activeSlot.id] ?? null : null;
  const activeFromIng = activeFrom ? cfg.ingredients[activeFrom] : null;
  const activeFromOk =
    !!activeSlot && !!activeFromIng && (inv[activeFromIng.id] ?? 0) >= activeSlot.input.count;

  // Workers able to run trades (travel job — brewer-only classes can't).
  const eligible = workers
    .map((w, i) => ({ w, i }))
    .filter(({ w, i }) =>
      (lockedWorkerIndex == null || i === lockedWorkerIndex) &&
      w.specialization !== "pounder" && w.specialization !== "manic"
    );
  const tradingHere = workers.map((w, i) => ({ w, i })).filter(({ w }) => w.assigned_settlement === settlement.id);

  const send = (workerIdx: number) => {
    if (!activeSlot || !activeFrom) return;
    assignWorkerToTrade(workerIdx, settlement.id, activeSlot.id, activeFrom);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-y-auto rounded-t-2xl border border-amber-800/60 bg-slate-900 p-4 shadow-2xl sm:rounded-2xl"
        style={{ maxHeight: "88dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-3 flex items-start justify-between border-b border-slate-700 pb-3" style={{ boxShadow: "inset 0 -2px 0 #b08a3344" }}>
          <div>
            <h2 className="flex items-center gap-1.5 text-lg font-semibold text-amber-900">
              <Store size={17} /> {settlement.name}
            </h2>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Footprints size={11} /> Distance {settlement.distance} · {region.name} · Trading Post
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">✕</button>
        </div>

        <p className="mb-3 text-sm italic text-slate-400">"{settlement.flavor}"</p>
        <p className="mb-3 rounded-lg bg-slate-800/50 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
          Send a worker with surplus ingredients; they hand the goods over on arrival and
          carry the settlement's fixed offer home. The run repeats while your stash holds out.
        </p>

        {/* Trade slots */}
        <p className="mb-1.5 text-[10px] uppercase tracking-wider text-amber-700">Trade offers</p>
        <div className="mb-4 space-y-2">
          {settlement.slots.map((slot) => {
            const outIng = cfg.ingredients[slot.output.ingredientId];
            const from = fromBySlot[slot.id] ?? null;
            const fromIng = from ? cfg.ingredients[from] : null;
            const fromCount = fromIng ? inv[fromIng.id] ?? 0 : 0;
            const isActive = slot.id === activeSlot?.id;
            const short = !!fromIng && fromCount < slot.input.count;
            return (
              <button
                key={slot.id}
                onClick={() => setActiveSlotId(slot.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  isActive ? "border-amber-500/70 bg-amber-950/25 ring-1 ring-amber-500/40" : "border-slate-700 bg-slate-800/40 hover:border-amber-600/40"
                }`}
              >
                <div className="mb-2 text-[11px] font-medium text-slate-300">
                  Wants: <span className="text-amber-800 font-semibold">{tradeInputLabel(slot.input)}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  {/* "From" slot — styled like a brewer recipe slot */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setActiveSlotId(slot.id); setPickerSlot(slot); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setActiveSlotId(slot.id); setPickerSlot(slot); } }}
                    className={`relative flex h-14 w-14 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border text-xs transition active:scale-95 ${
                      fromIng ? "border-amber-500/40 bg-slate-800 hover:border-amber-400" : "border-dashed border-amber-600/50 bg-slate-800/70 hover:border-amber-400"
                    }`}
                    title="Choose which ingredient to send"
                  >
                    {fromIng ? (
                      <>
                        <IngredientSvg category={fromIng.category} rarity={fromIng.rarity} size={24} />
                        <span className="mt-0.5 w-full truncate px-0.5 text-center leading-none text-slate-300" style={{ fontSize: "7px" }}>
                          {fromIng.name}
                        </span>
                        <span className={`absolute right-1 top-1 font-bold leading-none ${short ? "text-rose-500" : "text-slate-300"}`} style={{ fontSize: "9px" }}>
                          {fromCount > 999 ? "999+" : fromCount}
                        </span>
                      </>
                    ) : (
                      <>
                        <Plus size={16} className="text-amber-600" />
                        <span className="mt-0.5 text-[8px] text-amber-700">From…</span>
                      </>
                    )}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">×{slot.input.count}</span>
                  <ArrowRight size={16} className="shrink-0 text-amber-700" />
                  {/* Fixed output */}
                  <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-emerald-700/40 bg-emerald-950/20 px-2.5 py-2">
                    {outIng && <IngredientSvg category={outIng.category} rarity={outIng.rarity} size={24} />}
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold" style={{ color: outIng ? RARITY_COLOR[outIng.rarity] : undefined }}>
                        {outIng?.name ?? slot.output.ingredientId}
                      </span>
                      <span className="block text-[10px] text-slate-400">
                        ×{slot.output.count} · {outIng ? outIng.rarity : ""} · 🪙 {outIng ? fmt(outIng.base_value) : "?"} each
                      </span>
                    </span>
                  </span>
                </div>
                {short && (
                  <p className="mt-1.5 text-[10px] text-rose-500">
                    Not enough {fromIng!.name} — need {slot.input.count}, have {fromCount}.
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {/* Workers already trading here */}
        {tradingHere.length > 0 && (
          <div className="mb-4">
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">Currently trading here</p>
            <div className="space-y-2">
              {tradingHere.map(({ w, i }) => (
                <div key={w.id} className="flex items-center gap-3 rounded-xl border border-amber-600/40 bg-amber-950/15 p-3">
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full" style={{ background: `${w.color ?? "#7c3aed"}33` }}>
                    <WorkerArt size={36} active hueShift={workerHue(w.id)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-100">{w.name}</div>
                    <div className="truncate text-xs italic text-slate-500">"{w.flavor_status}"</div>
                  </div>
                  <button
                    onClick={() => cancelTrade(i)}
                    className="shrink-0 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 active:scale-95 transition"
                    title="Recall — goods are refunded only if the worker hasn't reached the settlement yet"
                  >
                    Recall
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assign a worker to the selected slot */}
        <div>
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            Assign worker {activeSlot ? `· offer ${settlement.slots.findIndex((s) => s.id === activeSlot.id) + 1}` : ""}
          </p>
          {!activeFrom && (
            <p className="mb-2 rounded-lg border border-dashed border-amber-700/40 bg-amber-950/10 px-3 py-2 text-[11px] text-amber-800">
              Tap the "From…" slot above to choose which ingredient to send first.
            </p>
          )}
          <div className="space-y-2">
            {eligible.map(({ w, i }) => {
              const tripSecs = gatherRoundTrip(settlement.distance, w.gather_speed);
              const busyHere = w.assigned_settlement === settlement.id;
              const canSend = activeFromOk && !busyHere;
              return (
                <div key={w.id} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3">
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full" style={{ background: `${w.color ?? "#7c3aed"}33` }}>
                    <WorkerArt size={36} active={false} hueShift={workerHue(w.id)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-100">{w.name}</div>
                    <div className="text-xs text-slate-500">{fmtDuration(tripSecs)} round trip</div>
                  </div>
                  <button
                    onClick={() => send(i)}
                    disabled={!canSend}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
                      canSend ? "bg-amber-600 text-white hover:bg-amber-500" : "cursor-not-allowed bg-slate-800 text-slate-500"
                    }`}
                  >
                    {busyHere ? "Trading" : "Send"}
                  </button>
                </div>
              );
            })}
            {eligible.length === 0 && (
              <p className="py-3 text-center text-xs text-slate-500">No workers can run trades (brewer-only classes stay home).</p>
            )}
          </div>
        </div>
      </div>

      {pickerSlot && (
        <TradeInputPicker
          slot={pickerSlot}
          onPick={(id) => { setFromBySlot((prev) => ({ ...prev, [pickerSlot.id]: id })); setPickerSlot(null); }}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
}

/** Filtered inventory picker — lists ONLY items matching the slot's input rule. */
function TradeInputPicker({
  slot, onPick, onClose,
}: {
  slot: TradeSlot;
  onPick: (ingredientId: string) => void;
  onClose: () => void;
}) {
  const inv = useGameStore((s) => s.ingredientInv);
  const discovered = useGameStore((s) => s.discovered);
  const cfg = useConfigStore();

  const matches = useMemo(() =>
    discovered
      .map((id) => ({ id, ing: cfg.ingredients[id], count: inv[id] ?? 0 }))
      .filter((x) => x.ing && ingredientMatchesTradeInput(x.ing, slot.input))
      .sort((a, b) => b.count - a.count || a.ing.name.localeCompare(b.ing.name)),
    [discovered, cfg.ingredients, inv, slot]
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="flex max-h-[80dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-amber-700/50 bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h3 className="text-base font-bold text-amber-800">Send {tradeInputLabel(slot.input)}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {matches.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Nothing in the stash matches this offer yet.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {matches.map(({ id, ing, count }) => {
                const enough = count >= slot.input.count;
                return (
                  <button
                    key={id}
                    onClick={() => enough && onPick(id)}
                    disabled={!enough}
                    className={`relative flex flex-col items-center justify-center gap-1 rounded-lg border p-2 transition ${
                      enough
                        ? "border-slate-700 bg-slate-800/60 hover:border-amber-500/60 active:scale-95"
                        : "cursor-not-allowed border-slate-800 bg-slate-900/60 opacity-50"
                    }`}
                    title={enough ? `Send ${slot.input.count}× ${ing.name}` : `Need ${slot.input.count}, have ${count}`}
                  >
                    <IngredientSvg category={ing.category} rarity={ing.rarity} size={28} />
                    <span className="text-center text-[10px] leading-tight text-slate-200">{ing.name}</span>
                    <span className="absolute right-1.5 top-1 text-[10px] font-bold" style={{ color: RARITY_COLOR[ing.rarity] }}>×{count}</span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-[10px] text-slate-500">
            The chosen goods leave your stash when the worker departs and are traded on arrival.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Small picker listing every settlement in unlocked regions — used from the
 *  Worker Management view's "Trade at Settlement" flow. */
export function SettlementPickerModal({
  onPick, onClose,
}: {
  onPick: (settlement: Settlement) => void;
  onClose: () => void;
}) {
  const unlockedRegions = useGameStore((s) => s.unlockedRegions);
  const cfg = useConfigStore();
  const settlements = Object.values(cfg.settlements)
    .filter((st) => unlockedRegions.includes(regionOfDistance(st.distance).id))
    .sort((a, b) => a.distance - b.distance);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-amber-700/50 bg-slate-900 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-base font-semibold text-amber-800"><Store size={15} /> Trade at…</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"><X size={18} /></button>
        </div>
        {settlements.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No settlements reachable yet — unlock more regions on the map.</p>
        ) : (
          <div className="space-y-2">
            {settlements.map((st) => (
              <button
                key={st.id}
                onClick={() => onPick(st)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 p-3 text-left transition hover:border-amber-500/60 active:scale-[0.99]"
              >
                <Store size={16} className="shrink-0 text-amber-600" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-100">{st.name}</span>
                  <span className="block text-[11px] text-slate-400">
                    {st.slots.length} offer{st.slots.length !== 1 ? "s" : ""} · {fmtDuration(gatherRoundTrip(st.distance, 1))} base round trip
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
