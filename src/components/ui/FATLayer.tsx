import React, { useCallback, useEffect, useState } from "react";
import { subscribeFAT, type FATItem } from "../../util/fat";
import { useSettingsStore } from "../../store/settingsStore";

const FATElement = React.memo(function FATElement({ item, onDone }: { item: FATItem; onDone: () => void }) {
  const totalDuration = item.duration ?? 1500;

  useEffect(() => {
    const t = setTimeout(onDone, (item.delay ?? 0) + totalDuration);
    return () => clearTimeout(t);
  }, []);

  const fontSize =
    item.size === "sm" ? 11 : item.size === "lg" ? (item.glow ? 26 : 20) : 15;

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
          fontWeight: 800,
          fontFamily: "'Georgia', 'Times New Roman', serif",
          color: item.color,
          pointerEvents: "none",
          userSelect: "none",
          whiteSpace: "nowrap",
          textShadow: item.glow
            ? `0 0 20px ${item.color}, 0 0 40px ${item.color}, 0 0 6px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.95)`
            : "0 1px 8px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.7)",
          zIndex: 9999,
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
      setItems((prev) => [...prev, item]);
    });
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
