interface Props {
  size?: number;
  carrying?: boolean;
}

/** A small robed alchemy hand. Pure SVG (see §2 — SVG for all game art). */
export default function WorkerArt({ size = 64, carrying = false }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {/* shadow */}
      <ellipse cx="32" cy="58" rx="14" ry="3" fill="#000" opacity="0.25" />
      {/* robe */}
      <path d="M20 56 L24 30 Q32 24 40 30 L44 56 Z" fill="#7c3aed" />
      <path d="M24 30 Q32 24 40 30 L38 38 Q32 34 26 38 Z" fill="#8b5cf6" />
      {/* head + hood */}
      <circle cx="32" cy="22" r="9" fill="#0f172a" />
      <path d="M23 22 Q23 11 32 11 Q41 11 41 22 Q41 16 32 16 Q23 16 23 22 Z" fill="#6d28d9" />
      {/* glowing eyes */}
      <circle cx="29" cy="22" r="1.6" fill="#67e8f9" />
      <circle cx="35" cy="22" r="1.6" fill="#67e8f9" />
      {/* arms / sack */}
      {carrying ? (
        <>
          <circle cx="46" cy="40" r="7" fill="#a16207" />
          <path d="M41 35 L51 35 L49 41 L43 41 Z" fill="#ca8a04" />
        </>
      ) : (
        <path d="M40 32 L48 40" stroke="#6d28d9" strokeWidth="4" strokeLinecap="round" />
      )}
    </svg>
  );
}
