import type { Adventurer } from "../../data/questSprites";

/**
 * SVG-native version of AdventurerSprite — three <image> layers instead of
 * HTML <img>s, so it can be composited directly inside another SVG document
 * (e.g. the workshop wall) without a foreignObject.
 *
 * `x`/`y` place the sprite's bottom-left corner (feet); `flip` mirrors it
 * horizontally in place (the source art always faces right).
 */
export default function AdventurerSpriteSvg({
  adventurer, x, y, size, flip = false,
}: {
  adventurer: Adventurer;
  x: number;
  y: number;
  size: number;
  flip?: boolean;
}) {
  const layers = [adventurer.faceUrl, adventurer.hairUrl, adventurer.bodyUrl];
  return (
    <g transform={`translate(${x},${y - size})`}>
      <g transform={flip ? `translate(${size},0) scale(-1,1)` : undefined}>
        {layers.map((href, i) => (
          <image key={i} href={href} width={size} height={size} style={{ imageRendering: "pixelated" }} />
        ))}
      </g>
    </g>
  );
}
