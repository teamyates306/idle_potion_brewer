interface Props {
  category: string;
  size?: number;
}

export default function IngredientSvg({ category, size = 20 }: Props) {
  switch (category) {
    case "root":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
          <path d="M10 17 Q6 12 7 6 Q10 4 13 6 Q14 12 10 17Z" fill="#8B5E3C" />
          <path d="M10 17 Q14 13 16 9" stroke="#6B3F1E" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M10 17 Q6 14 4 10" stroke="#6B3F1E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "petal":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
          <ellipse cx="10" cy="8" rx="4.5" ry="7" fill="#f97316" opacity="0.9" transform="rotate(-20 10 8)" />
          <ellipse cx="10" cy="8" rx="4.5" ry="7" fill="#fb923c" opacity="0.7" transform="rotate(20 10 8)" />
          <circle cx="10" cy="12" r="2.5" fill="#fbbf24" />
        </svg>
      );
    case "fungus":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
          <ellipse cx="10" cy="9" rx="8" ry="5.5" fill="#a16207" />
          <ellipse cx="10" cy="9" rx="6" ry="4" fill="#b87f1a" opacity="0.6" />
          <rect x="8" y="10" width="4" height="7" rx="1.5" fill="#c8922a" />
          <circle cx="7" cy="7.5" r="1" fill="#fde68a" opacity="0.8" />
          <circle cx="12" cy="8" r="1" fill="#fde68a" opacity="0.8" />
        </svg>
      );
    case "crystal":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
          <polygon points="10,2 15,10 10,18 5,10" fill="#67e8f9" opacity="0.85" />
          <polygon points="10,5 13,10 10,15 7,10" fill="#a5f3fc" opacity="0.55" />
          <line x1="10" y1="2" x2="10" y2="18" stroke="#22d3ee" strokeWidth="0.5" opacity="0.7" />
        </svg>
      );
    case "bone":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
          <circle cx="4.5" cy="4.5" r="3" fill="#e8dcc8" />
          <circle cx="15.5" cy="4.5" r="3" fill="#e8dcc8" />
          <circle cx="4.5" cy="15.5" r="3" fill="#e8dcc8" />
          <circle cx="15.5" cy="15.5" r="3" fill="#e8dcc8" />
          <rect x="6" y="6" width="8" height="8" rx="1" fill="#e8dcc8" />
        </svg>
      );
    case "essence":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="6" fill="#c084fc" opacity="0.5" />
          <circle cx="10" cy="10" r="3.5" fill="#d946ef" opacity="0.85" />
          <circle cx="10" cy="10" r="1.8" fill="#fff" opacity="0.9" />
          <path d="M10 2 L10.5 7 L10 5 L9.5 7Z" fill="#e879f9" opacity="0.7" />
          <path d="M10 18 L10.5 13 L10 15 L9.5 13Z" fill="#e879f9" opacity="0.7" />
          <path d="M2 10 L7 10.5 L5 10 L7 9.5Z" fill="#e879f9" opacity="0.7" />
          <path d="M18 10 L13 10.5 L15 10 L13 9.5Z" fill="#e879f9" opacity="0.7" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="7" fill="#64748b" />
          <circle cx="10" cy="10" r="4" fill="#94a3b8" opacity="0.7" />
        </svg>
      );
  }
}
