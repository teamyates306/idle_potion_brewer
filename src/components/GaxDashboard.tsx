import { useEffect, useState } from "react";
import { HelpCircle, Landmark } from "lucide-react";
import Modal from "./ui/Modal";
import { useGameStore } from "../store/gameStore";
import {
  ATTR_EMOJI,
  GAX_EVENTS_BY_ID,
  attrLabel,
  attrMultiplier,
  eventDayNumber,
  eventFactor,
  eventPhase,
  gaxDayIndex,
} from "../engine/gax";

const PHASE_LABEL: Record<string, string> = {
  forecast: "Day 1 · Forecast — prices move tomorrow, pivot now",
  peak: "Peak impact — the modifier is live on top of market rates",
  trailing: "Day 5 · Wave breaking — impact halved, normal trade resumes tomorrow",
};

/** The GAX Dashboard — the volatile-attribute board plus the active market
 *  anomaly. Opening it is one of the lazy settle triggers. */
export default function GaxDashboard({ onClose }: { onClose: () => void }) {
  const gaxMarket = useGameStore((s) => s.gaxMarket);
  const settleGax = useGameStore((s) => s.settleGax);
  const [showHelp, setShowHelp] = useState(false);

  // Opening the menu settles the market (spec: one of the lazy triggers).
  useEffect(() => { settleGax(); }, [settleGax]);

  const day = gaxDayIndex(Date.now());
  const event = gaxMarket.event;
  const eventDef = event ? GAX_EVENTS_BY_ID[event.defId] : null;
  const phase = event ? eventPhase(event, day) : null;

  const rows = gaxMarket.board
    .map((attr) => ({
      attr,
      mult: attrMultiplier(gaxMarket, day, attr),
      isEvent: eventFactor(event, day, attr) !== 1,
    }))
    .filter((r) => Math.abs(r.mult - 1) >= 0.005 || r.isEvent)
    .sort((a, b) => Math.abs(b.mult - 1) - Math.abs(a.mult - 1));

  return (
    <Modal title="Grand Alchemical Exchange" onClose={onClose} accent="#b08a33">
      {/* Help toggle */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-xs text-slate-400">Today's market rates by potion attribute.</p>
        <button
          onClick={() => setShowHelp((v) => !v)}
          className={`shrink-0 rounded-full p-1 transition ${showHelp ? "bg-amber-900/40 text-amber-700" : "text-slate-500 hover:text-amber-700"}`}
          title="How the Exchange works"
        >
          <HelpCircle size={15} />
        </button>
      </div>
      {showHelp && (
        <div className="mb-3 rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-[11px] leading-relaxed text-slate-400">
          A potion sells at the blend of its attributes' rates. Selling a lot of one
          kind <span className="text-rose-600 font-medium">floods</span> its markets — but each
          extra sale moves the price less the closer it gets to the ×0.50 floor, and
          small trickle sales are absorbed by natural demand entirely. Quiet markets
          drift back toward ×1.00 daily — gently near normal, sharply if they're
          sitting at an extreme — plus a faint day-to-day wobble, so nothing ever
          feels perfectly still. Only the 10 most volatile attributes trade at live
          rates — the rest hold at ×1.00. News events stack on top of all of this
          for a 5-day wave: a 1-day forecast, 3 peak days, then a fast recovery. The
          market recalculates once per game day (see the clock, top-left).
        </div>
      )}

      {/* Active anomaly */}
      {event && eventDef && phase ? (
        <div className="mb-4 rounded-xl border border-amber-600/50 bg-amber-950/30 p-3">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-amber-600">
            <Landmark size={12} /> Market anomaly · Day {eventDayNumber(event, day)} of 5
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
                  {ATTR_EMOJI[attr]} {attrLabel(attr)} {v > 0 ? "+" : ""}{Math.round(v * 100)}%{!active && " (tomorrow)"}
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-dashed border-slate-700 bg-slate-800/30 p-3 text-center text-[11px] text-slate-500">
          No market anomalies on the wire. The ticker breaks the news a full day
          before any event hits prices.
        </div>
      )}

      {/* The board — compact: emoji, name, rate. Nothing else. */}
      {rows.length === 0 ? (
        <p className="rounded-lg bg-slate-800/40 px-3 py-4 text-center text-xs text-slate-500">
          All markets trading calmly at ×1.00.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {rows.map(({ attr, mult, isEvent }) => {
            const pct = Math.round((mult - 1) * 100);
            const up = pct > 0;
            return (
              <div key={attr} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${isEvent ? "bg-amber-950/30 ring-1 ring-amber-700/40" : "bg-slate-800/50"}`}>
                <span className="shrink-0 text-base leading-none">{ATTR_EMOJI[attr] ?? "❔"}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-200">{attrLabel(attr)}</span>
                <span className={`shrink-0 text-xs font-bold tabular-nums ${up ? "text-emerald-700" : pct < 0 ? "text-rose-600" : "text-slate-400"}`}>
                  {up ? "▲" : pct < 0 ? "▼" : ""} {up ? "+" : ""}{pct}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
