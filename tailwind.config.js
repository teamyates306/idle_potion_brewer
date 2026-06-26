/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        workshop: "#e9d9b8",
        panel: "#f4e9d0",
        // ── "Parchment & Ink" reskin ──────────────────────────────────────────
        // The UI was authored as a dark theme on Tailwind's `slate` scale, used
        // semantically: high numbers = dark surfaces, low numbers = light text.
        // We override `slate` with an INVERTED warm ramp (low = dark walnut ink,
        // high = light parchment) so every existing `bg-slate-800` / `text-slate-200`
        // flips to a cozy parchment surface / ink text in one move. Art SVGs use
        // raw hex and are unaffected.
        slate: {
          50:  "#fbf5e6",
          100: "#2f2113", // primary text (was brightest) → darkest ink
          200: "#3d2c1a",
          300: "#523f29",
          400: "#6f5a40", // muted labels
          500: "#8a7355", // most-muted text
          600: "#a88f6b",
          700: "#c7ad82", // borders / raised chips → warm tan
          800: "#e9d9b8", // card surfaces → parchment
          900: "#f4e9d0", // panel background → light parchment
          950: "#fbf5e6",
        },
        // Cozy accent set (use directly where neon hues were hardcoded).
        forest: "#5e7a45",
        terracotta: "#a8572f",
        antique: "#b08a33",
        wine: "#8c4a52",
      },
      keyframes: {
        bubble: {
          "0%,100%": { transform: "translateY(0)", opacity: "0.6" },
          "50%": { transform: "translateY(-6px)", opacity: "1" },
        },
        pop: {
          "0%": { transform: "scale(0)", opacity: "0" },
          "60%": { transform: "scale(1.2)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        bubble: "bubble 1.4s ease-in-out infinite",
        pop: "pop 0.4s ease-out",
      },
    },
  },
  plugins: [],
};
