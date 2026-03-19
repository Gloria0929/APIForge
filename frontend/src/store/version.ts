import { defineStore } from "pinia";

const VERSION_CHECK_KEY = "apiforge:versionCheckShown";

export const useVersionStore = defineStore("version", {
  state: () => ({
    hasUpdate: false,
    latest: "",
    current: "",
  }),
  actions: {
    setUpdate(latest: string, current: string) {
      if (sessionStorage.getItem(VERSION_CHECK_KEY)) return;
      this.hasUpdate = true;
      this.latest = latest;
      this.current = current;
    },
    dismiss() {
      this.hasUpdate = false;
      this.latest = "";
      this.current = "";
      sessionStorage.setItem(VERSION_CHECK_KEY, "1");
    },
    clear() {
      this.hasUpdate = false;
      this.latest = "";
      this.current = "";
      sessionStorage.removeItem(VERSION_CHECK_KEY);
    },
  },
});
