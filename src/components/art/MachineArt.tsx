interface Props {
  size?: number;
  brewing?: boolean;
  progress?: number; // 0..1 fills the cauldron glow
}

/** The Bubbler — a cauldron-on-contraption brewing machine. */
export default function MachineArt({ size = 110, brewing = false, progress = 0 }: Props) {
  const glow = 0.3 + Math.min(1, progress) * 0.7;
  return (
    <svg width={size} height={size} viewBox="0 0 110 110" fill="none">
      <ellipse cx="55" cy="100" rx="34" ry="5" fill="#000" opacity="0.25" />
      {/* legs / frame */}
      <rect x="22" y="66" width="6" height="30" rx="2" fill="#334155" />
      <rect x="82" y="66" width="6" height="30" rx="2" fill="#334155" />
      {/* cauldron body */}
      <path d="M20 50 Q20 88 55 90 Q90 88 90 50 Z" fill="#1f2937" />
      <path d="M20 50 Q20 88 55 90 Q90 88 90 50 Z" fill="url(#cauldronShade)" opacity="0.4" />
      <ellipse cx="55" cy="50" rx="35" ry="9" fill="#111827" />
      {/* liquid */}
      <ellipse cx="55" cy="50" rx="30" ry="7" fill="#22d3ee" opacity={glow} />
      {/* rim */}
      <ellipse cx="55" cy="50" rx="35" ry="9" fill="none" stroke="#475569" strokeWidth="3" />
      {/* gauge */}
      <circle cx="55" cy="26" r="9" fill="#0f172a" stroke="#475569" strokeWidth="2" />
      <line
        x1="55"
        y1="26"
        x2={55 + 6 * Math.cos((progress * 2 - 0.5) * Math.PI)}
        y2={26 + 6 * Math.sin((progress * 2 - 0.5) * Math.PI)}
        stroke="#f59e0b"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="53" y="34" width="4" height="12" fill="#475569" />
      {/* bubbles */}
      {brewing && (
        <g>
          <circle cx="44" cy="48" r="2.4" fill="#a5f3fc" className="animate-bubble" />
          <circle cx="58" cy="49" r="3" fill="#a5f3fc" className="animate-bubble" style={{ animationDelay: "0.4s" }} />
          <circle cx="68" cy="47" r="2" fill="#a5f3fc" className="animate-bubble" style={{ animationDelay: "0.8s" }} />
        </g>
      )}
      <defs>
        <linearGradient id="cauldronShade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#000" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
      </defs>
    </svg>
  );
}
