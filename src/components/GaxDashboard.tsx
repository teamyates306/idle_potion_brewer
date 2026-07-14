import { useEffect } from "react";
import { Landmark, TrendingDown, TrendingUp } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import {
  BOARD_SIZE,
  GAX_EVENTS_BY_ID,
  attrLabel,
  attrMultiplier,
  eventDayNumber,
  eventMultiplier,
  eventPhase,
  gaxHourIndex,
} from "../engine/gax";
import { ATTR_KEYS } from "../engine/potions";

const PHASE_LABEL: Record<string, string> = {
  forecast: "Day 1 · Forecast — prices unmoved, pivot now",
  peak: "Peak impact — prices locked at the event rate",
  trailing: "Day 5 · Wave breaking — halfway back to normal",
};

/** The GAX Dashboard — the top-10 "Volatile Attributes" board plus the active
 *  market anomaly. Opening it is one of the lazy settle triggers. */
export default function GaxDashboard({ onClose }: { onClose: () => void }) {
  const gaxMarket = useGameStore((s) => s.gaxMarket);
  const settleGax = useGameStore((s) => s.settleGax);

  // Opening the menu settles the market (spec: one of the three lazy triggers).
  useEffect(() => { settleGax(); }, [settleGax]);

  const hour = gaxHourIndex(Date.now());
  const event = gaxMarket.event;
  const eventDef = event ? GAX_EVENTS_BY_ID[event.defId] : null;
  const phase = event ? eventPhase(event, hour) : null;

  const rows = gaxMarket.board
    .map((attr) => {
      const mult = attrMultiplier(gaxMarket, hour, attr);
      const isEvent = eventMultiplier(event, hour, attr) !== null;
      const sat = gaxMarket.satiation[attr] ?? 0;
      const state = isEvent ? "Event" : sat > 0 ? "Flooded" : "Starved";
      return { attr, mult, state };
    })
    .sort((a, b) => Math.abs(b.mult - 1) - Math.abs(a.mult - 1));

  const dormantCount = ATTR_KEYS.length - rows.length;

  return (
    <Modal title="Grand Alchemical Exchange" onClose={onClose} accent="#b08a33">
      <p className="mb-3 text-xs text-slate-400">
        Live sale-price multipliers by potion attribute. Flood a market and it pays
        less; neglect one and scarcity pays more. A potion's sale price is the
        blend of its attributes' rates.
      </p>

      {/* Active anomaly */}
      {event && eventDef && phase ? (
        <div className="mb-4 rounded-xl border border-amber-600/50 bg-amber-950/30 p-3">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-amber-600">
            <Landmark size={12} /> Market anomaly · Day {eventDayNumber(event, hour)} of 5
          </div>
          <p className="mb-2 text-sm font-medium leading-snug text-amber-900">{eventDef.headline}</p>
          <p className="mb-2 text-[11px] text-slate-400">{PHASE_LABEL[phase]}</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(eventDef.effects).map(([attr, eff]) => {
              const v = phase === "trailing" ? (eff as number) / 2 : (eff as number);
              const active = phase !== "forecast";
              return (
                <span
                  key={attr}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    !active ? "bg-slate-800 text-slate-400"
                    : v > 0 ? "bg-emerald-900/60 text-emerald-300" : "bg-rose-900/60 text-rose-300"
                  }`}
                >
                  {attrLabel(attr)} {v > 0 ? "+" : ""}{Math.round(v * 100)}%{!active && " (tomorrow)"}
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-dashed border-slate-700 bg-slate-800/30 p-3 text-center text-[11px] text-slate-500">
          No market anomalies on the wire. The ticker will break the news a full
          day before any event hits prices.
        </div>
      )}

      {/* The Top 10 Active Room */}
      <p className="mb-1.5 text-[10px] uppercase tracking-wider text-amber-700">
        Volatile attributes · {rows.length} / {BOARD_SIZE} seats
      </p>
      {rows.length === 0 ? (
        <p className="rounded-lg bg-slate-800/40 px-3 py-4 text-center text-xs text-slate-500">
          All quiet — every market is Dormant at ×1.00.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(({ attr, mult, state }) => {
            const pct = Math.round((mult - 1) * 100);
            const up = pct > 0;
            // Bar: centred at ×1.0, extends toward the deviation (±100% span).
            const frac = Math.min(1, Math.abs(mult - 1));
            return (
              <div key={attr} className="flex items-center gap-2 rounded-lg bg-slate-800/50 px-2.5 py-1.5">
                <span className="w-20 shrink-0 text-xs font-semibold text-slate-200">{attrLabel(attr)}</span>
                <span
                  className={`w-14 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[9px] font-bold ${
                    state === "Event" ? "bg-amber-800/70 text-amber-100"
                    : state === "Flooded" ? "bg-rose-950/70 text-rose-400"
                    : "bg-emerald-950/70 text-emerald-400"
                  }`}
                >
                  {state}
                </span>
                {/* deviation bar */}
                <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-900/70">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-slate-600" />
                  <div
                    className={`absolute inset-y-0 ${up ? "left-1/2 rounded-r-full bg-emerald-600" : "right-1/2 rounded-l-full bg-rose-600"}`}
                    style={{ width: `${frac * 50}%` }}
                  />
                </div>
                <span className={`w-16 shrink-0 text-right text-xs font-bold tabular-nums ${up ? "text-emerald-700" : pct < 0 ? "text-rose-600" : "text-slate-400"}`}>
                  {up ? <TrendingUp size={11} className="mr-0.5 inline" /> : pct < 0 ? <TrendingDown size={11} className="mr-0.5 inline" /> : null}
                  ×{mult.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        {dormantCount} other attributes are Dormant at ×1.00. Markets drift 25%
        back to baseline each quiet market hour; small trickle sales are absorbed
        by natural demand before prices move. Anomalies run a 5-day wave: a 1-day
        forecast, 3 days of locked prices, then a fast recovery.
      </p>
    </Modal>
  );
}
