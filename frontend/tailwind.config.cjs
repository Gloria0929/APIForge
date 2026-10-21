/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--background-color)",
        mist: "var(--text-secondary)",
        panel: "var(--card-background)",
        panel2: "var(--card-background-strong)",
        accent: "rgba(var(--primary-rgb), <alpha-value>)",
        "accent-hover": "rgba(var(--secondary-rgb), <alpha-value>)",
        signal: "var(--surface-hover)",
        ember: "#ef4444",
        surface: "var(--surface-hover)",
        content: "var(--text-primary)",
        regular: "var(--text-regular)",
        muted: "var(--text-muted)",
        warning: "rgba(var(--warning-rgb), <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        panel: "none",
        "panel-lg": "none",
        glow: "none",
      },
      borderRadius: {
        card: "var(--radius-lg)",
        input: "var(--radius-md)",
      },
    },
  },
  plugins: [],
};
