import { useEffect, useRef, useState } from "react";
import { Pencil, Check } from "lucide-react";

/**
 * Inline name editor: renders as plain text with a small pencil affordance;
 * clicking swaps to an input. Enter/✓ saves, Escape cancels, blur saves.
 * Used to rename workers and brewers.
 */
export default function EditableName({
  value,
  onSave,
  className = "",
  inputClassName = "",
  iconClassName = "text-slate-500 hover:bg-slate-800 hover:text-slate-200",
  iconSize = 12,
  maxLength = 18,
  truncate = true,
}: {
  value: string;
  onSave: (name: string) => void;
  /** Applied to the display text. */
  className?: string;
  /** Applied to the input while editing. */
  inputClassName?: string;
  /** Applied to the pencil button — override for surfaces darker/lighter than the default slate panel. */
  iconClassName?: string;
  iconSize?: number;
  maxLength?: number;
  /** Ellipsize the display text instead of letting the container grow to fit it. Default true (fixed-width cards); set false when the container should auto-expand, e.g. a hanging sign. */
  truncate?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      // Focus after mount so the caret lands in the field
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, value]);

  const commit = () => {
    const clean = draft.trim();
    if (clean && clean !== value) onSave(clean);
    setEditing(false);
  };

  if (!editing) {
    return (
      <span className={`inline-flex items-center gap-1.5 ${truncate ? "min-w-0" : ""}`}>
        <span className={`${truncate ? "truncate" : "whitespace-nowrap"} ${className}`}>{value}</span>
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className={`shrink-0 rounded p-0.5 transition ${iconClassName}`}
          title="Rename"
        >
          <Pencil size={iconSize} />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") setEditing(false);
        }}
        className={`min-w-0 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-slate-100 focus:border-amber-600 focus:outline-none ${inputClassName}`}
        style={{ width: `${Math.max(6, Math.min(maxLength, draft.length + 2))}ch` }}
      />
      <button
        onMouseDown={(e) => e.preventDefault() /* keep input from blurring before click */}
        onClick={commit}
        className="shrink-0 rounded p-0.5 text-emerald-700 transition hover:bg-slate-800"
        title="Save name"
      >
        <Check size={14} />
      </button>
    </span>
  );
}
