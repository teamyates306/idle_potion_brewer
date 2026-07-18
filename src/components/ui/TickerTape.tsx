import { useEffect, useMemo, useState } from "react";
import { useGameStore } from "../../store/gameStore";
import {
  GAX_EVENTS_BY_ID,
  attrLabel,
  attrMultiplier,
  eventDayNumber,
  eventPhase,
  gaxDayIndex,
} from "../../engine/gax";
import { IconNewspaper, IconColumns } from "./icons";

/**
 * The GAX ticker tape — a global marquee pinned to the bottom of the screen
 * once the Exchange is unlocked. Shows the active event headline (with its
 * wave phase) and the current top market movers. Tapping it opens the
 * dashboard. Pure CSS animation: one long strip duplicated for a seamless loop.
 */
export default function TickerTape({ onOpen }: { onOpen: () => void }) {
  const gaxUnlocked = useGameStore((s) => s.gaxUnlocked);
  const gaxMarket = useGameStore((s) => s.gaxMarket);
  const settleGax = useGameStore((s) => s.settleGax);

  // Nudge a re-read every 20s so phase tags / multipliers stay fresh even
  // while the store is quiet (the settle itself is lazy and cheap).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!gaxUnlocked) return;
    const id = setInterval(() => { settleGax(); setTick((n) => n + 1); }, 20_000);
    return () => clearInterval(id);
  }, [gaxUnlocked, settleGax]);

  const segments = useMemo(() => {
    if (!gaxUnlocked) return [];
    const today = gaxDayIndex(Date.now());
    const out: { text: string; tone: "news" | "up" | "down" | "flat"; icon?: "newspaper" | "columns" }[] = [];

    if (gaxMarket.event) {
      const def = GAX_EVENTS_BY_ID[gaxMarket.event.defId];
      if (def) {
        const phase = eventPhase(gaxMarket.event, today);
        const day = eventDayNumber(gaxMarket.event, today);
        const tag =
          phase === "forecast" ? "FORECAST — markets react tomorrow" :
          phase === "peak" ? `DAY ${day} — MARKETS GRIPPED` :
          "WAVE BREAKING — prices easing";
        out.push({ text: `${def.headline} [${tag}]`, tone: "news", icon: "newspaper" });
        for (const [attr, eff] of Object.entries(def.effects)) {
          if (phase === "forecast") continue;
          const v = phase === "trailing" ? (eff as number) / 2 : (eff as number);
          out.push({
            text: `${attrLabel(attr)} ${v > 0 ? "▲" : "▼"} ${v > 0 ? "+" : ""}${Math.round(v * 100)}%`,
            tone: v > 0 ? "up" : "down",
          });
        }
      }
    }

    const movers = gaxMarket.board
      .map((attr) => ({ attr, mult: attrMultiplier(gaxMarket, today, attr) }))
      .filter((x) => Math.abs(x.mult - 1) >= 0.02)
      .sort((a, b) => Math.abs(b.mult - 1) - Math.abs(a.mult - 1))
      .slice(0, 8);
    for (const { attr, mult } of movers) {
      const pct = Math.round((mult - 1) * 100);
      out.push({
        text: `${attrLabel(attr)} ${pct > 0 ? "▲" : "▼"} ${pct > 0 ? "+" : ""}${pct}%`,
        tone: pct > 0 ? "up" : "down",
      });
    }

    if (out.length === 0) {
      out.push({ text: "GAX: all markets trading calmly at 1.00× — the auditors are bored.", tone: "flat", icon: "columns" });
    }
    return out;
  }, [gaxUnlocked, gaxMarket]);

  if (!gaxUnlocked) return null;

  const strip = (
    <span className="inline-flex items-center">
      {segments.map((s, i) => (
        <span
          key={i}
          className={`mx-4 whitespace-nowrap text-[10px] font-bold tracking-wide ${
            s.tone === "up" ? "text-emerald-300" :
            s.tone === "down" ? "text-rose-300" :
            s.tone === "news" ? "text-amber-200" : "text-slate-300"
          }`}
        >
          {s.icon === "newspaper" && <IconNewspaper className="mr-1 inline" />}
          {s.icon === "columns" && <IconColumns className="mr-1 inline" />}
          {s.text}
          <span className="ml-4 text-amber-700/60">◆</span>
        </span>
      ))}
    </span>
  );

  // Duration scales with content so long news doesn't whip past.
  const durationS = Math.max(24, segments.reduce((a, s) => a + s.text.length, 0) * 0.28);

  return (
    <button
      onClick={onOpen}
      className="absolute inset-x-0 bottom-0 z-[6] h-6 cursor-pointer overflow-hidden border-t border-amber-900/60 bg-[#2c1f10]/95 backdrop-blur-sm"
      title="Open the Grand Alchemical Exchange"
    >
      <div
        className="ticker-track flex h-full w-max items-center"
        style={{ animationDuration: `${durationS}s` }}
      >
        {strip}
        {strip}
      </div>
    </button>
  );
}
