import React, { useCallback, useEffect, useState } from "react";
import { subscribeFAT, type FATItem } from "../../util/fat";
import { useSettingsStore } from "../../store/settingsStore";
import { useGameStore } from "../../store/gameStore";
import { useTantrumStore } from "../../store/tantrumStore";

// Concurrent floating-text cap per graphics quality tier (0 Basic … 3 Very
// High) — mirrors WORKER_CAP_BY_QUALITY in Workshop.tsx. Late-game, a lot of
// workers depositing ingredients at once can spawn many of these together;
// each is its own animated DOM node with a text-shadow glow.
const FAT_CAP_BY_QUALITY = [12, 24, 36, 48] as const;

const FATElement = React.memo(function FATElement({ item, onDone }: { item: FATItem; onDone: () => void }) {
  const totalDuration = item.duration ?? 1500;

  useEffect(() => {
    const t = setTimeout(onDone, (item.delay ?? 0) + totalDuration);
    return () => clearTimeout(t);
  }, []);

  // Silkscreen renders chunky — sizes run slightly smaller than the old serif.
  const fontSize =
    item.size === "sm" ? 9 : item.size === "lg" ? (item.glow ? 22 : 17) : 13;

  const animDuration = item.glow
    ? `${totalDuration}ms`
    : `${Math.round(totalDuration * 0.833)}ms`;

  return (
    <div
      style={
        {
          position: "fixed",
          left: item.x,
          top: item.y,
          fontSize,
          fontWeight: 700,
          fontFamily: "'Silkscreen', monospace",
          color: item.color,
          pointerEvents: "none",
          userSelect: "none",
          whiteSpace: item.glow ? "normal" : "nowrap",
          maxWidth: item.glow ? "80vw" : undefined,
          textAlign: item.glow ? "center" : undefined,
          lineHeight: item.glow ? 1.3 : undefined,
          textShadow: item.glow
            ? `0 0 20px ${item.color}, 0 0 40px ${item.color}, 0 0 6px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.95)`
            : "0 1px 8px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.7)",
          zIndex: 9999,
          // Keep each floating text on its own compositor layer so heavy
          // late-game bursts don't trigger layout/paint on the page.
          willChange: "transform, opacity",
          "--fat-arc": `${item.arcX ?? 0}px`,
          animationName: item.glow ? "fat-float-long" : "fat-float",
          animationDuration: animDuration,
          animationDelay: `${item.delay ?? 0}ms`,
          animationTimingFunction: "ease-out",
          animationFillMode: "both",
        } as React.CSSProperties
      }
    >
      {item.text}
    </div>
  );
});

export default function FATLayer() {
  const [items, setItems] = useState<FATItem[]>([]);
  const toastsEnabled = useSettingsStore((s) => s.toastsEnabled);

  useEffect(() => {
    return subscribeFAT((item) => {
      if (!useSettingsStore.getState().toastsEnabled) return;
      // Hard cap on concurrent floating texts, scaled by graphics quality —
      // when a lot is happening late game, unbounded DOM nodes (each with its
      // own animation + text shadow) are the main source of jitter. Oldest
      // entries are dropped first.
      const qualityCap = FAT_CAP_BY_QUALITY[useGameStore.getState().graphics.quality];
      const cap = useTantrumStore.getState().active ? Math.min(6, qualityCap) : qualityCap;
      setItems((prev) => (prev.length >= cap ? [...prev.slice(prev.length - (cap - 1)), item] : [...prev, item]));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = useCallback((id: number) =>
    setItems((prev) => prev.filter((i) => i.id !== id)), []);

  if (!toastsEnabled) return null;

  return (
    <>
      {items.map((item) => (
        <FATElement key={item.id} item={item} onDone={() => remove(item.id)} />
      ))}
    </>
  );
}
