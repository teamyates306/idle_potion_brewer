interface Props {
  size?: number;
  carrying?: boolean;
  color?: string;
}

function lighten(hex: string): string {
  // nudge each channel ~30% toward white for the robe highlight
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + 60);
  const g = Math.min(255, ((n >> 8) & 0xff) + 60);
  const b = Math.min(255, (n & 0xff) + 60);
  return `rgb(${r},${g},${b})`;
}

function darken(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - 30);
  const g = Math.max(0, ((n >> 8) & 0xff) - 30);
  const b = Math.max(0, (n & 0xff) - 30);
  return `rgb(${r},${g},${b})`;
}

export default function WorkerArt({ size = 64, carrying = false, color = "#7c3aed" }: Props) {
  const robeLight = lighten(color);
  const robeDark = darken(color);

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <ellipse cx="32" cy="58" rx="14" ry="3" fill="#000" opacity="0.25" />
      <path d="M20 56 L24 30 Q32 24 40 30 L44 56 Z" fill={color} />
      <path d="M24 30 Q32 24 40 30 L38 38 Q32 34 26 38 Z" fill={robeLight} />
      <circle cx="32" cy="22" r="9" fill="#0f172a" />
      <path d="M23 22 Q23 11 32 11 Q41 11 41 22 Q41 16 32 16 Q23 16 23 22 Z" fill={robeDark} />
      <circle cx="29" cy="22" r="1.6" fill="#67e8f9" />
      <circle cx="35" cy="22" r="1.6" fill="#67e8f9" />
      {carrying ? (
        <>
          <circle cx="46" cy="40" r="7" fill="#a16207" />
          <path d="M41 35 L51 35 L49 41 L43 41 Z" fill="#ca8a04" />
        </>
      ) : (
        <path d="M40 32 L48 40" stroke={robeDark} strokeWidth="4" strokeLinecap="round" />
      )}
    </svg>
  );
}
