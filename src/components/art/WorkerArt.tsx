import type { WorkerSpecialization } from "../../types";

interface Props {
  size?: number;
  carrying?: boolean;
  color?: string;
  specialization?: WorkerSpecialization;
}

function lighten(hex: string): string {
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

export default function WorkerArt({ size = 64, carrying = false, color = "#7c3aed", specialization = "none" }: Props) {
  const robeLight = lighten(color);
  const robeDark = darken(color);

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <ellipse cx="32" cy="58" rx="14" ry="3" fill="#000" opacity="0.25" />

      {/* Body robe */}
      <path d="M20 56 L24 30 Q32 24 40 30 L44 56 Z" fill={color} />
      <path d="M24 30 Q32 24 40 30 L38 38 Q32 34 26 38 Z" fill={robeLight} />

      {/* Head */}
      <circle cx="32" cy="22" r="9" fill="#0f172a" />
      <path d="M23 22 Q23 11 32 11 Q41 11 41 22 Q41 16 32 16 Q23 16 23 22 Z" fill={robeDark} />

      {/* Eyes — wider for Manic */}
      {specialization === "manic" ? (
        <>
          <circle cx="29" cy="22" r="2.4" fill="#67e8f9" />
          <circle cx="35" cy="22" r="2.4" fill="#67e8f9" />
          <circle cx="29" cy="22" r="0.8" fill="#0f172a" />
          <circle cx="35" cy="22" r="0.8" fill="#0f172a" />
        </>
      ) : (
        <>
          <circle cx="29" cy="22" r="1.6" fill="#67e8f9" />
          <circle cx="35" cy="22" r="1.6" fill="#67e8f9" />
        </>
      )}

      {/* Specialization accessories */}
      {specialization === "explorer" && (
        <>
          {/* Lantern hanging from right arm */}
          <path d="M40 32 L48 40" stroke={robeDark} strokeWidth="4" strokeLinecap="round" />
          <rect x="44" y="38" width="8" height="10" rx="2" fill="#ca8a04" opacity="0.9" />
          <circle cx="48" cy="43" r="3" fill="#fde68a" opacity="0.85" />
          <line x1="48" y1="48" x2="48" y2="52" stroke="#92400e" strokeWidth="1.5" />
          {/* Boots */}
          <rect x="22" y="52" width="7" height="5" rx="1.5" fill={robeDark} />
          <rect x="35" y="52" width="7" height="5" rx="1.5" fill={robeDark} />
        </>
      )}

      {specialization === "caravan" && (
        <>
          {/* Oversized backpack */}
          <rect x="34" y="25" width="14" height="20" rx="3" fill="#92400e" />
          <rect x="36" y="27" width="10" height="8" rx="1.5" fill="#a16207" />
          <rect x="36" y="37" width="10" height="6" rx="1.5" fill="#a16207" />
          <line x1="34" y1="28" x2="28" y2="30" stroke="#78350f" strokeWidth="2" />
          <line x1="34" y1="38" x2="28" y2="40" stroke="#78350f" strokeWidth="2" />
          {/* Resting arm */}
          <path d="M20 34 L14 38" stroke={robeDark} strokeWidth="4" strokeLinecap="round" />
        </>
      )}

      {specialization === "pounder" && (
        <>
          {/* Huge muscular arm + pestle */}
          <path d="M40 28 L52 36" stroke={robeLight} strokeWidth="7" strokeLinecap="round" />
          <ellipse cx="54" cy="38" rx="5" ry="8" fill="#64748b" />
          <ellipse cx="54" cy="46" rx="6" ry="3" fill="#475569" />
          {/* Left arm also beefed up */}
          <path d="M24 28 L16 34" stroke={robeLight} strokeWidth="6" strokeLinecap="round" />
        </>
      )}

      {specialization === "manic" && (
        <>
          {/* Motion-blur trails */}
          <path d="M40 32 L50 38" stroke={robeDark} strokeWidth="3" strokeLinecap="round" opacity="0.4" />
          <path d="M40 32 L52 36" stroke={robeDark} strokeWidth="3" strokeLinecap="round" opacity="0.2" />
          <path d="M40 32 L48 40" stroke={robeDark} strokeWidth="4" strokeLinecap="round" />
          {/* Mug in hand */}
          <rect x="44" y="36" width="8" height="7" rx="1.5" fill="#374151" />
          <path d="M52 38 Q55 38 55 40 Q55 42 52 42" stroke="#6b7280" strokeWidth="1.5" fill="none" />
          {/* Steam lines */}
          <path d="M46 34 Q47 31 46 29" stroke="#e5e7eb" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
          <path d="M49 33 Q50 30 49 28" stroke="#e5e7eb" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
        </>
      )}

      {/* Default arm (shown for none/standard when not carrying) */}
      {(specialization === "none" || specialization === "standard") && (
        carrying ? (
          <>
            <circle cx="46" cy="40" r="7" fill="#a16207" />
            <path d="M41 35 L51 35 L49 41 L43 41 Z" fill="#ca8a04" />
          </>
        ) : (
          <path d="M40 32 L48 40" stroke={robeDark} strokeWidth="4" strokeLinecap="round" />
        )
      )}

    </svg>
  );
}
