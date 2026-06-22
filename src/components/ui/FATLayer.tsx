import { useEffect, useState } from "react";
import { subscribeFAT, type FATItem } from "../../util/fat";
import { useSettingsStore } from "../../store/settingsStore";

function FATElement({ item, onDone }: { item: FATItem; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, (item.delay ?? 0) + 1500);
    return () => clearTimeout(t);
  }, []);

  const fontSize =
    item.size === "sm" ? 11 : item.size === "lg" ? 20 : 15;

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
          textShadow: "0 1px 8px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.7)",
          zIndex: 9999,
          // CSS custom property for arc – read by the @keyframes in index.css
          "--fat-arc": `${item.arcX ?? 0}px`,
          animationName: "fat-float",
          animationDuration: "1.25s",
          animationDelay: `${item.delay ?? 0}ms`,
          animationTimingFunction: "ease-out",
          animationFillMode: "both",
        } as React.CSSProperties
      }
    >
      {item.text}
    </div>
  );
}

export default function FATLayer() {
  const [items, setItems] = useState<FATItem[]>([]);
  const toastsEnabled = useSettingsStore((s) => s.toastsEnabled);

  useEffect(() => {
    return subscribeFAT((item) => {
      if (!useSettingsStore.getState().toastsEnabled) return;
      setItems((prev) => [...prev, item]);
    });
  }, []);

  const remove = (id: number) =>
    setItems((prev) => prev.filter((i) => i.id !== id));

  if (!toastsEnabled) return null;

  return (
    <>
      {items.map((item) => (
        <FATElement key={item.id} item={item} onDone={() => remove(item.id)} />
      ))}
    </>
  );
}
