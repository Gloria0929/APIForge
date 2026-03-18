/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0c",
        mist: "#8b8b96",
        panel: "#111114",
        panel2: "#1a1a1f",
        accent: "#6366f1",
        "accent-hover": "#818cf8",
        signal: "#2a2a30",
        ember: "#ef4444",
        surface: "#222229",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 3px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.25)",
        "panel-lg":
          "0 4px 16px rgba(0, 0, 0, 0.35), 0 16px 48px rgba(0, 0, 0, 0.2)",
        glow: "0 0 0 1px rgba(99, 102, 241, 0.2), 0 4px 16px rgba(99, 102, 241, 0.1)",
      },
      borderRadius: {
        card: "12px",
        input: "8px",
      },
    },
  },
  plugins: [],
};
