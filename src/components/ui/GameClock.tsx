import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { gameDay, gameTimeOfDay } from "../../engine/clock";
import { useGameStore } from "../../store/gameStore";

/**
 * The little HUD clock (top-left): current in-game day + time of day.
 * One shared 3-minute day drives this, the day/night ambience and the GAX
 * market, so what the player sees here is exactly what the market trades on.
 *
 * The day COUNT is anchored to the save's gameStartDay (set on new game /
 * hard reset), so a fresh run always begins on Day 1 — the time-of-day dial
 * stays on the shared world clock.
 */
export default function GameClock() {
  const gameStartDay = useGameStore((s) => s.gameStartDay);
  const [, setTick] = useState(0);
  useEffect(() => {
    // In-game minute ≈ 125ms real; 1s updates keep the dial moving smoothly
    // enough without meaningful cost.
    const id = setInterval(() => setTick((n) => (n + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const day = Math.max(1, gameDay(now) - gameStartDay + 1);
  return (
    <div
      className="pointer-events-none flex items-center gap-1.5 rounded-full border border-amber-800/50 bg-[#f4e9d0]/95 px-2.5 py-1 shadow-md"
      title="Guild standard time — one day passes every 3 minutes"
    >
      <Clock size={12} className="text-amber-700" />
      <span className="text-[10px] font-bold tracking-wide text-amber-900 tabular-nums">
        Day {day} · {gameTimeOfDay(now)}
      </span>
    </div>
  );
}
