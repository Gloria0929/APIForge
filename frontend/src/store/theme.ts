import { defineStore } from "pinia";

export const useThemeStore = defineStore("theme", {
  state: () => ({
    mode: (document.documentElement.dataset.theme === "dark" ? "dark" : "light") as "light" | "dark",
  }),
  actions: {
    toggle() {
      this.mode = this.mode === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = this.mode;
      try {
        localStorage.setItem("apiforge:theme", this.mode);
      } catch {
        // The current tab can still change themes when storage is unavailable.
      }
    },
  },
});
