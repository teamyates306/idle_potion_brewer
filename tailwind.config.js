/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        workshop: "#1e293b",
        panel: "#0f172a",
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
