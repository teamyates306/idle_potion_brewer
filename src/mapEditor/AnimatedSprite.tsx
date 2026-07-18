import { useEffect, useState } from "react";

/** Plays a horizontal sprite-sheet (frames side by side) by stepping
 *  background-position. frames=1 renders a plain <img>. Shared by the editor
 *  canvas and the in-game HandDrawnMap. */
export default function AnimatedSprite({
  url,
  frames,
  fps = 8,
  scale = 1,
}: {
  url: string;
  frames: number;
  fps?: number;
  scale?: number;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  }, [url]);

  useEffect(() => {
    if (frames <= 1 || fps <= 0) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % frames), 1000 / fps);
    return () => clearInterval(id);
  }, [frames, fps]);

  if (frames <= 1) {
    return <img src={url} alt="" draggable={false} style={{ imageRendering: "pixelated", transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: "top left", display: "block" }} />;
  }
  if (!size) return null;
  const fw = size.w / frames;
  return (
    <div
      style={{
        width: fw,
        height: size.h,
        backgroundImage: `url(${url})`,
        backgroundPosition: `-${frame * fw}px 0`,
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: "top left",
      }}
    />
  );
}
