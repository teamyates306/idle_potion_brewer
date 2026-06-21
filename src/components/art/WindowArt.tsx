interface Props {
  size?: number;
}

/** The window/door to the outside world — clicking opens the Map. */
export default function WindowArt({ size = 96 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      {/* frame */}
      <rect x="14" y="8" width="68" height="80" rx="6" fill="#3f2d1d" />
      <rect x="20" y="14" width="56" height="68" rx="4" fill="#0b1220" />
      {/* night sky + stars */}
      <rect x="20" y="14" width="56" height="34" fill="#0e1a33" />
      <circle cx="34" cy="26" r="1" fill="#cbd5e1" />
      <circle cx="50" cy="22" r="1.2" fill="#e2e8f0" />
      <circle cx="62" cy="30" r="1" fill="#94a3b8" />
      <circle cx="64" cy="20" r="6" fill="#e2e8f0" opacity="0.85" />
      {/* distant hills */}
      <path d="M20 48 Q34 38 48 48 Q62 40 76 48 L76 82 L20 82 Z" fill="#13241b" />
      <path d="M20 60 Q36 52 52 60 Q66 54 76 60 L76 82 L20 82 Z" fill="#0f1c16" />
      {/* mullions */}
      <line x1="48" y1="14" x2="48" y2="82" stroke="#3f2d1d" strokeWidth="3" />
      <line x1="20" y1="48" x2="76" y2="48" stroke="#3f2d1d" strokeWidth="3" />
    </svg>
  );
}
