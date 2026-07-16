import type { Adventurer } from "../../data/questSprites";

interface Props {
  adventurer: Adventurer;
  /** Rendered size in CSS px (both width and height). Default 40. */
  size?: number;
}

/**
 * Stacks the three 32x32 sprite layers — face, then hair, then body — exactly
 * as the source art is designed to be composited.
 */
export default function AdventurerSprite({ adventurer, size = 40 }: Props) {
  const layers = [adventurer.faceUrl, adventurer.hairUrl, adventurer.bodyUrl];
  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: size, height: size, imageRendering: "pixelated" }}
    >
      {layers.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          className="absolute inset-0"
          style={{ width: size, height: size, imageRendering: "pixelated" }}
        />
      ))}
    </span>
  );
}
